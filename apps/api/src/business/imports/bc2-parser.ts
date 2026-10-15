import { BadRequestException } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

type XmlNode = Record<string, unknown>;

export type Bc2Student = {
  order: number;
  registrationCode: string;
  fullName: string;
  familyName: string | null;
  givenName: string | null;
  dateOfBirth: string | null;
  identityNumber: string | null;
  fileNumber: string | null;
  requestedLicenseClass: string | null;
  previousLicenseNumber: string | null;
  previousLicenseClass: string | null;
  completionCertificateNumber: string | null;
  certificateNumber: string | null;
  medicalCertificate: string | null;
  examContentCode: string | null;
  note: string | null;
  sourceData: Record<string, unknown>;
};

export type Bc2Document = {
  transactionCode: string | null;
  senderName: string | null;
  report: {
    bc2Code: string;
    bc1Code: string | null;
    schoolCode: string;
    documentNumber: string | null;
    documentDate: string | null;
    declaredCount: number | null;
    trainingClass: string | null;
    licenseClass: string | null;
  };
  students: Bc2Student[];
};

function obj(value: unknown): XmlNode {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as XmlNode;
  }

  return {};
}

function text(node: XmlNode, name: string): string | null {
  const value = node[name];

  if (value === undefined || value === null || typeof value === 'object') {
    return null;
  }

  return String(value).normalize('NFC').trim() || null;
}

function must(node: XmlNode, name: string): string {
  const result = text(node, name);

  if (!result) {
    throw new BadRequestException(`BC2 thiếu trường bắt buộc ${name}.`);
  }

  return result;
}

function dateValue(value: string | null): string | null {
  if (!value) return null;

  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);

  if (!match) {
    throw new BadRequestException(`Ngày không đúng định dạng: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function numberValue(value: string | null): number | null {
  if (value === null) return null;

  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`Giá trị số không hợp lệ: ${value}`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new BadRequestException(`Giá trị số quá lớn: ${value}`);
  }

  return parsed;
}

function normalizeSource(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSource);

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeSource(item)]),
    );
  }

  return typeof value === 'string' ? value.normalize('NFC') : value;
}

export function parseBc2(buffer: Buffer): Bc2Document {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');

  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new BadRequestException(
      'XML chứa DTD hoặc ENTITY không được hỗ trợ.',
    );
  }

  if (XMLValidator.validate(xml) !== true) {
    throw new BadRequestException('File XML không đúng cú pháp.');
  }

  const parser = new XMLParser({
    parseTagValue: false,
    parseAttributeValue: false,
    ignoreAttributes: true,
    processEntities: false,
    trimValues: true,
  });

  const root = obj(parser.parse(xml));

  if (!root.BAO_CAO2) {
    throw new BadRequestException('File không phải báo cáo BC2.');
  }

  const reportRoot = obj(root.BAO_CAO2);
  const header = obj(reportRoot.HEADER);
  const data = obj(reportRoot.DATA);
  const report = obj(data.BCII);
  const container = obj(data.NGUOI_LXS);

  const raw = container.NGUOI_LX;
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (!rows.length) {
    throw new BadRequestException('BC2 không có danh sách thí sinh.');
  }

  const seen = new Set<string>();

  const students: Bc2Student[] = rows.map((row, index) => {
    const source = obj(row);
    const dossier = obj(source.HO_SO);

    const registrationCode = must(source, 'MA_DK');

    if (seen.has(registrationCode)) {
      throw new BadRequestException(
        `MA_DK trùng trong cùng báo cáo: ${registrationCode}`,
      );
    }

    seen.add(registrationCode);

    return {
      order: numberValue(text(source, 'SO_TT')) ?? index + 1,
      registrationCode,
      fullName: must(source, 'HO_VA_TEN'),
      familyName: text(source, 'HO_TEN_DEM'),
      givenName: text(source, 'TEN'),
      dateOfBirth: dateValue(text(source, 'NGAY_SINH')),
      identityNumber: text(source, 'SO_CMT'),
      fileNumber: text(dossier, 'SO_HO_SO'),
      requestedLicenseClass: text(dossier, 'HANG_DE_NGHi_SH'),
      previousLicenseNumber: text(dossier, 'SO_GPLX_DA_CO'),
      previousLicenseClass: text(dossier, 'HANG_GPLX_DA_CO'),
      completionCertificateNumber: text(dossier, 'SO_GIAY_CNTN'),
      certificateNumber: text(dossier, 'SO_CCN'),
      medicalCertificate: text(dossier, 'GIAY_CNSK'),
      examContentCode: text(dossier, 'NOI_DUNG_SH'),
      note: text(dossier, 'BC2_GHICHU'),
      sourceData: normalizeSource(source) as Record<string, unknown>,
    };
  });

  const declaredCount = numberValue(text(report, 'SO_THI_SINH'));
  const headerCount = numberValue(text(header, 'TONG_SO_BAN_GHI'));

  if (
    (declaredCount !== null && declaredCount !== students.length) ||
    (headerCount !== null && headerCount !== students.length)
  ) {
    throw new BadRequestException(
      `Số thí sinh khai báo không khớp ${students.length} bản ghi XML.`,
    );
  }

  return {
    transactionCode: text(header, 'MA_GIAO_DICH'),
    senderName: text(header, 'TEN_DV_GUI'),
    report: {
      bc2Code: must(report, 'MA_BCII'),
      bc1Code: text(report, 'MA_BCI'),
      schoolCode: must(report, 'MA_CSDT'),
      documentNumber: text(report, 'SO_CV_BCII'),
      documentDate: dateValue(text(report, 'NGAY_CV_BCII')),
      declaredCount,
      trainingClass: text(report, 'MA_HANG_DAO_TAO'),
      licenseClass: text(report, 'HANG_GPLX'),
    },
    students,
  };
}
