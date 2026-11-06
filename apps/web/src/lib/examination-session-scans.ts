import { API_URL, apiRequest } from "@/lib/auth";

export interface ExaminationSessionScan {
  id: number;
  examinationSessionId: number;
  uploadedByUserId: number;
  uploaderName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  sha256: string;
  note: string | null;
  createdAt: string;
}

const ROOT = "/examination-session-scans";

export function listExaminationSessionScans(
  token: string,
  sessionId: number
): Promise<ExaminationSessionScan[]> {
  return apiRequest<ExaminationSessionScan[]>(
    `${ROOT}/${sessionId}`,
    { method: "GET" },
    token
  );
}

export function uploadExaminationSessionScan(
  token: string,
  sessionId: number,
  file: File,
  note = ""
): Promise<ExaminationSessionScan> {
  const body = new FormData();

  body.set("file", file);
  body.set("note", note);

  return apiRequest<ExaminationSessionScan>(
    `${ROOT}/${sessionId}`,
    {
      method: "POST",
      body,
    },
    token
  );
}

export async function downloadExaminationSessionScan(
  token: string,
  sessionId: number,
  scanId: number,
  originalName: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}${ROOT}/${sessionId}/files/${scanId}/download`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    let message = "Không thể tải file scan.";

    try {
      const data = await response.json();

      message = Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || message;
    } catch {
      // Sử dụng thông báo mặc định.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = originalName || `scan-${scanId}`;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}
