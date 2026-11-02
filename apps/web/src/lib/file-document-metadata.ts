
import type { SubmissionFileType } from './file-submissions';

export type DocumentMetadata = Record<string, string>;

export const DOCUMENT_FIELDS: Record<SubmissionFileType, Array<{
  key: string;
  label: string;
  type: 'text' | 'date' | 'session' | 'license';
}>> = {
  bc1: [
    { key: 'trainingLicenseClass', label: 'Hạng đào tạo', type: 'license' },
    { key: 'openingDate', label: 'Ngày khai giảng', type: 'date' },
    { key: 'closingDate', label: 'Ngày bế giảng', type: 'date' },
    { key: 'documentNumber', label: 'Số công văn Báo cáo 1', type: 'text' },
    { key: 'documentDate', label: 'Ngày công văn', type: 'date' },
  ],
  bc2: [
    { key: 'trainingLicenseClass', label: 'Hạng đào tạo', type: 'license' },
    { key: 'expectedExamDate', label: 'Ngày dự kiến sát hạch', type: 'date' },
    { key: 'documentNumber', label: 'Số công văn Báo cáo 2', type: 'text' },
    { key: 'documentDate', label: 'Ngày công văn', type: 'date' },
  ],
  exam_result: [
    { key: 'examinationLicenseClass', label: 'Hạng sát hạch', type: 'license' },
    { key: 'examinationSessionId', label: 'Kỳ sát hạch', type: 'session' },
    { key: 'examinationDate', label: 'Ngày sát hạch', type: 'date' },
    { key: 'itOfficer', label: 'IT phụ trách', type: 'text' },
  ],
  exam_48: [],
  bc2_result: [],
};

export function validateMetadata(fileType: SubmissionFileType, values: DocumentMetadata): string | null {
  for (const field of DOCUMENT_FIELDS[fileType]) {
    if (!values[field.key]?.trim()) return `Vui lòng nhập ${field.label}.`;
  }
  if (fileType === 'bc1' && values.openingDate > values.closingDate) {
    return 'Ngày bế giảng không được trước ngày khai giảng.';
  }
  return null;
}

export function describeMetadata(fileType: SubmissionFileType, data?: DocumentMetadata | null, sessionCode?: string): string[] {
  return DOCUMENT_FIELDS[fileType].filter((field) => data?.[field.key]).map((field) =>
    `${field.label}: ${field.type === 'session' && sessionCode ? sessionCode : data![field.key]}`
  );
}

export const LICENSE_CLASSES = ['A1', 'A', 'B1', 'B', 'C1', 'C', 'D1', 'D2', 'D', 'BE', 'C1E', 'CE', 'D1E', 'D2E', 'DE'];
