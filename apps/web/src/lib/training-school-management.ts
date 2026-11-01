import { API_URL, apiRequest } from "@/lib/auth";

export type SchoolInfoSource = "xml" | "manual" | "excel";

export interface ManagedTrainingSchool {
  id: number;
  code: string;
  name: string;
  address: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  isActive: boolean;
  infoSource: SchoolInfoSource;
  courseCount?: number;
  enrollmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedSchoolPage {
  data: ManagedTrainingSchool[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type SchoolForm = {
  code: string;
  name: string;
  provinceCode: string;
  provinceName: string;
  address: string;
  isActive: boolean;
};

export interface SchoolImportRow {
  rowNumber: number;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  action: "create" | "update" | "unchanged";
  current: {
    id: number;
    code: string;
    name: string;
    address: string | null;
    isActive: boolean;
    infoSource: string;
  } | null;
}

export interface SchoolImportPreview {
  fileName: string;
  sha256: string;
  totalRows: number;
  createCount: number;
  updateCount: number;
  unchangedCount: number;
  rows: SchoolImportRow[];
}

export interface SchoolImportResult {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
}

export interface SchoolImportHistory {
  id: string;
  fileName: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  createdAt: string;
  importedBy: string | null;
}

export function listManagedSchools(
  token: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  return apiRequest<ManagedSchoolPage>(
    `/catalog/schools/manage?${query}`,
    { method: "GET" },
    token
  );
}

export function createManagedSchool(token: string, data: SchoolForm) {
  return apiRequest<ManagedTrainingSchool>(
    "/catalog/schools",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    token
  );
}

export function updateManagedSchool(
  token: string,
  id: number,
  data: SchoolForm
) {
  return apiRequest<ManagedTrainingSchool>(
    `/catalog/schools/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    },
    token
  );
}

async function postExcel<T>(
  token: string,
  endpoint: string,
  file: File,
  sha256?: string
): Promise<T> {
  const formData = new FormData();

  formData.set("file", file);

  if (sha256) {
    formData.set("sha256", sha256);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = Array.isArray(error?.message)
      ? error.message.join(", ")
      : typeof error?.message === "string"
      ? error.message
      : "Không thể xử lý file Excel.";

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export function previewSchoolExcel(token: string, file: File) {
  return postExcel<SchoolImportPreview>(
    token,
    "/catalog/schools/imports/preview",
    file
  );
}

export function confirmSchoolExcel(token: string, file: File, sha256: string) {
  return postExcel<SchoolImportResult>(
    token,
    "/catalog/schools/imports/confirm",
    file,
    sha256
  );
}

export function getSchoolImportHistory(token: string) {
  return apiRequest<SchoolImportHistory[]>(
    "/catalog/schools/imports/history",
    { method: "GET" },
    token
  );
}
