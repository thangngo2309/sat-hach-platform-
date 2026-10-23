import { API_URL, ApiError } from "@/lib/auth";

export type DashboardParams = {
  year: number;
  courseId?: number | null;
  sessionId?: number | null;
};

export type DashboardSummary = {
  totalStudents: number;
  passed: number;
  failed: number;
  pending: number;
  absent: number;
  retakeStudents: number;
  totalStudentSessions: number;
  totalResultSessions: number;
  totalSessions: number;
  totalCourses: number;
};

export type DashboardMonth = {
  month: number;
  passed: number;
  failed: number;
  pending: number;
  absent: number;
};

export type DashboardPartResult = {
  examType: string;
  totalRecords: number;
  studentCount: number;
  passed: number;
  failed: number;
  absent: number;
};

export type DashboardSession = {
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

export type DashboardCourse = {
  courseId: number;
  courseCode: string;
  courseName: string;
  schoolName: string;
  totalStudents: number;
  passed: number;
  failed: number;
  pending: number;
};

export type DashboardImport = {
  id: number;
  type: string;
  fileName: string;
  reportCode: string | null;
  totalRecords: number;
  importedAt: string;
};

export type DashboardOverview = {
  filters: {
    year: number;
    courseId: number | null;
    sessionId: number | null;
  };
  summary: DashboardSummary;
  monthlyResults: DashboardMonth[];
  partResults: DashboardPartResult[];
  recentSessions: DashboardSession[];
  coursePerformance: DashboardCourse[];
  recentImports: DashboardImport[];
};

export async function getDashboardOverview(
  token: string,
  params: DashboardParams
): Promise<DashboardOverview> {
  const query = new URLSearchParams({
    year: String(params.year),
  });

  if (params.courseId) {
    query.set("courseId", String(params.courseId));
  }

  if (params.sessionId) {
    query.set("sessionId", String(params.sessionId));
  }

  const response = await fetch(
    `${API_URL}/dashboard/overview?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message;

    throw new ApiError(
      Array.isArray(message)
        ? message.join(", ")
        : typeof message === "string"
        ? message
        : "Không thể tải Dashboard.",
      response.status
    );
  }

  return data as DashboardOverview;
}
