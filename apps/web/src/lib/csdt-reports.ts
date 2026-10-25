import { API_URL, ApiError } from "@/lib/auth";

export type ReportPeriod = "month" | "quarter" | "year" | "custom";

export type VehicleFilter = "all" | "motorcycle" | "car";

export type CsdtReportParams = {
  period: ReportPeriod;
  year: number;
  month?: number;
  quarter?: number;
  fromDate?: string;
  toDate?: string;
  schoolId?: number | null;
  sessionId?: number | null;
  vehicle?: VehicleFilter;
};

export type CsdtSchool = {
  id: number;
  code: string;
  name: string;
};

export type CsdtSession = {
  id: number;
  code: string;
  examDate: string;
  centerName: string | null;
  centerCode: string | null;
};

export type CsdtFilters = {
  filters: CsdtReportParams;
  schools: CsdtSchool[];
  sessions: CsdtSession[];
};

export type CsdtSchoolMode = {
  school_id: number | null;
  exam_mode: "first" | "retake";
  schoolCode: string | null;
  schoolName: string | null;
  scheduled: number;
  sessions: number;
  motorcycle: number;
  car: number;
  absent: number;
  absent_motorcycle: number;
  absent_car: number;
  attended: number;
  passed: number;
  passed_motorcycle: number;
  passed_car: number;
  failed: number;
  pending: number;
};

export type CsdtPart = {
  school_id: number | null;
  schoolName: string | null;
  exam_mode: "first" | "retake";
  vehicle: "car" | "motorcycle";
  exam_type: string;
  passed: number;
  failed: number;
  absent: number;
  total: number;
};

export type CsdtTotal = {
  scheduled: number;
  sessions: number;
  absent: number;
  attended: number;
  passed: number;
  failed: number;
  pending: number;
  retake: number;
  uniqueStudents: number;
  motorcycleSessions: number;
  carSessions: number;
};

export type CsdtReport = {
  filters: CsdtReportParams;

  total: CsdtTotal;

  vehicles: Array<{
    vehicle: string;
    sessions: number;
    scheduled: number;
    absent: number;
    attended: number;
    passed: number;
  }>;

  distinctSessions: Array<{
    school_id: number | null;
    sessions: number;
    moto_sessions: number;
    car_sessions: number;
  }>;

  schools: CsdtSchoolMode[];
  parts: CsdtPart[];

  quality: {
    deviceErrors: number | null;
    networkErrors: number | null;
    centerType: string | null;
    note: string;
  };

  methodology: {
    unit: string;
    mode: string;
    attendance: string;
    ratio: string;
    caution: string;
  };
};

function queryString(params: CsdtReportParams) {
  const query = new URLSearchParams({
    period: params.period,
    year: String(params.year),
    month: String(params.month ?? 1),
    quarter: String(params.quarter ?? 1),
    vehicle: params.vehicle ?? "all",
  });

  if (params.period === "custom") {
    if (params.fromDate) {
      query.set("fromDate", params.fromDate);
    }

    if (params.toDate) {
      query.set("toDate", params.toDate);
    }
  }

  if (params.schoolId) {
    query.set("schoolId", String(params.schoolId));
  }

  if (params.sessionId) {
    query.set("sessionId", String(params.sessionId));
  }

  return query.toString();
}

async function get<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API_URL}/csdt-reports${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    credentials: "include",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const raw = data?.message;

    throw new ApiError(
      Array.isArray(raw)
        ? raw.join(", ")
        : typeof raw === "string"
        ? raw
        : "Không thể tải báo cáo CSDT.",
      response.status
    );
  }

  return data as T;
}

export function getCsdtReportFilters(token: string, params: CsdtReportParams) {
  return get<CsdtFilters>(token, `/filters?${queryString(params)}`);
}

export function getCsdtReport(token: string, params: CsdtReportParams) {
  return get<CsdtReport>(token, `/report?${queryString(params)}`);
}
