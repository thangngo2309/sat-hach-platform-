import { API_URL, apiRequest } from "@/lib/auth";

export type Pc08DeliveryStatus = "pending" | "approved" | "rejected";

export interface Pc08FinalResultSession {
  id: number;
  code: string;
  officialCode: string | null;
  completedAt: string | null;
}

export interface Pc08FinalResultSchool {
  id: number;
  code: string;
  name: string;
  candidateCount: number;
}

export interface Pc08FinalResultDelivery {
  id: number;
  examinationSessionId: number;
  trainingSchoolId: number;
  schoolCode: string;
  schoolName: string;
  status: Pc08DeliveryStatus;
  currentVersion: number;
  originalName: string;
  sizeBytes: string;
  uploadedByUserId: number;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
}

export interface Pc08FinalResultState {
  revision: number;
  confirmedRevision: number | null;
  confirmedByUserId: number | null;
  confirmedAt: string | null;
  confirmationNote: string | null;
  publishedAt: string | null;
}

export interface Pc08FinalResultSessionStatus {
  session: Pc08FinalResultSession;
  schools: Pc08FinalResultSchool[];
  deliveries: Pc08FinalResultDelivery[];
  missingSchools: Pc08FinalResultSchool[];
  state: Pc08FinalResultState | null;
  confirmationValid: boolean;
  canConfirm: boolean;
}

export interface Pc08FinalResultReviewResponse {
  deliveryId: number;
  sessionId: number;
  status: Pc08DeliveryStatus;
  sessionCompleted: boolean;
  message?: string;
}

export interface Pc08ReceivedFinalResult {
  id: number;
  examinationSessionId: number;
  sessionCode: string;
  trainingSchoolId: number;
  originalName: string;
  sizeBytes: string;
  publishedAt: string;
}

const ROOT = "/pc08-final-results";

export function getPc08FinalResultSession(
  token: string,
  sessionId: number
): Promise<Pc08FinalResultSessionStatus> {
  return apiRequest<Pc08FinalResultSessionStatus>(
    `${ROOT}/sessions/${sessionId}`,
    { method: "GET" },
    token
  );
}

export function uploadPc08FinalResult(
  token: string,
  sessionId: number,
  schoolId: number,
  file: File
): Promise<{
  deliveryId: number;
  version: number;
  sessionId: number;
  schoolId: number;
  status: "pending";
}> {
  const body = new FormData();
  body.set("file", file);

  return apiRequest(
    `${ROOT}/sessions/${sessionId}/schools/${schoolId}/upload`,
    {
      method: "POST",
      body,
    },
    token
  );
}

export function confirmPc08FinalResults(
  token: string,
  sessionId: number,
  note: string
): Promise<Pc08FinalResultSessionStatus> {
  return apiRequest<Pc08FinalResultSessionStatus>(
    `${ROOT}/sessions/${sessionId}/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmed: true,
        note,
      }),
    },
    token
  );
}

export function reviewPc08FinalResult(
  token: string,
  deliveryId: number,
  action: "approve" | "reject",
  reason?: string
): Promise<Pc08FinalResultReviewResponse> {
  return apiRequest<Pc08FinalResultReviewResponse>(
    `${ROOT}/files/${deliveryId}/review`,
    {
      method: "POST",
      body: JSON.stringify({
        action,
        reason: reason ?? "",
      }),
    },
    token
  );
}

export function listPc08ReceivedFinalResults(
  token: string
): Promise<Pc08ReceivedFinalResult[]> {
  return apiRequest<Pc08ReceivedFinalResult[]>(
    `${ROOT}/received`,
    { method: "GET" },
    token
  );
}

export async function downloadPc08FinalResult(
  token: string,
  deliveryId: number,
  originalName: string
): Promise<void> {
  const response = await fetch(
    `${API_URL}${ROOT}/files/${deliveryId}/download`,
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
    let message = "Không thể tải file KQSH.";

    try {
      const result: {
        message?: string | string[];
      } = await response.json();

      if (Array.isArray(result.message)) {
        message = result.message.join(", ");
      } else if (typeof result.message === "string") {
        message = result.message;
      }
    } catch {
      // Giữ thông báo mặc định.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = originalName || `KQSH-${deliveryId}.xml`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30000);
  }
}

export function formatPc08ResultDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function formatPc08ResultSize(sizeBytes: string | number): string {
  const bytes = Number(sizeBytes);

  if (!Number.isFinite(bytes)) return "—";

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
