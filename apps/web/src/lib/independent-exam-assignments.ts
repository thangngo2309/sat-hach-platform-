import { apiRequest } from "@/lib/auth";

const BASE = "/independent-exam-assignments";

export interface SecretaryOption {
  id: number;
  username: string;
  fullName: string;
  status: "active" | "inactive" | "suspended";
}

export interface IndependentCandidate {
  id: number;
  fullName: string;
  identityNumber: string | null;
  registrationCode: string | null;
  dateOfBirth: string | null;
  sourceType: string;
  activeAssignmentCount: number;
  intakeCreatedAt: string | null;
}

export interface IndependentAssignment {
  id: number;
  studentId: number;
  fullName: string;
  identityNumber: string | null;
  registrationCode: string | null;
  dateOfBirth: string | null;
  examDate: string;
  examSessionCode: string | null;
  secretaryUserId: number;
  secretaryName: string;
  assignedByName: string;
  note: string | null;
  status: "assigned" | "cancelled";
  createdAt: string;
  updatedAt: string;
  cancellationReason?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
}

export interface StudentIntakeRecord {
  id: number;
  applicationType: string | null;
  requestedLicenseClass: string | null;
  trainingLicenseClass: string | null;
  examinationContent: string | null;
  certificateIssuer: string | null;
  identityIssuedDate: string | null;
  note: string | null;
  documents: unknown;
  existingLicenses: unknown;
  createdAt: string;
  intakeEmployeeName: string | null;
}

export interface IndependentAssignmentDetail {
  id: number;
  studentId: number;
  secretaryUserId: number;
  examDate: string;
  examSessionCode: string | null;
  note: string | null;
  status: "assigned" | "cancelled";
  fullName: string;
  identityNumber: string | null;
  registrationCode: string | null;
  dateOfBirth: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  cancellationReason?: string | null;
  cancelledByName?: string | null;
  cancelledAt?: string | null;
  intakes: StudentIntakeRecord[];
}

export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AssignmentListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  examDate?: string;
  secretaryUserId?: number | null;
  status?: "assigned" | "cancelled";
};

function withQuery(params: AssignmentListQuery = {}) {
  const query = new URLSearchParams();

  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.examDate) query.set("examDate", params.examDate);
  if (params.secretaryUserId) {
    query.set("secretaryUserId", String(params.secretaryUserId));
  }
  if (params.status) query.set("status", params.status);

  return query.toString();
}

export function getIndependentSecretaries(token: string) {
  return apiRequest<SecretaryOption[]>(
    `${BASE}/secretaries`,
    { method: "GET" },
    token
  );
}

export function searchIndependentCandidates(
  token: string,
  params: AssignmentListQuery
) {
  return apiRequest<PagedResult<IndependentCandidate>>(
    `${BASE}/candidates?${withQuery(params)}`,
    { method: "GET" },
    token
  );
}

export function listIndependentAssignments(
  token: string,
  params: AssignmentListQuery = {}
) {
  return apiRequest<PagedResult<IndependentAssignment>>(
    `${BASE}?${withQuery(params)}`,
    { method: "GET" },
    token
  );
}

export function assignIndependentStudents(
  token: string,
  payload: {
    studentIds: number[];
    secretaryUserId: number;
    examDate: string;
    examSessionCode?: string;
    note?: string;
  }
) {
  return apiRequest<{
    examDate: string;
    secretaryUserId: number;
    total: number;
    assignments: Array<{
      id: number;
      studentId: number;
      action: string;
    }>;
  }>(
    `${BASE}/assign`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token
  );
}

export function getIndependentAssignmentDetail(token: string, id: number) {
  return apiRequest<IndependentAssignmentDetail>(
    `${BASE}/${id}`,
    { method: "GET" },
    token
  );
}

export function cancelIndependentAssignment(
  token: string,
  id: number,
  reason: string
) {
  return apiRequest<{
    id: number;
    status: "cancelled";
    cancellationReason: string;
  }>(
    `${BASE}/${id}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim(),
      }),
    },
    token
  );
}

export interface AssignmentHistoryItem {
  id: number;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actorName: string;
}

export function getIndependentAssignmentHistory(token: string, id: number) {
  return apiRequest<AssignmentHistoryItem[]>(
    `${BASE}/${id}/history`,
    { method: "GET" },
    token
  );
}
