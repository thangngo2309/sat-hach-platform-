import { API_URL, ApiError } from "@/lib/auth";

export type ExamResultStatus = string | null;

export type ExamPart = {
  id: number;
  partOrder: number;
  examType: string;
  resultStatus: ExamResultStatus;
  examDate: string | null;
  score: string | null;
  maximumScore: string | null;
};

export type ExamResultCandidate = {
  id: number;
  studentId: number;
  hasPhoto: boolean;
  hasAbsentPart: boolean;
  registrationCode: string;
  examinationNumber: string | null;
  fullName: string;
  identityNumber: string | null;
  candidateType: string;
  licenseClass: string | null;
  schoolCode: string | null;
  schoolName: string | null;
  courseCode: string | null;
  resultStatus: ExamResultStatus;
  theoryScore: string | null;
  practicalScore: string | null;
  roadScore: string | null;
  hasResult: boolean;
  parts: ExamPart[];
};

export type ExamSession = {
  id: number;
  code: string;
  examDate: string | null;
  centerCode: string;
  centerName: string | null;
  totalCandidates: number;
  withResults: number;
  passed: number;
  failed: number;
  absent: number;
};

export type ExamResultsPage = {
  session: Pick<
    ExamSession,
    "id" | "code" | "examDate" | "centerCode" | "centerName"
  >;
  summary: {
    total: number;
    withResults: number;
    passed: number;
    failed: number;
    absent: number;
    independent: number;
  };
  data: ExamResultCandidate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ExamResultPreview = {
  type: "EXAM_RESULT";
  fileName: string;
  fileSize: number;
  alreadyImported: boolean;
  existingImportId: number | null;
  sessionCode: string;
  sourceUnitCode: string | null;
  totalCandidates: number;
  totalParts: number;
  byResult: Record<string, number>;
  validation: {
    sessionId: number;
    expectedCandidates: number;
    matched: number;
    unmatched: string[];
    conflicts: string[];
  };
  canImport: boolean;
  candidates: Array<{
    registrationCode: string;
    fullName: string | null;
    examinationNumber: string | null;
    resultStatus: string | null;
    theoryScore: string | null;
    practicalScore: string | null;
    roadScore: string | null;
    parts: ExamPart[];
  }>;
};

export type ExamResultImportResponse = {
  id: number;
  sessionCode: string;
  totalCandidates: number;
  updatedCandidates: number;
  totalParts: number;
  byResult: Record<string, number>;
};

async function handle<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const raw = data?.message;

    const message = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "string"
      ? raw
      : "Không thể xử lý dữ liệu sát hạch.";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function getExamSessions(token: string) {
  return fetch(`${API_URL}/imports/exam-result/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    cache: "no-store",
  }).then((res) => handle<ExamSession[]>(res));
}

export function getExamResults(
  token: string,
  code: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    candidateType?: string;
  } = {}
) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });

  if (params.search) {
    query.set("search", params.search);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.candidateType) {
    query.set("candidateType", params.candidateType);
  }

  return fetch(
    `${API_URL}/imports/exam-result/sessions/${encodeURIComponent(
      code
    )}/results?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      cache: "no-store",
    }
  ).then((res) => handle<ExamResultsPage>(res));
}

async function uploadResult<T>(
  token: string,
  file: File,
  action: "preview" | "confirm"
) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_URL}/imports/exam-result/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
    credentials: "include",
  });

  return handle<T>(response);
}

export function previewExamResult(token: string, file: File) {
  return uploadResult<ExamResultPreview>(token, file, "preview");
}

export function confirmExamResult(token: string, file: File) {
  return uploadResult<ExamResultImportResponse>(token, file, "confirm");
}
