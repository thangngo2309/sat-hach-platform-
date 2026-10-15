import { API_URL, ApiError } from "@/lib/auth";

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PageResult<T> = {
  data: T[];
  pagination: Pagination;
};

export type TrainingSchool = {
  id: number;
  code: string;
  name: string;
  provinceCode: string | null;
  provinceName: string | null;
  courseCount: number;
  enrollmentCount: number;
};

export type Course = {
  id: number;
  code: string;
  name: string;
  schoolId: number;
  schoolCode: string;
  schoolName: string;
  bc1Code: string | null;
  licenseClass: string | null;
  trainingClass: string | null;
  openingDate: string | null;
  closingDate: string | null;
  declaredStudentCount: number | null;
  studentCount: number;
};

export type StudentCourse = {
  id: number;
  code: string;
  name: string;
  schoolId: number;
  schoolName: string;
  fileNumber: string | null;
};

export type Student = {
  id: number;
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  identityNumber: string | null;
  nationalityCode: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  courseCount: number;
  courses: StudentCourse[];
};

export type CatalogParams = {
  page?: number;
  limit?: number;
  search?: string;
  schoolId?: number | null;
  courseId?: number | null;
};

async function getCatalog<T>(
  endpoint: string,
  accessToken: string,
  params: CatalogParams
): Promise<PageResult<T>> {
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

  const response = await fetch(
    `${API_URL}/catalog/${endpoint}?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : typeof data?.message === "string"
      ? data.message
      : "Không thể tải dữ liệu.";

    throw new ApiError(message, response.status);
  }

  return data as PageResult<T>;
}

export function getSchools(token: string, params: CatalogParams = {}) {
  return getCatalog<TrainingSchool>("schools", token, params);
}

export function getCourses(token: string, params: CatalogParams = {}) {
  return getCatalog<Course>("courses", token, params);
}

export function getStudents(token: string, params: CatalogParams = {}) {
  return getCatalog<Student>("students", token, params);
}
