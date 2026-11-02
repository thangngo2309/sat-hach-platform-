import { apiRequest } from "@/lib/auth";

export type ReviewFileType =
  | "bc1"
  | "bc2"
  | "bc2_result"
  | "exam_48"
  | "exam_result";

export type MatchStatus = "new" | "matched" | "conflict" | "possible_match";

export interface ReviewFile {
  id: number;
  fileType: ReviewFileType;
  status: string;
  importStatus: string;
  currentVersion: number;
  version?: number;
  originalName: string;
  sizeBytes: string;
  uploadedByUserId: number;
  uploaderName: string;
  trainingSchoolId: number | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterName: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  note?: string | null;
}

export interface ReviewSummary {
  totalCandidates: number;
  matched: number;
  new: number;
  conflict: number;
  possibleMatch: number;
}

export interface ReviewOverview {
  file: ReviewFile;
  supported: boolean;
  message: string | null;
  metadata: Record<string, unknown>;
  summary: ReviewSummary | null;
}

export interface MatchedStudent {
  id: number;
  registrationCode: string;
  fullName: string;
  identityNumber: string | null;
  dateOfBirth: string | null;
  sourceType: string;
}

export interface ReviewCandidate {
  order: number;
  registrationCode: string;
  fullName: string | null;
  dateOfBirth: string | null;
  identityNumber: string | null;
  examinationNumber: string | null;
  fileNumber: string | null;
  details: Record<string, unknown>;
  matchStatus: MatchStatus;
  matchedStudents: MatchedStudent[];
  differences: string[];
}

export interface Paged<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReviewCandidatePage extends Paged<ReviewCandidate> {
  fileId: number;
  supported: boolean;
  message: string | null;
}

export interface RelatedFile {
  id: number;
  fileType: ReviewFileType;
  originalName: string;
  status: string;
  version: number;
  uploaderName: string;
}

export interface RelatedFilesResult {
  registrationCode: string;
  related: RelatedFile[];
  scannedFiles: number;
  scanLimit: number;
  exhaustive: boolean;
  message: string;
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }

  const result = query.toString();
  return result ? `?${result}` : "";
}

export function listReviewFiles(
  token: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    fileType?: string;
    status?: string;
    trainingSchoolId?: number;
    examinationCenterId?: number;
  } = {}
) {
  return apiRequest<Paged<ReviewFile>>(
    `/file-review${queryString(params)}`,
    { method: "GET" },
    token
  );
}

export function getReviewOverview(token: string, id: number, version?: number) {
  return apiRequest<ReviewOverview>(
    `/file-review/${id}/overview${queryString({ version })}`,
    { method: "GET" },
    token
  );
}

export function getReviewCandidates(
  token: string,
  id: number,
  params: {
    version?: number;
    page?: number;
    limit?: number;
    search?: string;
    matchStatus?: string;
  } = {}
) {
  return apiRequest<ReviewCandidatePage>(
    `/file-review/${id}/candidates${queryString(params)}`,
    { method: "GET" },
    token
  );
}

export function getRelatedReviewFiles(
  token: string,
  id: number,
  registrationCode: string
) {
  return apiRequest<RelatedFilesResult>(
    `/file-review/${id}/related-files${queryString({
      registrationCode,
    })}`,
    { method: "GET" },
    token
  );
}

export interface ReviewOrganizationOption {
  id: number;
  code: string;
  name: string;
}

export interface ReviewOrganizationOptions {
  trainingSchools: ReviewOrganizationOption[];
  examinationCenters: ReviewOrganizationOption[];
}

export function getReviewOrganizationOptions(token: string) {
  return apiRequest<ReviewOrganizationOptions>(
    "/file-review/options",
    { method: "GET" },
    token
  );
}
