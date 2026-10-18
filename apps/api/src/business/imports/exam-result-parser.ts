import { BadRequestException } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

type XmlNode = Record<string, unknown>;

export type ExamPartResult = {
  examType: string;
  resultStatus: string | null;
  examDate: string | null;
  score: string | null;
  maximumScore: string | null;
  examiner: string | null;
  examinerComment: string | null;
  note: string | null;
};

export type ExamCandidateResult = {
  registrationCode: string;
  fullName: string | null;
  identityNumber: string | null;
  examinationNumber: string | null;
  fileNumber: string | null;
  resultStatus: string | null;
  theoryScore: string | null;
  practicalScore: string | null;
  roadScore: string | null;
  parts: ExamPartResult[];
};

export type ExamResultDocument = {
  transactionCode: string | null;
  sourceUnitCode: string | null;
  declaredCount: number | null;
  sessionCode: string;
  candidates: ExamCandidateResult[];
};

function node(value: unknown): XmlNode {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlNode)
    : {};
}

function value(source: XmlNode, key: string): string | null {
  const item = source[key];

  if (item === null || item === undefined) {
    return null;
  }

  const result = String(item).trim();
  return result || null;
}

function required(source: XmlNode, key: string): string {
  const result = value(source, key);

  if (!result) {
    throw new BadRequestException(`File KQSH thiếu trường ${key}.`);
  }

  return result;
}

function items(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null;

  const normalized = /^\d{8}$/.test(raw)
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException(`Ngày sát hạch không hợp lệ: ${raw}`);
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new BadRequestException(`Ngày sát hạch không hợp lệ: ${raw}`);
  }

  return normalized;
}

export function parseExamResult(buffer: Buffer): ExamResultDocument {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');

  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new BadRequestException('Không hỗ trợ XML chứa DOCTYPE hoặc ENTITY.');
  }

  if (XMLValidator.validate(xml) !== true) {
    throw new BadRequestException('File KQSH không đúng cú pháp XML.');
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
    trimValues: true,
    processEntities: false,
  });

  const root = node(parser.parse(xml));

  if (!root.SAT_HACH) {
    throw new BadRequestException('File không có thẻ SAT_HACH.');
  }

  const report = node(root.SAT_HACH);
  const header = node(report.HEADER);
  const data = node(report.DATA);
  const session = node(data.KY_SH);

  const sessionCode = required(session, 'MAKYSH');

  const people = items(node(data.NGUOI_LXS).NGUOI_LX);

  if (!people.length) {
    throw new BadRequestException('File KQSH không có thí sinh.');
  }

  const seen = new Set<string>();

  const candidates = people.map((raw, index) => {
    const person = node(raw);
    const dossier = node(person.HO_SO);

    const registrationCode = required(person, 'MA_DK');

    if (seen.has(registrationCode)) {
      throw new BadRequestException(
        `Trùng MA_DK trong KQSH: ${registrationCode}`,
      );
    }

    seen.add(registrationCode);

    const dossierSession = value(dossier, 'MA_KY_SH');

    if (dossierSession && dossierSession !== sessionCode) {
      throw new BadRequestException(
        `Thí sinh thứ ${index + 1} thuộc kỳ ${dossierSession}, không phải ${sessionCode}.`,
      );
    }

    const rawParts = items(node(person.THI_SINH_KQSHS).THI_SINH_KQSH);

    const parts = rawParts.map((rawPart) => {
      const part = node(rawPart);

      const partSession = value(part, 'MAKYSH');
      const partNumber = value(part, 'SOBAODANH');
      const dossierNumber = value(dossier, 'SO_BAO_DANH');

      if (partSession && partSession !== sessionCode) {
        throw new BadRequestException(
          `Mã kỳ sát hạch của phần thi không khớp: ${registrationCode}.`,
        );
      }

      if (partNumber && dossierNumber && partNumber !== dossierNumber) {
        throw new BadRequestException(
          `Số báo danh của phần thi không khớp: ${registrationCode}.`,
        );
      }

      return {
        examType: required(part, 'LOAISH'),
        resultStatus: value(part, 'KETQUASH'),
        examDate: parseDate(value(part, 'NGAYSH')),
        score: value(part, 'DIEMSH'),
        maximumScore: value(part, 'DIEMTOIDA'),
        examiner: value(part, 'SATHACHVIEN'),
        examinerComment: value(part, 'NHANXETSHV'),
        note: value(part, 'GHICHU'),
      };
    });

    return {
      registrationCode,
      fullName: value(person, 'HO_VA_TEN'),
      identityNumber: value(person, 'SO_CMT'),
      examinationNumber: value(dossier, 'SO_BAO_DANH'),
      fileNumber: value(dossier, 'SO_HO_SO'),
      resultStatus: value(dossier, 'KET_QUA_SH'),
      theoryScore: value(dossier, 'KQ_SH_LYTHUYET'),
      practicalScore: value(dossier, 'KQ_SH_HINH'),
      roadScore: value(dossier, 'KQ_SH_DUONG'),
      parts,
    } satisfies ExamCandidateResult;
  });

  const declaredText = value(header, 'TONG_SO_BAN_GHI');

  const declaredCount = declaredText ? Number(declaredText) : null;

  if (
    declaredCount !== null &&
    (!Number.isSafeInteger(declaredCount) ||
      declaredCount !== candidates.length)
  ) {
    throw new BadRequestException(
      `Số thí sinh KQSH không khớp HEADER: ${declaredText}/${candidates.length}.`,
    );
  }

  // Không cho import nhầm file danh sách 48.
  if (
    candidates.every(
      (candidate) => !candidate.resultStatus && !candidate.parts.length,
    )
  ) {
    throw new BadRequestException(
      'File không chứa dữ liệu KQSH. Có thể bạn đã chọn nhầm file 48.',
    );
  }

  return {
    transactionCode: value(header, 'MA_GIAO_DICH'),
    sourceUnitCode: value(header, 'MA_DV_GUI'),
    declaredCount,
    sessionCode,
    candidates,
  };
}
