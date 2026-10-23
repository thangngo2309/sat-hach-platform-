import { API_URL, ApiError } from "@/lib/auth";

export type ExamStatisticsCourse = {
  id: number;
  code: string;
  name: string;
  schoolCode: string;
  schoolName: string;
};

export type ExamStatisticsSession = {
  id: number;
  code: string;
  examDate: string | null;
  centerCode: string;
  centerName: string | null;
  totalCandidates: number;
};

export type ExamStatisticsFilters = {
  years: Array<{ year: number }>;
  courses: ExamStatisticsCourse[];
  sessions: ExamStatisticsSession[];
};

export type ExamStatisticsSummary = {
  totalStudents: number;
  passed: number;
  failed: number;
  pending: number;
  absent: number;
  retakeStudents: number;
  totalStudentSessions: number;
  totalResultSessions: number;
};

export type ExamPartStatistics = {
  examType: string;
  totalRecords: number;
  passed: number;
  failed: number;
  absent: number;
  studentCount: number;
};

export type StudentPartStatistics = {
  examType: string;
  totalRecords: number;
  passed: number;
  failed: number;
  absent: number;
};

export type ExamStatisticsStudent = {
  id: number;
  hasPhoto: boolean;
  registrationCode: string;
  fullName: string;
  identityNumber: string | null;
  sessionCount: number;
  resultCount: number;
  status: "passed" | "failed" | "pending";
  hasAbsent: boolean;
  allTimeSessionCount: number;
  allTimeResultCount: number;
  latestSessionCode: string | null;
  latestExamDate: string | null;
  latestResultStatus: string | null;
  parts: StudentPartStatistics[];
};

export type ExamStatisticsReport = {
  filters: {
    year: number;
    courseId: number | null;
    sessionId: number | null;
  };
  summary: ExamStatisticsSummary;
  parts: ExamPartStatistics[];
  students: ExamStatisticsStudent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ExamStatisticsHistoryPart = {
  id: number;
  examType: string;
  partOrder: number;
  resultStatus: string | null;
  score: string | null;
  maximumScore: string | null;
  examDate: string | null;
};

export type ExamStatisticsHistoryItem = {
  id: number;
  sessionId: number;
  sessionCode: string;
  examDate: string | null;
  examinationNumber: string | null;
  licenseClass: string | null;
  resultStatus: string | null;
  hasResult: boolean;
  inSelectedYear: boolean;
  inSelectedCourse: boolean;
  inSelectedSession: boolean;
  parts: ExamStatisticsHistoryPart[];
};

export type ExamStatisticsStudentHistory = {
  studentId: number;
  history: ExamStatisticsHistoryItem[];
};

export type ExamStatisticsParams = {
  year: number;
  courseId?: number | null;
  sessionId?: number | null;
  page?: number;
  limit?: number;
  search?: string;
};

export type ExamStatisticsFilterParams = {
  year?: number;
  courseId?: number | null;
};

async function request<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API_URL}/exam-statistics${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const raw = json?.message;

    throw new ApiError(
      Array.isArray(raw)
        ? raw.join(", ")
        : typeof raw === "string"
        ? raw
        : "Không thể tải thống kê sát hạch.",
      response.status
    );
  }

  return json as T;
}

export function getExamStatisticsFilters(
  token: string,
  params: ExamStatisticsFilterParams = {}
) {
  const query = new URLSearchParams();

  if (params.year) {
    query.set("year", String(params.year));
  }

  if (params.courseId) {
    query.set("courseId", String(params.courseId));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";

  return request<ExamStatisticsFilters>(token, `/filters${suffix}`);
}

function makeQuery(params: ExamStatisticsParams) {
  const query = new URLSearchParams({
    year: String(params.year),
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });

  if (params.courseId) {
    query.set("courseId", String(params.courseId));
  }

  if (params.sessionId) {
    query.set("sessionId", String(params.sessionId));
  }

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  return query.toString();
}

export function getExamStatisticsReport(
  token: string,
  params: ExamStatisticsParams
) {
  return request<ExamStatisticsReport>(token, `/report?${makeQuery(params)}`);
}

export function getExamStatisticsStudentHistory(
  token: string,
  id: number,
  params: ExamStatisticsParams
) {
  return request<ExamStatisticsStudentHistory>(
    token,
    `/students/${id}?${makeQuery(params)}`
  );
}
