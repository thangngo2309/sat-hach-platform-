import { BadRequestException } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

type XmlObject = Record<string, unknown>;

export type Bc1Student = {
  registrationCode: string;
  fullName: string;
  familyName: string | null;
  givenName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  identityNumber: string | null;
  nationalityCode: string | null;
  nationalityName: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  fileNumber: string | null;
  order: number | null;
};

export type Bc1Document = {
  transactionCode: string | null;
  reportCode: string | null;
  school: {
    code: string;
    name: string;
    provinceCode: string | null;
    provinceName: string | null;
  };
  course: {
    code: string;
    name: string;
    licenseClass: string | null;
    trainingClass: string | null;
    openingDate: string | null;
    closingDate: string | null;
    declaredCount: number | null;
  };
  students: Bc1Student[];
};

function object(value: unknown): XmlObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlObject)
    : {};
}

function value(node: XmlObject, key: string): string | null {
  const raw = node[key];

  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return null;

  const text = String(raw).normalize('NFC').trim();
  return text.length ? text : null;
}

function required(node: XmlObject, key: string): string {
  const text = value(node, key);

  if (!text) {
    throw new BadRequestException(`File BC1 thiếu trường bắt buộc: ${key}`);
  }

  return text;
}

function dateValue(input: string | null): string | null {
  if (!input) return null;

  let year: number;
  let month: number;
  let day: number;

  if (/^\d{8}$/.test(input)) {
    year = Number(input.slice(0, 4));
    month = Number(input.slice(4, 6));
    day = Number(input.slice(6, 8));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    year = Number(input.slice(0, 4));
    month = Number(input.slice(5, 7));
    day = Number(input.slice(8, 10));
  } else {
    throw new BadRequestException(`Ngày không đúng định dạng: ${input}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Ngày không hợp lệ: ${input}`);
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function integer(input: string | null): number | null {
  if (input === null) return null;

  if (!/^\d+$/.test(input)) {
    throw new BadRequestException(`Số không hợp lệ: ${input}`);
  }

  const number = Number(input);

  if (!Number.isSafeInteger(number)) {
    throw new BadRequestException(`Số quá lớn: ${input}`);
  }

  return number;
}

export function parseBc1(buffer: Buffer): Bc1Document {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');

  // Do not process external entities or DTD declarations.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new BadRequestException(
      'File XML chứa khai báo DTD hoặc ENTITY không được hỗ trợ.',
    );
  }

  const validation = XMLValidator.validate(xml);

  if (validation !== true) {
    throw new BadRequestException('File XML không đúng cú pháp.');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: false,
  });

  let document: XmlObject;

  try {
    document = object(parser.parse(xml));
  } catch {
    throw new BadRequestException('Không thể đọc file XML.');
  }

  const report = object(document.BAO_CAO1);

  if (!document.BAO_CAO1) {
    throw new BadRequestException('File không phải báo cáo BC1 (BAO_CAO1).');
  }

  const header = object(report.HEADER);
  const data = object(report.DATA);
  const courseNode = object(data.KHOA_HOC);
  const studentContainer = object(data.NGUOI_LXS);

  const raw = studentContainer.NGUOI_LX;
  const rawStudents = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (!rawStudents.length) {
    throw new BadRequestException('File BC1 không có danh sách NGUOI_LX.');
  }

  const seen = new Set<string>();

  const students = rawStudents.map((rawStudent, index) => {
    const student = object(rawStudent);
    const record = object(student.HO_SO);

    const registrationCode = required(student, 'MA_DK');

    if (seen.has(registrationCode)) {
      throw new BadRequestException(
        `MA_DK bị trùng trong file: ${registrationCode}`,
      );
    }

    seen.add(registrationCode);

    return {
      registrationCode,
      fullName: required(student, 'HO_VA_TEN'),
      familyName: value(student, 'HO_TEN_DEM'),
      givenName: value(student, 'TEN'),
      dateOfBirth: dateValue(value(student, 'NGAY_SINH')),
      gender: value(student, 'GIOI_TINH'),
      identityNumber: value(student, 'SO_CMT'),
      nationalityCode: value(student, 'MA_QUOC_TICH'),
      nationalityName: value(student, 'TEN_QUOC_TICH'),
      permanentAddress: value(student, 'NOI_TT'),
      currentAddress: value(student, 'NOI_CT'),
      fileNumber: value(record, 'SO_HO_SO'),
      order: integer(value(student, 'SO_TT')) ?? index + 1,
    };
  });

  const declaredCount = integer(value(courseNode, 'SO_HOC_SINH'));

  if (declaredCount !== null && declaredCount !== students.length) {
    throw new BadRequestException(
      `Số học viên khai báo (${declaredCount}) khác số bản ghi thực tế (${students.length}).`,
    );
  }

  return {
    transactionCode: value(header, 'MA_GIAO_DICH'),
    reportCode: value(courseNode, 'MA_BCI'),
    school: {
      code: required(courseNode, 'MA_CSDT'),
      name: required(courseNode, 'TEN_CSDT'),
      provinceCode: value(courseNode, 'MA_SO_GTVT'),
      provinceName: value(courseNode, 'TEN_SO_GTVT'),
    },
    course: {
      code: required(courseNode, 'MA_KHOA_HOC'),
      name: required(courseNode, 'TEN_KHOA_HOC'),
      licenseClass: value(courseNode, 'HANG_GPLX'),
      trainingClass: value(courseNode, 'MA_HANG_DAO_TAO'),
      openingDate: dateValue(value(courseNode, 'NGAY_KHAI_GIANG')),
      closingDate: dateValue(value(courseNode, 'NGAY_BE_GIANG')),
      declaredCount,
    },
    students,
  };
}
