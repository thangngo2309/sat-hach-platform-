import { apiRequest } from "@/lib/auth";

export type ExamSessionSecretaryOption = {
  id: number;
  username: string;
  fullName: string;
};

export type ExamSessionSecretary = {
  id: number;
  code: string;
  tempCode: string | null;
  officialCode: string | null;
  trackingCode: string | null;
  examinationCenterId: number;
  centerCode: string;
  centerName: string;
  examDate: string | null;
  completedAt: string | null;
  secretaryUserId: number | null;
  secretaryName: string | null;
  secretaryUsername: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  assignmentNote: string | null;
  candidateCount: number;
  fileCount: number;
};

export type ExamSessionAssignmentHistory = {
  id: number;
  secretaryUserId: number;
  secretaryName: string;
  assignedByUserId: number;
  assignedByName: string;
  assignedAt: string;
  revokedAt: string | null;
  note: string | null;
};

export type ExamSessionSecretaryDetail = ExamSessionSecretary & {
  assignmentHistory: ExamSessionAssignmentHistory[];
};

const BASE = "/examination-session-secretaries";

export function listSecretaryExamSessions(token: string, search = "") {
  const query = search.trim()
    ? `?search=${encodeURIComponent(search.trim())}`
    : "";

  return apiRequest<ExamSessionSecretary[]>(
    `${BASE}${query}`,
    { method: "GET" },
    token
  );
}

export function listExamSecretaries(token: string) {
  return apiRequest<ExamSessionSecretaryOption[]>(
    `${BASE}/secretaries`,
    { method: "GET" },
    token
  );
}

export function getSecretaryExamSession(token: string, id: number) {
  return apiRequest<ExamSessionSecretaryDetail>(
    `${BASE}/${id}`,
    { method: "GET" },
    token
  );
}

export function assignExamSessionSecretary(
  token: string,
  id: number,
  secretaryUserId: number,
  note = ""
) {
  return apiRequest<ExamSessionSecretaryDetail>(
    `${BASE}/${id}/assign`,
    {
      method: "POST",
      body: JSON.stringify({ secretaryUserId, note }),
    },
    token
  );
}

export function unassignExamSessionSecretary(token: string, id: number) {
  return apiRequest<ExamSessionSecretaryDetail>(
    `${BASE}/${id}/unassign`,
    { method: "POST" },
    token
  );
}

export function completeExamSession(token: string, id: number) {
  return apiRequest<ExamSessionSecretaryDetail>(
    `${BASE}/${id}/complete`,
    { method: "POST" },
    token
  );
}

export function updateExamSessionTrackingCode(
  token: string,
  id: number,
  trackingCode: string
) {
  return apiRequest<ExamSessionSecretaryDetail>(
    `${BASE}/${id}/tracking-code`,
    {
      method: "PATCH",
      body: JSON.stringify({ trackingCode }),
    },
    token
  );
}
