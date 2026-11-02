import { API_URL, ApiError } from "@/lib/auth";

export type AdministrativeProvince = {
  code: string;
  name: string;
  type: "province" | "city";
};

export type AdministrativeWard = {
  code: string;
  provinceCode: string;
  name: string;
  type: "ward" | "commune" | "special_zone";
};

export type AdministrativeImportPayload = {
  provinces: AdministrativeProvince[];
  wards: AdministrativeWard[];
};

async function request<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}/administrative-divisions${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    credentials: "include",
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
        : "Không thể tải danh mục địa bàn hành chính.",
      response.status
    );
  }

  return result as T;
}

export function getProvinces(
  token: string,
  search = ""
): Promise<AdministrativeProvince[]> {
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set("search", search.trim());
  }

  return request(token, `/provinces${query.size ? `?${query}` : ""}`);
}

export function getWards(
  token: string,
  provinceCode: string
): Promise<AdministrativeWard[]> {
  return request(token, `/provinces/${encodeURIComponent(provinceCode)}/wards`);
}

export function getWardDetail(
  token: string,
  wardCode: string
): Promise<
  AdministrativeWard & {
    provinceName: string;
    provinceType: "province" | "city";
  }
> {
  return request(token, `/wards/${encodeURIComponent(wardCode)}`);
}

export function importAdministrativeDivisions(
  token: string,
  payload: AdministrativeImportPayload
) {
  return request<{
    success: boolean;
    processedProvinces: number;
    processedWards: number;
  }>(token, "/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
