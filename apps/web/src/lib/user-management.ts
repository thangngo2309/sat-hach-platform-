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
  studentCount: number;
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

export type IntakeEmployee = {
  id: number;
  username: string;
  fullName: string;
  status?: UserStatus;
  intakeId?: number;
  createdAt?: string;
};

export type ManagedStudent = {
  id: number;
  registrationCode: string;
  fullName: string;
  dateOfBirth: string | null;
  identityNumber: string | null;
  sourceType: "manual" | "import";
  hasPhoto: boolean;
  hasBc2: boolean;
  applicationType: string | null;
  requestedLicenseClass: string | null;
  intakeCreatedAt: string;
  intakeUpdatedAt: string;
  intakeUsers: IntakeEmployee[];
};

export type ManagedStudentsResult = {
  employees: IntakeEmployee[];
  selectedUserIds: number[];
  filterUserId: number | null;
  data: ManagedStudent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export function listManagedUsers(
  token: string,
  search = ""
): Promise<ManagedUser[]> {
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set("search", search.trim());
  }

  return apiRequest<ManagedUser[]>(
    `/users${query.size ? `?${query}` : ""}`,
    { method: "GET" },
    token
  );
}

export function getManagedUsersStudents(
  token: string,
  params: {
    userIds: number[];
    filterUserId?: number | null;
    page?: number;
    limit?: number;
    search?: string;
  }
): Promise<ManagedStudentsResult> {
  const query = new URLSearchParams({
    userIds: params.userIds.join(","),
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });

  if (params.filterUserId) {
    query.set("filterUserId", String(params.filterUserId));
  }

  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }

  return apiRequest<ManagedStudentsResult>(
    `/users/students?${query}`,
    { method: "GET" },
    token
  );
}

// Giữ tương thích với nơi dùng API xem một nhân viên.
export function getManagedUserStudents(
  token: string,
  userId: number,
  params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<ManagedStudentsResult> {
  return getManagedUsersStudents(token, {
    userIds: [userId],
    ...params,
  });
}

export function createManagedUser(
  token: string,
  input: CreateUserInput
): Promise<ManagedUser> {
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
): Promise<ManagedUser> {
  return apiRequest<ManagedUser>(
    `/users/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token
  );
}
