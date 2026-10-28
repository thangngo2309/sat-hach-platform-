import { API_URL, ApiError } from "@/lib/auth";

/**
 * ==========================================
 * COMMON
 * ==========================================
 */

export type PageResult<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * ==========================================
 * STUDENT COURSE / BC1
 * ==========================================
 */

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

/**
 * ==========================================
 * STUDENT BC2
 * ==========================================
 */

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

/**
 * ==========================================
 * STUDENT INTAKE
 *
 * Hồ sơ tiếp nhận thí sinh tự do.
 * Mỗi bản ghi gắn với người tiếp nhận.
 * ==========================================
 */

export type StudentSourceType = "import" | "manual";

export type StudentCandidateType = "training" | "independent" | "unknown";

export type StudentApplicationType = "new" | "upgrade" | "reissue";

export type StudentIntakeDocument = {
  type: string;
  checked: boolean;
};

export type StudentExistingLicense = {
  number: string;
  licenseClass: string;
  issuedDate: string;
  issuedBy: string;
};

export type StudentIntakeUser = {
  id: number;
  fullName: string;
  username: string;
};

export type StudentIntake = {
  id: number;

  studentId: number;

  intakeType: string;

  applicationType: StudentApplicationType;

  requestedLicenseClass: string | null;
  trainingLicenseClass: string | null;
  examinationContent: string | null;

  certificateIssuer: string | null;
  identityIssuedDate: string | null;

  note: string | null;

  documents: StudentIntakeDocument[];

  existingLicenses: StudentExistingLicense[];

  createdByUserId: number;
  updatedByUserId: number | null;

  createdByName: string;
  createdByUsername: string;

  updatedByName: string | null;

  createdAt: string;
  updatedAt: string;
};

/**
 * ==========================================
 * EXAM STATUS
 * ==========================================
 */

export type StudentExamStatus =
  | "passed"
  | "failed"
  | "pending"
  | "not_examined";

export type StudentLatestExam = {
  id: number;
  sessionId: number;
  sessionCode: string;
  examDate: string | null;
  examinationNumber: string | null;
  resultStatus: string | null;
  hasResult: boolean;
};

export type StudentExamPart = {
  id: number;
  partOrder: number;
  examType: string;
  resultStatus: string | null;
  examDate: string | null;
  score: string | null;
  maximumScore: string | null;
};

export type StudentExamHistory = {
  id: number;
  sessionId: number;
  sessionCode: string;
  examDate: string | null;
  examTime: string | null;
  centerCode: string;
  centerName: string | null;
  registrationCode: string;
  examinationNumber: string | null;
  licenseClass: string | null;
  examinationContent: string | null;
  resultStatus: string | null;
  hasResult: boolean;
  hasAbsentPart: boolean;
  theoryScore: string | null;
  practicalScore: string | null;
  roadScore: string | null;
  parts: StudentExamPart[];
};

export type StudentExamPartStat = {
  examType: string;
  attemptCount: number;
  passedCount: number;
  failedCount: number;
  absentCount: number;
};

export type StudentExamSummary = {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  notExamined: number;
  everAbsent: number;
  retake: number;
};

/**
 * ==========================================
 * STUDENT LIST
 * ==========================================
 */

export type StudentRow = {
  id: number;

  hasPhoto: boolean;

  registrationCode: string;
  fullName: string;

  dateOfBirth: string | null;
  identityNumber: string | null;

  /**
   * Thông tin nguồn hồ sơ và người tạo.
   *
   * createdByUserId = null đối với hồ sơ
   * được import trước khi có tracking.
   */
  createdByUserId?: number | null;
  updatedByUserId?: number | null;

  sourceType?: StudentSourceType;

  /**
   * Nhân viên tiếp nhận.
   *
   * Backend trả về nhân viên tiếp nhận
   * đầu tiên đối với SUPER_ADMIN.
   *
   * Với SYSTEM_ADMIN, Backend chỉ được
   * trả về thông tin tiếp nhận thuộc
   * phạm vi tài khoản đang đăng nhập.
   */
  intakeUser?: StudentIntakeUser | null;

  courseCount: number;

  hasBc2: boolean;
  bc2Count: number;

  courses: StudentCourse[];
  bc2Reports: StudentBc2[];

  examSessionCount: number;
  examResultCount: number;
  passedSessionCount: number;

  everAbsent: boolean;
  examStatus: StudentExamStatus;

  latestExam: StudentLatestExam | null;
};

/**
 * ==========================================
 * STUDENT DETAIL
 * ==========================================
 */

export type StudentDetail = StudentRow & {
  familyName: string | null;
  givenName: string | null;

  gender: string | null;

  nationalityCode: string | null;
  nationalityName: string | null;

  permanentAddress: string | null;
  currentAddress: string | null;

  /**
   * Lịch sử kỳ sát hạch và phần thi.
   */
  examHistory: StudentExamHistory[];

  partStats: StudentExamPartStat[];

  /**
   * Danh sách hồ sơ tiếp nhận thí sinh tự do.
   *
   * SUPER_ADMIN: tất cả lượt tiếp nhận.
   * SYSTEM_ADMIN: chỉ lượt do mình tạo.
   */
  intakes?: StudentIntake[];
};

/**
 * ==========================================
 * STUDENT PAGE RESULT
 * ==========================================
 */

export type StudentsPageResult = PageResult<StudentRow> & {
  summary: StudentExamSummary;
};

/**
 * ==========================================
 * COURSE SUMMARY
 * ==========================================
 */

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

/**
 * ==========================================
 * FILTERS
 * ==========================================
 */

export type ViewParams = {
  page?: number;
  limit?: number;

  search?: string;

  schoolId?: number;
  courseId?: number;

  bc2Status?: "all" | "has_bc2" | "no_bc2";

  examStatus?: "all" | StudentExamStatus | "absent" | "retake";
};

/**
 * ==========================================
 * REQUEST HELPERS
 * ==========================================
 */

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}/bc2-view${path}`, {
    method: "GET",
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

function queryString(params: ViewParams): string {
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

  if (params.examStatus && params.examStatus !== "all") {
    query.set("examStatus", params.examStatus);
  }

  return query.toString();
}

/**
 * ==========================================
 * API: STUDENTS
 * ==========================================
 */

/**
 * Danh sách học viên.
 *
 * SUPER_ADMIN:
 *   Backend trả toàn bộ học viên phù hợp bộ lọc.
 *
 * SYSTEM_ADMIN:
 *   Backend chỉ trả học viên có student_intakes
 *   gắn với user ID trong JWT.
 *
 * Tuyệt đối không truyền createdByUserId
 * từ Frontend để quyết định quyền sở hữu.
 */
export function listStudents(
  token: string,
  params: ViewParams
): Promise<StudentsPageResult> {
  return request<StudentsPageResult>(`/students?${queryString(params)}`, token);
}

/**
 * Chi tiết học viên.
 *
 * Backend phải gọi StudentAccessService.assertCanView()
 * trước khi trả dữ liệu.
 */
export function getStudentDetail(
  token: string,
  id: number
): Promise<StudentDetail> {
  return request<StudentDetail>(`/students/${id}`, token);
}

/**
 * ==========================================
 * API: COURSES
 * ==========================================
 *
 * Chỉ dành cho SUPER_ADMIN và ADMIN.
 *
 * SYSTEM_ADMIN không được gọi endpoint này.
 */
export function listCourseSummaries(
  token: string,
  params: ViewParams
): Promise<PageResult<CourseSummary>> {
  return request<PageResult<CourseSummary>>(
    `/courses?${queryString(params)}`,
    token
  );
}
