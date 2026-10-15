export type UserRole = "super_admin" | "admin" | "user";

export type UserStatus = "active" | "inactive" | "suspended";

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    let message = "Không thể kết nối đến hệ thống.";

    try {
      const error = await response.json();

      message = Array.isArray(error.message)
        ? error.message.join(", ")
        : error.message || message;
    } catch {
      // Keep default error message.
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return apiRequest<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function refreshSession() {
  return apiRequest<AuthSession>("/auth/refresh", {
    method: "POST",
  });
}

export function logout() {
  return apiRequest<{ message: string }>("/auth/logout", {
    method: "POST",
  });
}

export function getMe(accessToken: string) {
  return apiRequest<AuthUser>("/auth/me", { method: "GET" }, accessToken);
}
