import { apiRequest, type UserRole, type UserStatus } from "@/lib/auth";

export type OrganizationRole =
  | "training_school"
  | "pc08_staff"
  | "exam_center"
  | "exam_secretary";

export type OrganizationOption = {
  id: number;
  code: string;
  name: string | null;
};

export type OrganizationOptions = {
  trainingSchools: OrganizationOption[];
  examinationCenters: OrganizationOption[];
};

export type OrganizationAccount = {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;

  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;

  trainingSchoolId: number | null;
  trainingSchoolCode: string | null;
  trainingSchoolName: string | null;

  examinationCenterId: number | null;
  examinationCenterCode: string | null;
  examinationCenterName: string | null;
};

export type CreateOrganizationAccountInput = {
  username: string;
  fullName: string;
  password: string;
  role: OrganizationRole;

  trainingSchoolId?: number | null;
  examinationCenterId?: number | null;
};

export type UpdateOrganizationAccountInput = {
  fullName?: string;
  password?: string;
  status?: UserStatus;

  trainingSchoolId?: number | null;
  examinationCenterId?: number | null;
};

export function listOrganizationAccounts(token: string, search = "") {
  const query = new URLSearchParams();

  if (search.trim()) {
    query.set("search", search.trim());
  }

  const suffix = query.toString();

  return apiRequest<OrganizationAccount[]>(
    `/organization-accounts${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
    token
  );
}

export function getOrganizationAccountOptions(token: string) {
  return apiRequest<OrganizationOptions>(
    "/organization-accounts/options",
    { method: "GET" },
    token
  );
}

export function createOrganizationAccount(
  token: string,
  input: CreateOrganizationAccountInput
) {
  return apiRequest<OrganizationAccount>(
    "/organization-accounts",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token
  );
}

export function updateOrganizationAccount(
  token: string,
  id: number,
  input: UpdateOrganizationAccountInput
) {
  return apiRequest<OrganizationAccount>(
    `/organization-accounts/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
    token
  );
}
