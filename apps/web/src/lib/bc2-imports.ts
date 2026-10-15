import { API_URL, ApiError } from "@/lib/auth";

export type Bc2StudentPreview = {
  order: number;
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  fileNumber: string | null;
  requestedLicenseClass: string | null;
  alreadyExists: boolean;
};

export type Bc2Preview = {
  type: "BC2";
  fileName: string;
  fileSize: number;
  sha256: string;
  alreadyImported: boolean;
  existingImportId: number | null;
  report: {
    bc2Code: string;
    bc1Code: string | null;
    schoolCode: string;
    documentNumber: string | null;
    documentDate: string | null;
    declaredCount: number | null;
    licenseClass: string | null;
  };
  totalCandidates: number;
  existingStudents: number;
  newStudents: number;
  bc1MatchStatus: "matched" | "unmatched" | "ambiguous";
  matchedCourses: { id: number; code: string; name: string }[];
  students: Bc2StudentPreview[];
  previewLimit: number;
};

export type Bc2Result = {
  id: number;
  reportId: number;
  bc2Code: string;
  bc1Code: string | null;
  totalCandidates: number;
  newStudents: number;
  existingStudents: number;
};

export type Bc2History = {
  id: number;
  bc2Code: string;
  bc1Code: string | null;
  documentDate: string | null;
  totalCandidates: number;
  schoolCode: string;
  schoolName: string;
  importId: number;
  fileName: string;
  newStudents: number;
  importedAt: string;
  importedBy: string | null;
};

export type Bc2CandidateRow = {
  id: number;
  sourceOrder: number | null;
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  fileNumber: string | null;
  requestedLicenseClass: string | null;
  previousLicenseClass: string | null;
  examContentCode: string | null;
};

export type Bc2CandidatePage = {
  data: Bc2CandidateRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

async function request<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}/imports/bc2${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const raw = data?.message;
    throw new ApiError(
      Array.isArray(raw)
        ? raw.join(", ")
        : typeof raw === "string"
        ? raw
        : "Không thể xử lý yêu cầu BC2.",
      response.status
    );
  }

  return data as T;
}

function upload<T>(action: "preview" | "confirm", file: File, token: string) {
  const form = new FormData();
  form.append("file", file);

  return request<T>(`/${action}`, token, {
    method: "POST",
    body: form,
  });
}

export const previewBc2 = (file: File, token: string) =>
  upload<Bc2Preview>("preview", file, token);

export const confirmBc2 = (file: File, token: string) =>
  upload<Bc2Result>("confirm", file, token);

export const getBc2History = (token: string) =>
  request<Bc2History[]>("/history", token);

export const getBc2Candidates = (
  reportId: number,
  page: number,
  token: string
) =>
  request<Bc2CandidatePage>(
    `/${reportId}/candidates?page=${page}&limit=20`,
    token
  );
