import { API_URL, ApiError } from "@/lib/auth";

export type StudentScanIntake = {
  id: number;
  studentId: number;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
};

export type StudentScanAttachment = {
  id: number;
  studentIntakeId: number;
  uploadedByUserId: number;
  uploadedByName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  createdAt: string;
};

async function request<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
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
        : "Không thể xử lý hồ sơ scan.",
      response.status
    );
  }

  return data as T;
}

export function listStudentScanIntakes(token: string, studentId: number) {
  return request<StudentScanIntake[]>(
    token,
    `/students/${studentId}/scans/intakes`
  );
}

export function listStudentScans(
  token: string,
  studentId: number,
  intakeId: number
) {
  return request<StudentScanAttachment[]>(
    token,
    `/students/${studentId}/scans?intakeId=${intakeId}`
  );
}

export function uploadStudentScan(
  token: string,
  studentId: number,
  intakeId: number,
  file: File
) {
  const body = new FormData();

  body.set("intakeId", String(intakeId));
  body.set("file", file, file.name);

  return request<{
    id: number;
    studentIntakeId: number;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
    sha256: string;
  }>(token, `/students/${studentId}/scans`, {
    method: "POST",
    body,
  });
}

export async function downloadStudentScan(
  token: string,
  studentId: number,
  intakeId: number,
  attachment: StudentScanAttachment
): Promise<void> {
  const url =
    `${API_URL}/students/${studentId}` +
    `/scans/${attachment.id}/download` +
    `?intakeId=${intakeId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);

    const raw = result?.message;

    throw new ApiError(
      Array.isArray(raw)
        ? raw.join(", ")
        : typeof raw === "string"
        ? raw
        : "Không thể tải hồ sơ scan.",
      response.status
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = attachment.originalName;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30000);
}
