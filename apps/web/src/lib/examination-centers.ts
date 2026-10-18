import { API_URL, ApiError } from "@/lib/auth";
import type { PageResult } from "@/lib/catalog";

export type ExaminationCenterNameSource = "manual" | "xml";

export type ExaminationCenter = {
  id: number;
  code: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  note: string | null;
  nameSource: ExaminationCenterNameSource;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExaminationCenterInput = {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  note?: string | null;
  isActive?: boolean;
};

export type ExaminationCenterListParams = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | null;
};

async function request<T>(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    credentials: "include",
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : typeof data?.message === "string"
      ? data.message
      : "Có lỗi xảy ra khi xử lý trung tâm sát hạch.";

    throw new ApiError(message, response.status);
  }

  return data as T;
}

export function getExaminationCenters(
  token: string,
  params: ExaminationCenterListParams = {}
) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.isActive !== null && params.isActive !== undefined) {
    query.set("isActive", String(params.isActive));
  }

  return request<PageResult<ExaminationCenter>>(
    `/examination-centers?${query.toString()}`,
    token
  );
}

export function getExaminationCenter(token: string, id: number) {
  return request<ExaminationCenter>(`/examination-centers/${id}`, token);
}

export function createExaminationCenter(
  token: string,
  data: ExaminationCenterInput
) {
  return request<ExaminationCenter>("/examination-centers", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateExaminationCenter(
  token: string,
  id: number,
  data: Partial<ExaminationCenterInput>
) {
  return request<ExaminationCenter>(`/examination-centers/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
