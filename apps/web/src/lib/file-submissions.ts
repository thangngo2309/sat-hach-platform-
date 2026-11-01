import { API_URL, apiRequest } from "@/lib/auth";

import type { OrganizationOptions } from "@/lib/organization-accounts";

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
  note: string | null;
  rejectionReason: string | null;
  currentVersion: number;
  importStatus: ImportStatus;
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

export function getFileImportStates(
  token: string,
  ids: number[]
): Promise<FileImportState[]> {
  if (ids.length === 0) {
    return Promise.resolve([]);
  }

  return apiRequest<FileImportState[]>(
    `/file-submissions/import-states?ids=${ids.join(",")}`,
    { method: "GET" },
    token
  );
}

export function uploadFileSubmission(
  token: string,
  input: {
    file: File;
    fileType: SubmissionFileType;
    trainingSchoolId?: number | null;
    examinationCenterId?: number | null;
    note?: string;
  }
) {
  const body = new FormData();

  body.set("file", input.file);
  body.set("fileType", input.fileType);
  body.set("note", input.note ?? "");

  if (input.trainingSchoolId) {
    body.set("trainingSchoolId", String(input.trainingSchoolId));
  }

  if (input.examinationCenterId) {
    body.set("examinationCenterId", String(input.examinationCenterId));
  }

  return apiRequest<FileSubmission>(
    "/file-submissions",
    { method: "POST", body },
    token
  );
}

export function replaceFileSubmission(token: string, id: number, file: File) {
  const body = new FormData();
  body.set("file", file);

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
      body: JSON.stringify({
        action,
        reason,
      }),
    },
    token
  );
}

export interface FileSubmissionVersion {
  id: number;
  submissionId: number;
  version: number;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  createdAt: string;
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

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
