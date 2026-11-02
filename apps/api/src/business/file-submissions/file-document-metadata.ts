import { BadRequestException } from '@nestjs/common';
import type { FileType } from './file-submissions.service.js';

export type DocumentMetadata = Record<string, string>;

const FIELDS: Record<FileType, readonly string[]> = {
  bc1: [
    'trainingLicenseClass',
    'openingDate',
    'closingDate',
    'documentNumber',
    'documentDate',
  ],
  bc2: [
    'trainingLicenseClass',
    'expectedExamDate',
    'documentNumber',
    'documentDate',
  ],
  exam_result: [
    'examinationLicenseClass',
    'examinationSessionId',
    'examinationDate',
    'itOfficer',
  ],
  exam_48: [],
  bc2_result: [],
};

const DATE_FIELDS = new Set([
  'openingDate',
  'closingDate',
  'documentDate',
  'expectedExamDate',
  'examinationDate',
]);
const OPTIONAL_TYPES = new Set<FileType>(['exam_48', 'bc2_result']);

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function parseDocumentMetadata(
  type: FileType,
  raw: unknown,
): DocumentMetadata {
  if (raw === undefined || raw === null || raw === '') {
    if (OPTIONAL_TYPES.has(type)) return {};
    throw new BadRequestException(
      'Vui lòng khai báo đầy đủ thông tin đi kèm file.',
    );
  }
  if (typeof raw !== 'string' || raw.length > 8192) {
    throw new BadRequestException('Thông tin khai báo không hợp lệ.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Thông tin khai báo không phải JSON hợp lệ.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('Thông tin khai báo phải là đối tượng.');
  }

  const obj = parsed as Record<string, unknown>;
  const fields = FIELDS[type];
  if (Object.keys(obj).some((key) => !fields.includes(key))) {
    throw new BadRequestException(
      'Thông tin khai báo chứa trường không được hỗ trợ.',
    );
  }
  const result: DocumentMetadata = {};
  for (const field of fields) {
    const value = obj[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Vui lòng nhập ${field}.`);
    }
    const normalized = value.trim();
    if (
      normalized.length > 255 ||
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(normalized)
    ) {
      throw new BadRequestException(
        `${field} không hợp lệ hoặc quá 255 ký tự.`,
      );
    }
    if (DATE_FIELDS.has(field) && !isValidDate(normalized)) {
      throw new BadRequestException(`Ngày ${field} không hợp lệ.`);
    }
    if (field === 'examinationSessionId' && !/^[1-9]\d*$/.test(normalized)) {
      throw new BadRequestException('Kỳ sát hạch không hợp lệ.');
    }
    result[field] = normalized;
  }
  if (type === 'bc1' && result.closingDate < result.openingDate) {
    throw new BadRequestException(
      'Ngày bế giảng phải sau hoặc bằng ngày khai giảng.',
    );
  }
  return result;
}
