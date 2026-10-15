import { API_URL, ApiError } from "@/lib/auth";

export type PageResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type StudentCourse = {
  id: number;
  code: string;
  name?: string;
  bc1Code?: string | null;
  schoolCode?: string;
  schoolName: string;
  fileNumber: string | null;
  licenseClass?: string | null;
};

export type StudentBc2 = {
  reportId: number;
  bc2Code: string;
  bc1Code: string | null;
  schoolCode: string;
  schoolName: string;
  fileNumber: string | null;
  requestedLicenseClass: string | null;
  documentDate?: string | null;
  previousLicenseNumber?: string | null;
  previousLicenseClass?: string | null;
  examContentCode?: string | null;
  sourceData?: Record<string, unknown>;
};

export type StudentRow = {
  id: number;
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  courseCount: number;
  hasBc2: boolean;
  bc2Count: number;
  courses: StudentCourse[];
  bc2Reports: StudentBc2[];
};

export type StudentDetail = StudentRow & {
  familyName: string | null;
  givenName: string | null;
  gender: string | null;
  nationalityCode: string | null;
  nationalityName: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
};

export type CourseSummary = {
  id: number;
  code: string;
  name: string;
  bc1Code: string | null;
  licenseClass: string | null;
  openingDate: string | null;
  schoolId: number;
  schoolName: string;
  studentCount: number;
  bc2MatchedCount: number;
  noBc2Count: number;
};

export type ViewParams = {
  page?: number;
  limit?: number;
  search?: string;
  schoolId?: number;
  courseId?: number;
  bc2Status?: "all" | "has_bc2" | "no_bc2";
};

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}/bc2-view${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message;

    throw new ApiError(
      Array.isArray(message)
        ? message.join(", ")
        : typeof message === "string"
        ? message
        : "Không thể tải dữ liệu.",
      response.status
    );
  }

  return data as T;
}

function queryString(params: ViewParams) {
  const query = new URLSearchParams();

  query.set("page", String(params.page ?? 1));
  query.set("limit", String(params.limit ?? 20));

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.schoolId) {
    query.set("schoolId", String(params.schoolId));
  }

  if (params.courseId) {
    query.set("courseId", String(params.courseId));
  }

  if (params.bc2Status && params.bc2Status !== "all") {
    query.set("bc2Status", params.bc2Status);
  }

  return query.toString();
}

export function listStudents(token: string, params: ViewParams) {
  return request<PageResult<StudentRow>>(
    `/students?${queryString(params)}`,
    token
  );
}

export function getStudentDetail(token: string, id: number) {
  return request<StudentDetail>(`/students/${id}`, token);
}

export function listCourseSummaries(token: string, params: ViewParams) {
  return request<PageResult<CourseSummary>>(
    `/courses?${queryString(params)}`,
    token
  );
}
