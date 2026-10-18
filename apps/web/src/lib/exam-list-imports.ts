import { API_URL, ApiError } from "@/lib/auth";

export type ExamCandidateType = "training" | "independent" | "unknown";

export type ExamListCandidate = {
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  schoolCode: string | null;
  courseCode: string | null;
  licenseClass: string | null;
  examinationNumber: string | null;
  candidateType: ExamCandidateType;
};

export type ExamListPreview = {
  type: "EXAM_LIST";
  fileName: string;
  fileSize: number;
  sha256: string;
  alreadyImported: boolean;
  existingImportId: number | null;
  session: {
    code: string;
    examinationCenterCode: string;
    examDate: string | null;
    examTime: string | null;
    decisionNumber: string | null;
  };
  totalCandidates: number;
  schoolCodes: string[];
  distinctCourses: number;
  byType: Record<ExamCandidateType, number>;
  candidates: ExamListCandidate[];
  previewLimit: number;
};

export type ExamListImportResult = {
  id: number;
  type: "EXAM_LIST";
  sessionId: number;
  sessionCode: string;
  examinationCenterCode: string;
  totalCandidates: number;
  newSchools: number;
  newCourses: number;
  newStudents: number;
  linkedStudents: number;
  newCandidates: number;
  updatedCandidates: number;
  newEnrollments: number;
};

export type ExamListHistoryItem = {
  id: number;
  fileName: string;
  sessionCode: string;
  totalCandidates: number;
  newStudents: number;
  newEnrollments: number;
  importedAt: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const rawMessage = data?.message;

    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : typeof rawMessage === "string"
      ? rawMessage
      : "Không thể xử lý file 48.";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

async function upload<T>(
  action: "preview" | "confirm",
  file: File,
  accessToken: string
): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_URL}/imports/exam-list/${action}`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseResponse<T>(response);
}

export function previewExamList(file: File, accessToken: string) {
  return upload<ExamListPreview>("preview", file, accessToken);
}

export function confirmExamList(file: File, accessToken: string) {
  return upload<ExamListImportResult>("confirm", file, accessToken);
}

export async function getExamListHistory(accessToken: string) {
  const response = await fetch(`${API_URL}/imports/exam-list/history`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  return parseResponse<ExamListHistoryItem[]>(response);
}
