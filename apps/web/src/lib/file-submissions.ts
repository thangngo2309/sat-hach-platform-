import { API_URL, apiRequest } from "@/lib/auth";
import type { OrganizationOptions } from "@/lib/organization-accounts";
import type { DocumentMetadata } from "./file-document-metadata";

export type SubmissionFileType =
  | "bc1"
  | "bc2"
  | "bc2_result"
  | "exam_48"
  | "exam_result";

export type SubmissionStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected";

export type ImportStatus =
  | "not_processed"
  | "processing"
  | "completed"
  | "failed";

export interface FileSubmission {
  id: number;
  fileType: SubmissionFileType;
  status: SubmissionStatus;

  uploadedByUserId: number;
  uploaderName: string;

  trainingSchoolId: number | null;
  trainingSchoolName: string | null;

  examinationCenterId: number | null;
  examinationCenterName: string | null;

  examinationSessionId: number | null;
  examinationSessionCode: string | null;

  note: string | null;
  rejectionReason: string | null;

  currentVersion: number;
  importStatus: ImportStatus;
  documentMetadata: DocumentMetadata;

  originalName: string;
  sizeBytes: string;

  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

export interface FileImportState {
  id: number;
  status: SubmissionStatus;
  importStatus: ImportStatus;
  importError: string | null;
  importResult: Record<string, unknown> | null;
  importBatchId: number | null;
  processingStartedAt: string | null;
  importCompletedAt: string | null;
}

export interface FileSubmissionReviewResult {
  id: number;
  status: SubmissionStatus;
  importStatus: ImportStatus;
  importError?: string | null;
  importResult?: Record<string, unknown> | null;
  importBatchId?: number | null;
}

export interface ExamSessionOption {
  id: number;
  code: string;
  examDate: string | null;
  examinationCenterId?: number;
  centerCode?: string;
  centerName?: string | null;
  officialCode?: string | null;
}

export interface ItOfficerOption {
  id: number;
  username: string;
  fullName: string;
}

export interface FileSubmissionVersion {
  id: number;
  submissionId: number;
  version: number;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  documentMetadata: DocumentMetadata;
  createdAt: string;
}

export function formatItOfficer(officer: ItOfficerOption): string {
  return `${officer.fullName} (@${officer.username})`;
}

export const FILE_TYPE_LABELS: Record<SubmissionFileType, string> = {
  bc1: "Báo cáo 1 (BC1)",
  bc2: "Báo cáo 2 (BC2)",
  bc2_result: "Kết quả BC2 (PC08)",
  exam_48: "File dự sát hạch 48_",
  exam_result: "Kết quả sát hạch",
};

export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Chờ duyệt",
  processing: "Đang xử lý",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  not_processed: "Chưa import",
  processing: "Đang import",
  completed: "Import thành công",
  failed: "Import thất bại",
};

export function listFileSubmissions(
  token: string,
  status?: Exclude<SubmissionStatus, "processing">
) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";

  return apiRequest<FileSubmission[]>(
    `/file-submissions${suffix}`,
    { method: "GET" },
    token
  );
}

export function getFileSubmissionOptions(token: string) {
  return apiRequest<OrganizationOptions>(
    "/file-submissions/options",
    { method: "GET" },
    token
  );
}

/**
 * Danh sách kỳ sát hạch người dùng
 * được phép chọn khi gửi hồ sơ.
 *
 * Backend chịu trách nhiệm giới hạn
 * quyền theo tài khoản và tổ chức.
 */
export function listExamSessionOptions(token: string) {
  return apiRequest<ExamSessionOption[]>(
    "/file-submissions/exam-sessions",
    { method: "GET" },
    token
  );
}

export function listItOfficerOptions(token: string) {
  return apiRequest<ItOfficerOption[]>(
    "/file-submissions/it-officers",
    { method: "GET" },
    token
  );
}

export function getFileImportStates(
  token: string,
  ids: number[]
): Promise<FileImportState[]> {
  if (!ids.length) {
    return Promise.resolve([]);
  }

  return apiRequest<FileImportState[]>(
    `/file-submissions/import-states?ids=${ids.join(",")}`,
    { method: "GET" },
    token
  );
}

/**
 * Gửi hồ sơ mới.
 *
 * BC1:
 *   examinationSessionId không bắt buộc.
 *
 * BC2 / BC2_RESULT / EXAM_48 / EXAM_RESULT:
 *   bắt buộc gắn với kỳ sát hạch đã tạo.
 */
export function uploadFileSubmission(
  token: string,
  input: {
    file: File;
    fileType: SubmissionFileType;
    trainingSchoolId?: number | null;
    examinationCenterId?: number | null;
    examinationSessionId?: number | null;
    note?: string;
    documentMetadata?: DocumentMetadata;
  }
) {
  const body = new FormData();

  body.set("file", input.file);
  body.set("fileType", input.fileType);
  body.set("note", input.note ?? "");
  body.set("documentMetadata", JSON.stringify(input.documentMetadata ?? {}));

  if (input.trainingSchoolId) {
    body.set("trainingSchoolId", String(input.trainingSchoolId));
  }

  if (input.examinationCenterId) {
    body.set("examinationCenterId", String(input.examinationCenterId));
  }

  if (input.examinationSessionId) {
    body.set("examinationSessionId", String(input.examinationSessionId));
  }

  return apiRequest<FileSubmission>(
    "/file-submissions",
    { method: "POST", body },
    token
  );
}

/**
 * Khi thay phiên bản, giữ nguyên kỳ
 * đã gắn với hồ sơ ban đầu.
 */
export function replaceFileSubmission(
  token: string,
  id: number,
  file: File,
  documentMetadata?: DocumentMetadata
) {
  const body = new FormData();

  body.set("file", file);
  body.set("documentMetadata", JSON.stringify(documentMetadata ?? {}));

  return apiRequest<FileSubmission>(
    `/file-submissions/${id}/replace`,
    { method: "POST", body },
    token
  );
}

export function reviewFileSubmission(
  token: string,
  id: number,
  action: "approve" | "reject",
  reason?: string
) {
  return apiRequest<FileSubmissionReviewResult>(
    `/file-submissions/${id}/review`,
    {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    },
    token
  );
}

export function listFileSubmissionVersions(token: string, id: number) {
  return apiRequest<FileSubmissionVersion[]>(
    `/file-submissions/${id}/versions`,
    { method: "GET" },
    token
  );
}

export async function downloadFileSubmission(
  token: string,
  id: number,
  originalName: string,
  version?: number
): Promise<void> {
  const url = new URL(`${API_URL}/file-submissions/${id}/download`);

  if (version !== undefined) {
    url.searchParams.set("version", String(version));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Không thể tải file.";

    try {
      const data = await response.json();

      message = Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || message;
    } catch {
      // Sử dụng thông báo mặc định.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = originalName || `submission-${id}`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30000);
}
