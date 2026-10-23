"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import {
  ExpandLessOutlined,
  ExpandMoreOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { ExportExcelButton } from "@/components/common/ExportExcelButton";

import {
  getExamResults,
  type ExamResultCandidate,
  type ExamResultsPage,
} from "@/lib/exam-results";

import { exportExcel, type ExcelSheet } from "@/lib/excel-export";

// ============================================================
// CONSTANTS & TYPES
// ============================================================

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 100;

type SchoolOption = {
  value: string;
  label: string;
  count: number;
};

type ExamFilters = {
  search: string;
  status: string;
  candidateType: string;
};

type LoadedCandidates = {
  candidates: ExamResultCandidate[];
  first: ExamResultsPage;
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(value?: string | null) {
  if (!value) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatNumber(value?: number | null) {
  return Number(value ?? 0).toLocaleString("vi-VN");
}

function resultText(status: string | null, hasResult = true) {
  if (!hasResult) return "Chưa có kết quả";

  if (status === "DA") return "Đạt";
  if (status === "RO") return "Không đạt";
  if (status === "VA") return "Vắng";

  return status || "Chưa rõ";
}

function candidateTypeText(value: string) {
  if (value === "independent") return "Thí sinh tự do";
  if (value === "training") return "Học viên CSDT";

  return "Chưa xác định";
}

function hasAbsentPart(item: ExamResultCandidate) {
  return (
    item.hasAbsentPart === true ||
    item.resultStatus === "VA" ||
    (item.parts ?? []).some((part) => part.resultStatus === "VA")
  );
}

/**
 * Khóa nhận diện CSDT:
 * - Ưu tiên mã CSDT.
 * - Fallback theo tên nếu không có mã.
 * - Phân biệt thí sinh tự do.
 */
function getSchoolKey(item: ExamResultCandidate): string {
  if (item.candidateType === "independent") {
    return "__independent__";
  }

  const schoolCode = item.schoolCode?.trim();

  if (schoolCode) {
    return `code:${schoolCode}`;
  }

  const schoolName = item.schoolName?.trim();

  if (schoolName) {
    return `name:${schoolName}`;
  }

  return "__unknown__";
}

function getSchoolLabel(item: ExamResultCandidate): string {
  if (item.candidateType === "independent") {
    return "Thí sinh tự do";
  }

  const name = item.schoolName?.trim();
  const code = item.schoolCode?.trim();

  if (name && code && name !== code) {
    return `${name} (${code})`;
  }

  return name || code || "Chưa xác định CSDT";
}

function buildSchoolOptions(candidates: ExamResultCandidate[]): SchoolOption[] {
  const map = new Map<string, SchoolOption>();

  for (const item of candidates) {
    const value = getSchoolKey(item);
    const current = map.get(value);

    if (current) {
      current.count++;
      continue;
    }

    map.set(value, {
      value,
      label: getSchoolLabel(item),
      count: 1,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "vi")
  );
}

function filterBySchool(
  candidates: ExamResultCandidate[],
  schoolKey: string
): ExamResultCandidate[] {
  if (!schoolKey) return candidates;

  return candidates.filter((item) => getSchoolKey(item) === schoolKey);
}

/**
 * Tải đủ thí sinh trên tất cả các trang API.
 * API vẫn xử lý search/status/candidateType.
 *
 * Không giới hạn ở 20 học viên đang hiển thị.
 */
async function fetchAllCandidates(
  token: string,
  code: string,
  filters: ExamFilters
): Promise<LoadedCandidates> {
  const first = await getExamResults(token, code, {
    page: 1,
    limit: EXPORT_PAGE_SIZE,
    search: filters.search,
    status: filters.status,
    candidateType: filters.candidateType,
  });

  const candidates = [...first.data];

  const totalPages = Math.max(
    1,
    Math.ceil(first.pagination.total / EXPORT_PAGE_SIZE)
  );

  for (let page = 2; page <= totalPages; page++) {
    const response = await getExamResults(token, code, {
      page,
      limit: EXPORT_PAGE_SIZE,
      search: filters.search,
      status: filters.status,
      candidateType: filters.candidateType,
    });

    candidates.push(...response.data);
  }

  return { first, candidates };
}

// ============================================================
// EXCEL EXPORT
// ============================================================

async function exportFilteredExamExcel(
  token: string,
  code: string,
  filters: ExamFilters,
  schoolKey: string,
  schoolLabel: string
) {
  const { candidates, first } = await fetchAllCandidates(token, code, filters);

  const selected = filterBySchool(candidates, schoolKey);

  const summary = first.summary;
  const session = first.session;

  const passed = selected.filter(
    (item) => item.hasResult && item.resultStatus === "DA"
  ).length;

  const failed = selected.filter(
    (item) => item.hasResult && item.resultStatus === "RO"
  ).length;

  const absent = selected.filter(hasAbsentPart).length;

  const pending = selected.filter((item) => !item.hasResult).length;

  const withResults = selected.filter((item) => item.hasResult).length;

  const subtitle = [
    `Kỳ: ${session.code}`,
    `Ngày: ${formatDate(session.examDate)}`,
    `CSDT: ${schoolLabel}`,
    `Kết quả: ${filters.status || "Tất cả"}`,
    `Loại thí sinh: ${filters.candidateType || "Tất cả"}`,
    filters.search ? `Tìm kiếm: ${filters.search}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const sheets: ExcelSheet[] = [
    {
      name: "Tong hop",
      title: "BÁO CÁO KẾT QUẢ KỲ SÁT HẠCH",
      subtitle,
      columns: [
        { header: "Chỉ tiêu", key: "label", width: 42 },
        { header: "Giá trị", key: "value", width: 32 },
      ],
      rows: [
        {
          label: "Mã kỳ sát hạch",
          value: session.code,
        },
        {
          label: "Ngày sát hạch",
          value: formatDate(session.examDate),
        },
        {
          label: "Trung tâm sát hạch",
          value: session.centerName || session.centerCode,
        },
        {
          label: "CSDT đang lọc",
          value: schoolLabel,
        },
        {
          label: "Tổng thí sinh toàn kỳ",
          value: summary.total,
        },
        {
          label: "Đạt toàn kỳ",
          value: summary.passed,
        },
        {
          label: "Không đạt toàn kỳ",
          value: summary.failed,
        },
        {
          label: "Vắng toàn kỳ",
          value: summary.absent,
        },
        {
          label: "Thí sinh phù hợp bộ lọc",
          value: selected.length,
        },
        {
          label: "Đã có kết quả trong bộ lọc",
          value: withResults,
        },
        {
          label: "Đạt trong bộ lọc",
          value: passed,
        },
        {
          label: "Không đạt trong bộ lọc",
          value: failed,
        },
        {
          label: "Vắng trong bộ lọc",
          value: absent,
        },
        {
          label: "Chờ kết quả trong bộ lọc",
          value: pending,
        },
      ],
    },
    {
      name: "Danh sach thi sinh",
      title: "DANH SÁCH THÍ SINH SÁT HẠCH",
      subtitle,
      columns: [
        { header: "STT", key: "order", width: 10 },
        { header: "SBD", key: "examinationNumber", width: 14 },
        { header: "Mã đăng ký", key: "registrationCode", width: 30 },
        { header: "Họ và tên", key: "fullName", width: 32 },
        { header: "CCCD", key: "identityNumber", width: 23 },
        { header: "Loại thí sinh", key: "candidateType", width: 25 },
        { header: "Mã CSDT", key: "schoolCode", width: 18 },
        { header: "Cơ sở đào tạo", key: "schoolName", width: 38 },
        { header: "Mã khóa", key: "courseCode", width: 25 },
        { header: "Hạng", key: "licenseClass", width: 12 },
        { header: "Lý thuyết", key: "theoryScore", width: 17 },
        { header: "Hình", key: "practicalScore", width: 17 },
        { header: "Đường", key: "roadScore", width: 17 },
        { header: "Kết quả", key: "resultStatus", width: 20 },
        { header: "Có phần vắng", key: "hasAbsent", width: 19 },
      ],
      rows: selected.map((item, index) => ({
        order: index + 1,
        examinationNumber: item.examinationNumber ?? "",
        registrationCode: item.registrationCode,
        fullName: item.fullName,
        identityNumber: item.identityNumber ?? "",
        candidateType: candidateTypeText(item.candidateType),
        schoolCode: item.schoolCode ?? "",
        schoolName: item.schoolName ?? "",
        courseCode: item.courseCode ?? "",
        licenseClass: item.licenseClass ?? "",
        theoryScore: item.theoryScore ?? "",
        practicalScore: item.practicalScore ?? "",
        roadScore: item.roadScore ?? "",
        resultStatus: resultText(item.resultStatus, item.hasResult),
        hasAbsent: hasAbsentPart(item) ? "Có" : "Không",
      })),
    },
    {
      name: "Chi tiet phan thi",
      title: "CHI TIẾT KẾT QUẢ TỪNG PHẦN THI",
      subtitle,
      columns: [
        { header: "STT thí sinh", key: "order", width: 14 },
        { header: "SBD", key: "examinationNumber", width: 14 },
        { header: "Mã đăng ký", key: "registrationCode", width: 30 },
        { header: "Họ và tên", key: "fullName", width: 32 },
        { header: "Cơ sở đào tạo", key: "schoolName", width: 38 },
        { header: "Mã khóa", key: "courseCode", width: 24 },
        { header: "Hạng", key: "licenseClass", width: 12 },
        { header: "Lần ghi", key: "partOrder", width: 12 },
        { header: "Loại thi", key: "examType", width: 20 },
        { header: "Ngày thi", key: "examDate", width: 18 },
        { header: "Điểm", key: "score", width: 16 },
        { header: "Điểm tối đa", key: "maximumScore", width: 18 },
        { header: "Kết quả phần", key: "partResult", width: 20 },
        { header: "Kết quả tổng", key: "overallResult", width: 20 },
      ],
      rows: selected.flatMap((item, index) =>
        (item.parts ?? []).map((part) => ({
          order: index + 1,
          examinationNumber: item.examinationNumber ?? "",
          registrationCode: item.registrationCode,
          fullName: item.fullName,
          schoolName: item.schoolName ?? "",
          courseCode: item.courseCode ?? "",
          licenseClass: item.licenseClass ?? "",
          partOrder: part.partOrder,
          examType: part.examType,
          examDate: formatDate(part.examDate),
          score: part.score ?? "",
          maximumScore: part.maximumScore ?? "",
          partResult: resultText(part.resultStatus),
          overallResult: resultText(item.resultStatus, item.hasResult),
        }))
      ),
    },
  ];

  const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, "-");

  const schoolSuffix = schoolKey
    ? schoolKey.replace(/[^a-zA-Z0-9_-]/g, "-")
    : "ALL";

  await exportExcel(
    `Ket-qua-sat-hach_${safeCode}_CSDT-${schoolSuffix}.xlsx`,
    sheets
  );
}

// ============================================================
// RESULT CHIP
// ============================================================

function ResultChip({
  status,
  hasResult = true,
}: {
  status: string | null;
  hasResult?: boolean;
}) {
  if (!hasResult) {
    return <Chip size="small" label="Chưa có kết quả" variant="outlined" />;
  }

  if (status === "DA") {
    return <Chip size="small" color="success" label="Đạt" />;
  }

  if (status === "RO") {
    return <Chip size="small" color="error" label="Không đạt" />;
  }

  if (status === "VA") {
    return <Chip size="small" color="warning" label="Vắng" />;
  }

  return <Chip size="small" label={status || "Chưa rõ"} variant="outlined" />;
}

// ============================================================
// CANDIDATE ROW
// ============================================================

function CandidateRow({ item }: { item: ExamResultCandidate }) {
  const [expanded, setExpanded] = useState(false);

  const parts = Array.isArray(item.parts) ? item.parts : [];

  const absent = hasAbsentPart(item);

  return (
    <>
      <TableRow
        hover
        sx={
          absent
            ? {
                bgcolor: "rgba(237, 108, 2, 0.035)",
              }
            : undefined
        }
      >
        <TableCell sx={{ width: 48 }}>
          <IconButton
            size="small"
            onClick={() => setExpanded((current) => !current)}
            aria-label={
              expanded ? "Thu gọn chi tiết phần thi" : "Mở chi tiết phần thi"
            }
          >
            {expanded ? (
              <ExpandLessOutlined fontSize="small" />
            ) : (
              <ExpandMoreOutlined fontSize="small" />
            )}
          </IconButton>
        </TableCell>

        <TableCell sx={{ whiteSpace: "nowrap" }}>
          {item.examinationNumber ?? "—"}
        </TableCell>

        <TableCell>
          <Stack
            direction="row"
            sx={{ minWidth: 190, spacing: 1.5, alignItems: "center" }}
          >
            <Box sx={{ flexShrink: 0 }}>
              <StudentAvatar
                studentId={item.studentId}
                fullName={item.fullName}
                size={44}
              />
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  overflowWrap: "anywhere",
                }}
              >
                {item.fullName}
              </Typography>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  overflowWrap: "anywhere",
                }}
              >
                {item.registrationCode}
              </Typography>

              {absent && (
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label="Có phần thi vắng"
                  />
                </Box>
              )}
            </Box>
          </Stack>
        </TableCell>

        <TableCell>
          {item.candidateType === "independent"
            ? "Tự do"
            : item.schoolName || item.schoolCode || "Chưa xác định"}
        </TableCell>

        <TableCell>{item.licenseClass ?? "—"}</TableCell>

        <TableCell align="center">{item.theoryScore ?? "—"}</TableCell>

        <TableCell align="center">{item.practicalScore ?? "—"}</TableCell>

        <TableCell align="center">{item.roadScore ?? "—"}</TableCell>

        <TableCell>
          <Stack sx={{ spacing: 0.5, alignItems: "flex-start" }}>
            <ResultChip status={item.resultStatus} hasResult={item.hasResult} />

            {absent && item.resultStatus !== "VA" && (
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ fontWeight: 600 }}
              >
                Có phần thi vắng
              </Typography>
            )}
          </Stack>
        </TableCell>
      </TableRow>

      <TableRow>
        <TableCell
          colSpan={9}
          sx={{
            py: 0,
            borderBottom: expanded ? undefined : 0,
          }}
        >
          <Collapse in={expanded} unmountOnExit>
            <Box
              sx={{
                px: { xs: 1.5, md: 3 },
                py: 2,
                bgcolor: "action.hover",
              }}
            >
              <Typography sx={{ fontWeight: 700, mb: 1 }}>
                Chi tiết các phần thi
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                CCCD: {item.identityNumber ?? "—"}
                {" · "}
                Khóa học: {item.courseCode ?? "—"}
                {" · "}
                Mã CSDT: {item.schoolCode ?? "—"}
              </Typography>

              {absent && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Thí sinh có ít nhất một phần thi được ghi nhận trạng thái vắng
                  (VA).
                </Alert>
              )}

              <TableContainer>
                <Table size="small" sx={{ minWidth: 600 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Lần ghi</TableCell>
                      <TableCell>Loại thi</TableCell>
                      <TableCell>Ngày thi</TableCell>
                      <TableCell>Điểm</TableCell>
                      <TableCell>Điểm tối đa</TableCell>
                      <TableCell>Kết quả</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {parts.map((part) => (
                      <TableRow
                        key={part.id}
                        sx={
                          part.resultStatus === "VA"
                            ? {
                                bgcolor: "rgba(237, 108, 2, 0.06)",
                              }
                            : undefined
                        }
                      >
                        <TableCell>{part.partOrder}</TableCell>
                        <TableCell>{part.examType}</TableCell>
                        <TableCell>{formatDate(part.examDate)}</TableCell>
                        <TableCell>{part.score ?? "—"}</TableCell>
                        <TableCell>{part.maximumScore ?? "—"}</TableCell>
                        <TableCell>
                          <ResultChip status={part.resultStatus} />
                        </TableCell>
                      </TableRow>
                    ))}

                    {!parts.length && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          Chưa có dữ liệu phần thi.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ExamDetailPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;

  const { accessToken } = useAuth();

  const [result, setResult] = useState<ExamResultsPage | null>(null);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [candidateType, setCandidateType] = useState("");

  // Bộ lọc CSDT mới
  const [schoolKey, setSchoolKey] = useState("");

  // Danh sách CSDT lấy từ toàn bộ thí sinh của kỳ
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);

  const [schoolOptionsLoading, setSchoolOptionsLoading] = useState(false);

  // Dữ liệu đầy đủ đã áp dụng filter API,
  // dùng khi user chọn một CSDT cụ thể.
  const [schoolCandidates, setSchoolCandidates] = useState<
    ExamResultCandidate[]
  >([]);

  const [schoolCandidatesLoading, setSchoolCandidatesLoading] = useState(false);

  const [schoolCandidatesReady, setSchoolCandidatesReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ==========================================================
  // LOAD CSDT OPTIONS
  // ==========================================================

  useEffect(() => {
    if (!accessToken || !code) return;

    let active = true;

    setSchoolOptionsLoading(true);
    setSchoolOptions([]);

    void fetchAllCandidates(accessToken, code, {
      search: "",
      status: "",
      candidateType: "",
    })
      .then(({ candidates }) => {
        if (!active) return;

        const nextOptions = buildSchoolOptions(candidates);
        setSchoolOptions(nextOptions);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error ? err.message : "Không thể tải danh sách CSDT."
        );
      })
      .finally(() => {
        if (active) {
          setSchoolOptionsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, code]);

  // ==========================================================
  // LOAD NORMAL PAGINATED DATA
  // ==========================================================

  const load = useCallback(async () => {
    if (!accessToken || !code) return;

    setLoading(true);
    setError("");

    try {
      const response = await getExamResults(accessToken, code, {
        page,
        limit: PAGE_SIZE,
        search,
        status,
        candidateType,
      });

      setResult(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải kết quả kỳ sát hạch."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, code, page, search, status, candidateType]);

  useEffect(() => {
    // Khi chọn CSDT, danh sách sẽ được xử lý
    // từ các trang dữ liệu đầy đủ phía dưới.
    if (schoolKey) return;

    void load();
  }, [load, schoolKey]);

  // ==========================================================
  // LOAD ALL CANDIDATES FOR SCHOOL FILTER
  // ==========================================================

  useEffect(() => {
    if (!accessToken || !code || !schoolKey) {
      setSchoolCandidates([]);
      setSchoolCandidatesReady(false);
      setSchoolCandidatesLoading(false);
      return;
    }

    let active = true;

    setSchoolCandidatesLoading(true);
    setSchoolCandidatesReady(false);
    setError("");

    void fetchAllCandidates(accessToken, code, {
      search,
      status,
      candidateType,
    })
      .then(({ candidates, first }) => {
        if (!active) return;

        setSchoolCandidates(candidates);
        setResult(first);
        setSchoolCandidatesReady(true);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setSchoolCandidates([]);
        setSchoolCandidatesReady(false);
        setError(
          err instanceof Error
            ? err.message
            : "Không thể lọc kết quả theo CSDT."
        );
      })
      .finally(() => {
        if (active) {
          setSchoolCandidatesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, code, schoolKey, search, status, candidateType]);

  // ==========================================================
  // DERIVED FILTERED DATA
  // ==========================================================

  const selectedSchoolCandidates = useMemo(
    () => filterBySchool(schoolCandidates, schoolKey),
    [schoolCandidates, schoolKey]
  );

  const schoolFilteredTotal = selectedSchoolCandidates.length;

  const schoolFilteredPages = Math.max(
    1,
    Math.ceil(schoolFilteredTotal / PAGE_SIZE)
  );

  const displayCandidates = useMemo(() => {
    if (!schoolKey) {
      return result?.data ?? [];
    }

    if (!schoolCandidatesReady) {
      return [];
    }

    const start = (page - 1) * PAGE_SIZE;

    return selectedSchoolCandidates.slice(start, start + PAGE_SIZE);
  }, [
    schoolKey,
    result,
    schoolCandidatesReady,
    selectedSchoolCandidates,
    page,
  ]);

  const displayTotal = schoolKey
    ? schoolCandidatesReady
      ? schoolFilteredTotal
      : 0
    : result?.pagination.total ?? 0;

  const displayTotalPages = schoolKey
    ? schoolFilteredPages
    : result?.pagination.totalPages ?? 1;

  const isLoading = schoolKey ? schoolCandidatesLoading : loading;

  const selectedSchoolLabel = schoolKey
    ? schoolOptions.find((item) => item.value === schoolKey)?.label ??
      "CSDT đã chọn"
    : "Tất cả CSDT";

  // ==========================================================
  // SUMMARY: GIỮ SỐ LIỆU TOÀN KỲ
  // ==========================================================

  const summary = result?.summary;

  const stats = [
    {
      label: "Tổng thí sinh",
      value: summary?.total ?? 0,
      color: "text.primary",
    },
    {
      label: "Đã có kết quả",
      value: summary?.withResults ?? 0,
      color: "text.primary",
    },
    {
      label: "Đạt",
      value: summary?.passed ?? 0,
      color: "success.main",
    },
    {
      label: "Không đạt",
      value: summary?.failed ?? 0,
      color: "error.main",
    },
    {
      label: "Vắng",
      value: summary?.absent ?? 0,
      color: "warning.main",
    },
    {
      label: "Thí sinh tự do",
      value: summary?.independent ?? 0,
      color: "text.primary",
    },
  ];

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <Stack
      spacing={3}
      sx={{
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* HEADER + EXPORT */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          spacing: 2,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Kết quả kỳ sát hạch {code}
          </Typography>

          <Typography color="text.secondary">
            {result?.session.centerName ||
              result?.session.centerCode ||
              "Trung tâm sát hạch"}
            {" · "}
            {formatDate(result?.session.examDate)}
          </Typography>
        </Box>

        <ExportExcelButton
          disabled={
            !accessToken || !result || isLoading || schoolOptionsLoading
          }
          onExport={async () => {
            if (!accessToken) {
              throw new Error("Phiên đăng nhập đã hết hạn.");
            }

            await exportFilteredExamExcel(
              accessToken,
              code,
              {
                search,
                status,
                candidateType,
              },
              schoolKey,
              selectedSchoolLabel
            );
          }}
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {/* SUMMARY */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(3, minmax(0, 1fr))",
            lg: "repeat(6, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        {stats.map((stat) => (
          <Card
            variant="outlined"
            key={stat.label}
            sx={{
              minWidth: 0,
              borderRadius: 2.5,
            }}
          >
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                {stat.label}
              </Typography>

              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  mt: 0.5,
                  color: stat.color,
                }}
              >
                {formatNumber(stat.value)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        Các thẻ phía trên thể hiện số liệu toàn kỳ sát hạch. Chỉ tiêu Vắng được
        tính theo mã VA ở kết quả tổng hoặc từng phần thi và có thể trùng với
        nhóm Không đạt.
      </Typography>

      {/* FILTERS */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "minmax(230px, 1fr) 220px 220px 260px",
              },
              gap: 2,
              alignItems: "start",
            }}
          >
            {/* SEARCH */}
            <TextField
              size="small"
              label="Tên, CCCD, SBD, mã đăng ký"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setSearch(searchInput.trim());
                }
              }}
              fullWidth
              slotProps={{
                input: {
                  endAdornment: (
                    <IconButton
                      size="small"
                      aria-label="Tìm kiếm"
                      onClick={() => {
                        setPage(1);
                        setSearch(searchInput.trim());
                      }}
                    >
                      <SearchOutlined />
                    </IconButton>
                  ),
                },
              }}
            />

            {/* RESULT */}
            <FormControl size="small" fullWidth>
              <InputLabel>Kết quả</InputLabel>

              <Select
                label="Kết quả"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">Tất cả kết quả</MenuItem>
                <MenuItem value="DA">Đạt</MenuItem>
                <MenuItem value="RO">Không đạt</MenuItem>
                <MenuItem value="VA">Vắng</MenuItem>
                <MenuItem value="PENDING">Chưa có kết quả</MenuItem>
              </Select>
            </FormControl>

            {/* CANDIDATE TYPE */}
            <FormControl size="small" fullWidth>
              <InputLabel>Loại thí sinh</InputLabel>

              <Select
                label="Loại thí sinh"
                value={candidateType}
                onChange={(event) => {
                  setCandidateType(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">Tất cả</MenuItem>
                <MenuItem value="training">Học viên CSDT</MenuItem>
                <MenuItem value="independent">Thí sinh tự do</MenuItem>
                <MenuItem value="unknown">Chưa xác định</MenuItem>
              </Select>
            </FormControl>

            {/* NEW: CSDT FILTER */}
            <FormControl size="small" fullWidth disabled={schoolOptionsLoading}>
              <InputLabel>Cơ sở đào tạo</InputLabel>

              <Select
                label="Cơ sở đào tạo"
                value={schoolKey}
                onChange={(event) => {
                  setSchoolKey(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">Tất cả CSDT</MenuItem>

                {schoolOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    <Stack
                      direction="row"
                      sx={{
                        width: "100%",
                        minWidth: 0,
                        spacing: 1,
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          overflowWrap: "anywhere",
                          minWidth: 0,
                        }}
                      >
                        {option.label}
                      </Typography>

                      <Chip
                        size="small"
                        variant="outlined"
                        label={formatNumber(option.count)}
                      />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {schoolOptionsLoading && (
            <Stack
              direction="row"
              sx={{ mt: 1.5, spacing: 1, alignItems: "center" }}
            >
              <CircularProgress size={14} />

              <Typography variant="caption" color="text.secondary">
                Đang tải danh sách cơ sở đào tạo...
              </Typography>
            </Stack>
          )}

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1.5 }}
          >
            Excel sẽ xuất toàn bộ thí sinh phù hợp với kết quả, loại thí sinh,
            cơ sở đào tạo và từ khóa đang chọn.
          </Typography>
        </CardContent>
      </Card>

      {/* RESULTS TABLE */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <CardContent sx={{ minWidth: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              mb: 2,
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              spacing: 1,
            }}
          >
            <Typography sx={{ fontWeight: 700 }}>
              Danh sách kết quả ({formatNumber(displayTotal)})
            </Typography>

            {schoolKey && (
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`CSDT: ${selectedSchoolLabel}`}
                onDelete={() => {
                  setSchoolKey("");
                  setPage(1);
                }}
                sx={{
                  maxWidth: "100%",
                  "& .MuiChip-label": {
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }}
              />
            )}
          </Stack>

          {isLoading && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                p: 2,
              }}
            >
              <CircularProgress size={24} />
            </Box>
          )}

          <TableContainer
            sx={{
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
            }}
          >
            <Table
              size="small"
              sx={{
                minWidth: 1000,
                "& .MuiTableCell-head": {
                  whiteSpace: "nowrap",
                  fontWeight: 700,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>SBD</TableCell>
                  <TableCell>Học viên</TableCell>
                  <TableCell>Cơ sở đào tạo</TableCell>
                  <TableCell>Hạng</TableCell>
                  <TableCell align="center">Lý thuyết</TableCell>
                  <TableCell align="center">Hình</TableCell>
                  <TableCell align="center">Đường</TableCell>
                  <TableCell>Kết quả</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {!isLoading &&
                  displayCandidates.map((item) => (
                    <CandidateRow item={item} key={item.id} />
                  ))}

                {!isLoading && displayCandidates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      Không có kết quả phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {!isLoading && displayTotalPages > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                mt: 3,
              }}
            >
              <Pagination
                page={page}
                count={displayTotalPages}
                onChange={(_, next) => setPage(next)}
                color="primary"
              />
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
