
import { API_URL, ApiError } from "@/lib/auth";

export type StudentDocument = {
  type: string;
  checked: boolean;
  note?: string;
};

export type ExistingLicense = {
  number: string;
  licenseClass: string;
  issuedDate: string;
  issuedBy: string;
};

export type StudentFormData = {
  // Thông tin học viên
  registrationCode: string;
  fullName: string;
  familyName: string;
  givenName: string;
  dateOfBirth: string;
  gender: string;
  identityNumber: string;
  nationalityCode: string;
  nationalityName: string;
  permanentAddress: string;
  currentAddress: string;

  // Thông tin liên hệ, địa bàn hành chính
  phoneNumber: string;
  provinceCode: string;
  wardCode: string;

  // Thông tin sát hạch
  applicationType: string;
  requestedLicenseClass: string;
  trainingLicenseClass: string;
  examinationContent: string;
  certificateIssuer: string;
  identityIssuedDate: string;

  // Giấy xác nhận hoàn thành khóa đào tạo
  trainingCompletionNumber: string;
  trainingCompletionIssuedDate: string;
  trainingCompletionIssuer: string;

  note: string;
  documents: StudentDocument[];
  existingLicenses: ExistingLicense[];
};

export type StudentSaved = {
  id: number;
  registrationCode: string;
  fullName: string;
  hasPhoto: boolean;
  createdByUserId?: number | null;
  sourceType?: string;
};


export const STUDENT_DOCUMENT_OPTIONS = [
  {
    type: "health_certificate",
    label: "Giấy khám sức khỏe",
  },
  {
    type: "training_completion_certificate",
    label: "Xác nhận hoàn thành khóa học",
  },
  {
    type: "identity_copy",
    label: "CCCD phô tô",
  },
  {
    type: "current_license_copy",
    label: "GPLX phô tô (nếu có)",
  },
  {
    type: "student_verification",
    label: "Xác minh thông tin học viên",
  },
  {
    type: "dat_verification",
    label: "Xác minh dữ liệu DAT",
  },
  {
    type: "exam_result_summary",
    label: "Biên bản tổng hợp kỳ sát hạch",
  },
  {
    type: "absent_failed_verification",
    label: "Xác minh danh sách vắng, trượt",
  },
] as const;


export const LEGACY_DOCUMENT_LABELS: Record<string, string> = {
  driving_experience:
    "Bản khai thời gian và số km lái xe an toàn theo mẫu quy định",

  diploma:
    "Bản sao có chứng thực bằng tốt nghiệp hoặc văn bằng tương đương (nếu cần)",

  photo_3x4: "Ảnh thẻ 3x4",

  other: "Giấy tờ khác",

  driving_license: "Giấy phép lái xe",

  medical_exam_certificate: "Giấy khám sức khỏe",
};

export const EMPTY_STUDENT_FORM: StudentFormData = {
  registrationCode: "",
  fullName: "",
  familyName: "",
  givenName: "",
  dateOfBirth: "",
  gender: "M",
  identityNumber: "",
  nationalityCode: "VN",
  nationalityName: "Việt Nam",
  permanentAddress: "",
  currentAddress: "",

  phoneNumber: "",
  provinceCode: "",
  wardCode: "",

  applicationType: "new",
  requestedLicenseClass: "",
  trainingLicenseClass: "",
  examinationContent: "",
  certificateIssuer: "",
  identityIssuedDate: "",

  trainingCompletionNumber: "",
  trainingCompletionIssuedDate: "",
  trainingCompletionIssuer: "",

  note: "",
  documents: STUDENT_DOCUMENT_OPTIONS.map((item) => ({
    type: item.type,
    checked: false,
    note: "",
  })),
  existingLicenses: [],
};

async function submitStudent(
  accessToken: string,
  method: "POST" | "PATCH",
  endpoint: string,
  values: StudentFormData,
  photo?: File | null
): Promise<StudentSaved> {
  const form = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      form.append(key, JSON.stringify(value));
    } else {
      form.append(key, value);
    }
  }

  if (photo) {
    form.append("photo", photo, photo.name);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: form,
    cache: "no-store",
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = result?.message;

    throw new ApiError(
      Array.isArray(message)
        ? message.join(", ")
        : typeof message === "string"
          ? message
          : "Không thể lưu hồ sơ học viên.",
      response.status
    );
  }

  return result as StudentSaved;
}

export function createStudent(
  accessToken: string,
  values: StudentFormData,
  photo?: File | null
) {
  return submitStudent(
    accessToken,
    "POST",
    "/students",
    values,
    photo
  );
}

export function updateStudent(
  accessToken: string,
  id: number,
  values: StudentFormData,
  photo?: File | null
) {
  return submitStudent(
    accessToken,
    "PATCH",
    `/students/${id}`,
    values,
    photo
  );
}
