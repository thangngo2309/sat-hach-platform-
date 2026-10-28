import { API_URL, ApiError } from "@/lib/auth";

export type StudentDocument = {
  type: string;
  checked: boolean;
};

export type ExistingLicense = {
  number: string;
  licenseClass: string;
  issuedDate: string;
  issuedBy: string;
};

export type StudentFormData = {
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

  applicationType: string;
  requestedLicenseClass: string;
  trainingLicenseClass: string;
  examinationContent: string;
  certificateIssuer: string;
  identityIssuedDate: string;
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

  applicationType: "new",
  requestedLicenseClass: "",
  trainingLicenseClass: "",
  examinationContent: "",
  certificateIssuer: "",
  identityIssuedDate: "",
  note: "",
  documents: [
    { type: "health_certificate", checked: false },
    { type: "driving_experience", checked: false },
    { type: "diploma", checked: false },
    { type: "current_license_copy", checked: false },
  ],
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
  return submitStudent(accessToken, "POST", "/students", values, photo);
}

export function updateStudent(
  accessToken: string,
  id: number,
  values: StudentFormData,
  photo?: File | null
) {
  return submitStudent(accessToken, "PATCH", `/students/${id}`, values, photo);
}
