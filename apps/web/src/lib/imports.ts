import { API_URL, ApiError } from "@/lib/auth";

export type Bc1Student = {
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  fileNumber: string | null;
};

export type Bc1Preview = {
  type: "BC1";
  fileName: string;
  fileSize: number;
  sha256: string;
  alreadyImported: boolean;
  existingImportId: number | null;
  reportCode: string | null;
  school: {
    code: string;
    name: string;
  };
  course: {
    code: string;
    name: string;
    licenseClass: string | null;
  };
  totalStudents: number;
  students: Bc1Student[];
  previewLimit: number;
};

export type Bc1ImportResult = {
  id: number;
  type: "BC1";
  totalStudents: number;
  newStudents: number;
  newEnrollments: number;
  skippedEnrollments: number;
};

export type Bc1HistoryItem = {
  id: number;
  fileName: string;
  reportCode: string | null;
  schoolCode: string;
  courseCode: string;
  totalStudents: number;
  newStudents: number;
  newEnrollments: number;
  skippedEnrollments: number;
  importedAt: string;
  importedBy: string | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const rawMessage = data?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : typeof rawMessage === "string"
      ? rawMessage
      : "Không thể xử lý yêu cầu.";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

async function uploadBc1<T>(
  action: "preview" | "confirm",
  file: File,
  accessToken: string
): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${API_URL}/imports/bc1/${action}`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return parseResponse<T>(response);
}

export function previewBc1(file: File, accessToken: string) {
  return uploadBc1<Bc1Preview>("preview", file, accessToken);
}

export function confirmBc1(file: File, accessToken: string) {
  return uploadBc1<Bc1ImportResult>("confirm", file, accessToken);
}

export async function getBc1History(accessToken: string) {
  const response = await fetch(`${API_URL}/imports/bc1/history`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  return parseResponse<Bc1HistoryItem[]>(response);
}
