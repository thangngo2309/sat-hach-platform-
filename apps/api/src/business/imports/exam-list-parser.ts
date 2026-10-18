import { BadRequestException } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

type XmlRecord = Record<string, unknown>;

export type ExamListCandidate = {
  registrationCode: string;
  fullName: string;
  familyName: string | null;
  givenName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  identityNumber: string | null;
  nationalityCode: string | null;
  schoolCode: string | null;
  courseCode: string | null;
  licenseClass: string | null;
  examinationNumber: string | null;
  fileNumber: string | null;
  examinationContent: string | null;
  candidateType: 'training' | 'independent' | 'unknown';
};

export type ExamListDocument = {
  transactionCode: string | null;
  sourceUnitCode: string | null;
  sourceUnitName: string | null;
  declaredCount: number | null;
  session: {
    code: string;
    examinationCenterCode: string;
    examDate: string | null;
    examTime: string | null;
    decisionNumber: string | null;
    decisionDate: string | null;
  };
  candidates: ExamListCandidate[];
};

function record(value: unknown): XmlRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlRecord)
    : {};
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function field(node: XmlRecord, name: string): string | null {
  return text(node[name]);
}

function required(node: XmlRecord, name: string): string {
  const value = field(node, name);
  if (!value) {
    throw new BadRequestException(`Thiếu trường bắt buộc ${name}.`);
  }
  return value;
}

function date(value: string | null): string | null {
  if (!value) return null;

  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
  }

  return normalized;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function parseExamList(buffer: Buffer): ExamListDocument {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');

  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new BadRequestException(
      'Không hỗ trợ file XML chứa DOCTYPE hoặc ENTITY.',
    );
  }

  if (XMLValidator.validate(xml) !== true) {
    throw new BadRequestException('File XML không đúng cú pháp.');
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
  });

  const root = record(parser.parse(xml));

  if (!root.SAT_HACH) {
    throw new BadRequestException('File không phải danh sách SAT_HACH.');
  }

  const report = record(root.SAT_HACH);
  const header = record(report.HEADER);
  const data = record(report.DATA);
  const session = record(data.KY_SH);

  // KQSH cũng có root SAT_HACH nhưng thường thiếu
  // MATTSH/NGAYSH. Không được import nhầm vào danh sách.
  const examinationCenterCode = required(session, 'MATTSH');
  const examDate = date(required(session, 'NGAYSH'));

  const raw = record(data.NGUOI_LXS).NGUOI_LX;
  const people = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (!people.length) {
    throw new BadRequestException('File không có thí sinh.');
  }

  const seenRegistrations = new Set<string>();
  const seenNumbers = new Set<string>();

  const candidates = people.map((item, index) => {
    const person = record(item);
    const dossier = record(person.HO_SO);

    const registrationCode = required(person, 'MA_DK');
    const fullName = normalizeName(required(person, 'HO_VA_TEN'));
    const examinationNumber = field(dossier, 'SO_BAO_DANH');

    if (seenRegistrations.has(registrationCode)) {
      throw new BadRequestException(
        `Trùng MA_DK tại thí sinh thứ ${index + 1}: ${registrationCode}`,
      );
    }

    seenRegistrations.add(registrationCode);

    if (examinationNumber) {
      if (seenNumbers.has(examinationNumber)) {
        throw new BadRequestException(
          `Trùng số báo danh ${examinationNumber}.`,
        );
      }
      seenNumbers.add(examinationNumber);
    }

    const schoolCode = field(dossier, 'MA_CSDT');

    const candidateType =
      schoolCode === '48099'
        ? 'independent'
        : schoolCode
          ? 'training'
          : 'unknown';

    const nestedSessionCode = field(dossier, 'MA_KY_SH');

    if (
      nestedSessionCode &&
      nestedSessionCode !== required(session, 'MAKYSH')
    ) {
      throw new BadRequestException(
        `MA_KY_SH không khớp ở thí sinh ${registrationCode}.`,
      );
    }

    return {
      registrationCode,
      fullName,
      familyName: field(person, 'HO_TEN_DEM'),
      givenName: field(person, 'TEN'),
      dateOfBirth: date(field(person, 'NGAY_SINH')),
      gender: field(person, 'GIOI_TINH'),
      identityNumber: field(person, 'SO_CMT'),
      nationalityCode: field(person, 'MA_QUOC_TICH'),
      schoolCode,
      courseCode: field(dossier, 'MA_KHOA_HOC'),
      licenseClass: field(dossier, 'HANG_GPLX'),
      examinationNumber,
      fileNumber: field(dossier, 'SO_HO_SO'),
      examinationContent: field(dossier, 'NOI_DUNG_SH'),
      candidateType,
    } satisfies ExamListCandidate;
  });

  const declaredCountText = field(header, 'TONG_SO_BAN_GHI');
  const declaredCount = declaredCountText ? Number(declaredCountText) : null;

  if (
    declaredCount !== null &&
    (!Number.isSafeInteger(declaredCount) ||
      declaredCount !== candidates.length)
  ) {
    throw new BadRequestException(
      `Số bản ghi khai báo (${declaredCountText}) không khớp số thí sinh thực tế (${candidates.length}).`,
    );
  }

  return {
    transactionCode: field(header, 'MA_GIAO_DICH'),
    sourceUnitCode: field(header, 'MA_DV_GUI'),
    sourceUnitName: field(header, 'TEN_DV_GUI'),
    declaredCount,
    session: {
      code: required(session, 'MAKYSH'),
      examinationCenterCode,
      examDate,
      examTime: field(session, 'GIOSH'),
      decisionNumber: field(session, 'SOQD'),
      decisionDate: date(field(session, 'NGAYQD')),
    },
    candidates,
  };
}
