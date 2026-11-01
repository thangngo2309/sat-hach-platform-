import { API_URL, apiRequest } from "@/lib/auth";

export type ReceivedFileType = "bc2_result" | "exam_48";

export interface ReceivedFile {
  id: number;
  fileType: ReceivedFileType;
  status: "approved";
  importStatus: string;
  originalName: string;
  sizeBytes: string;
  currentVersion: number;
  sha256: string;
  uploadedByUserId: number;
  uploaderName: string;
  trainingSchoolId: number | null;
  trainingSchoolCode: string | null;
  trainingSchoolName: string | null;
  examinationCenterId: number | null;
  examinationCenterCode: string | null;
  examinationCenterName: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export function listReceivedFiles(
  accessToken: string
): Promise<ReceivedFile[]> {
  return apiRequest<ReceivedFile[]>(
    "/received-files",
    { method: "GET" },
    accessToken
  );
}

export async function downloadReceivedFile(
  accessToken: string,
  item: ReceivedFile
): Promise<void> {
  const response = await fetch(
    `${API_URL}/received-files/${item.id}/download`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    let message = "Không thể tải file được nhận.";

    try {
      const error = await response.json();

      message = Array.isArray(error.message)
        ? error.message.join(", ")
        : error.message || message;
    } catch {
      // Giữ thông báo mặc định.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = item.originalName || `received-${item.id}`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 30000);
}
