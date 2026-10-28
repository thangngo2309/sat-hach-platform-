import { apiRequest, type UserRole, type UserStatus } from "@/lib/auth";

export type ManagedUser = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserInput = {
  username: string;
  fullName: string;
  password: string;
};

export type UpdateUserInput = {
  fullName?: string;
  status?: UserStatus;
  password?: string;
};

export function listManagedUsers(
  token: string,
  search = ""
): Promise<ManagedUser[]> {
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set("search", search.trim());
  }

  const suffix = query.toString();

  return apiRequest<ManagedUser[]>(
    `/users${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
    token
  );
}

export function createManagedUser(token: string, input: CreateUserInput) {
  return apiRequest<ManagedUser>(
    "/users",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token
  );
}

export function updateManagedUser(
  token: string,
  id: number,
  input: UpdateUserInput
) {
  return apiRequest<ManagedUser>(
    `/users/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token
  );
}
