import { API_URL, ApiError } from "@/lib/auth";

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
};

export type StudentSaved = StudentFormData & {
  id: number;
  hasPhoto: boolean;
};

export const EMPTY_STUDENT_FORM: StudentFormData = {
  registrationCode: "",
  fullName: "",
  familyName: "",
  givenName: "",
  dateOfBirth: "",
  gender: "",
  identityNumber: "",
  nationalityCode: "",
  nationalityName: "",
  permanentAddress: "",
  currentAddress: "",
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
    form.append(key, value);
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
        : "Không thể lưu thông tin học viên.",
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
