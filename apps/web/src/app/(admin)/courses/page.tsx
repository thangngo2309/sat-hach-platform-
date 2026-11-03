"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  MenuItem,
  Pagination,
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
  ArrowForwardOutlined,
  FileDownloadOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  listCourseSummaries,
  listExaminationCenterOptions,
  type CourseSummary,
  type ExaminationCenterOption,
  type PageResult,
} from "@/lib/bc2-view";

import { exportPagedExcel } from "@/lib/export-excel";

type PeriodMode = "all" | "year" | "month" | "quarter" | "range";

type CourseFilters = {
  search: string;
  centerId?: number;
  dateFrom?: string;
  dateTo?: string;
};

const CURRENT_YEAR = new Date().getFullYear();

const YEAR_OPTIONS = Array.from(
  { length: 21 },
  (_, index) => CURRENT_YEAR + 5 - index
);

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function monthEnd(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function periodBounds(
  mode: PeriodMode,
  year: number,
  month: number,
  quarter: number,
  from: string,
  to: string
): Pick<CourseFilters, "dateFrom" | "dateTo"> {
  if (mode === "all") {
    return {};
  }

  if (mode === "year") {
    return {
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`,
    };
  }

  if (mode === "month") {
    return {
      dateFrom: `${year}-${pad2(month)}-01`,
      dateTo: monthEnd(year, month),
    };
  }

  if (mode === "quarter") {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    return {
      dateFrom: `${year}-${pad2(startMonth)}-01`,
      dateTo: monthEnd(year, endMonth),
    };
  }

  if (from && to && from > to) {
    throw new Error("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
  }

  if (!from || !to) {
    throw new Error("Vui lòng chọn đầy đủ ngày bắt đầu và ngày kết thúc.");
  }

  return {
    dateFrom: from,
    dateTo: to,
  };
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const text = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

export default function CoursesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { accessToken, loading: authLoading } = useAuth();

  const schoolId = Number(searchParams.get("schoolId") || 0);

  const [searchInput, setSearchInput] = useState("");
  const [selectedCenter, setSelectedCenter] =
    useState<ExaminationCenterOption | null>(null);

  const [period, setPeriod] = useState<PeriodMode>("all");

  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(
    Math.floor(new Date().getMonth() / 3) + 1
  );

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [filters, setFilters] = useState<CourseFilters>({
    search: "",
  });

  const [centers, setCenters] = useState<ExaminationCenterOption[]>([]);

  const [loadingCenters, setLoadingCenters] = useState(false);

  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [result, setResult] = useState<PageResult<CourseSummary> | null>(null);

  const [fetching, setFetching] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!accessToken) {
      setCenters([]);
      return;
    }

    let active = true;
    setLoadingCenters(true);

    void listExaminationCenterOptions(accessToken)
      .then((data) => {
        if (active) {
          setCenters(Array.isArray(data) ? data : []);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Không tải được danh mục trung tâm sát hạch."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingCenters(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  const load = useCallback(async () => {
    if (!accessToken) return;

    setFetching(true);
    setError("");

    try {
      const response = await listCourseSummaries(accessToken, {
        page,
        limit: 20,
        schoolId: schoolId || undefined,
        search: filters.search,
        centerId: filters.centerId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      setResult(response);
    } catch (err) {
      setResult(null);

      setError(
        err instanceof Error
          ? err.message
          : "Không tải được danh sách khóa học."
      );
    } finally {
      setFetching(false);
    }
  }, [accessToken, page, schoolId, filters, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    setError("");
    setSuccess("");

    try {
      const dates = periodBounds(
        period,
        year,
        month,
        quarter,
        dateFrom,
        dateTo
      );

      setPage(1);
      setFilters({
        search: searchInput.trim(),
        centerId: selectedCenter?.id,
        ...dates,
      });

      // Nếu bộ lọc không đổi vẫn cho tìm lại.
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Bộ lọc thời gian không hợp lệ."
      );
    }
  }

  function resetFilters() {
    setSearchInput("");
    setSelectedCenter(null);
    setPeriod("all");
    setYear(CURRENT_YEAR);
    setMonth(new Date().getMonth() + 1);
    setQuarter(Math.floor(new Date().getMonth() / 3) + 1);
    setDateFrom("");
    setDateTo("");

    setPage(1);
    setFilters({ search: "" });
    setError("");
    setSuccess("");
    setReload((value) => value + 1);
  }

  async function handleExport() {
    if (!accessToken || exporting) return;

    setExporting(true);
    setError("");
    setSuccess("");

    try {
      const count = await exportPagedExcel<CourseSummary>({
        filename: "Danh_sach_khoa_hoc.xlsx",
        sheetName: "Khoa hoc",

        columns: [
          {
            header: "Mã khóa",
            key: "code",
            width: 23,
            value: (row) => row.code,
          },
          {
            header: "Tên khóa",
            key: "name",
            width: 35,
            value: (row) => row.name,
          },
          {
            header: "Cơ sở đào tạo",
            key: "schoolName",
            width: 42,
            value: (row) => row.schoolName,
          },
          {
            header: "Mã BC1",
            key: "bc1Code",
            width: 26,
            value: (row) => row.bc1Code,
          },
          {
            header: "Hạng GPLX",
            key: "licenseClass",
            width: 17,
            value: (row) => row.licenseClass,
          },
          {
            header: "Ngày khai giảng",
            key: "openingDate",
            width: 20,
            value: (row) => formatDate(row.openingDate),
          },
          {
            header: "Học viên BC1",
            key: "studentCount",
            width: 19,
            value: (row) => row.studentCount,
          },
          {
            header: "Đã đối chiếu BC2",
            key: "bc2MatchedCount",
            width: 22,
            value: (row) => row.bc2MatchedCount,
          },
          {
            header: "Chưa đối chiếu",
            key: "noBc2Count",
            width: 21,
            value: (row) => row.noBc2Count,
          },
        ],

        fetchPage: (nextPage, limit) =>
          listCourseSummaries(accessToken, {
            page: nextPage,
            limit,
            schoolId: schoolId || undefined,
            search: filters.search,
            centerId: filters.centerId,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          }),
      });

      setSuccess(
        `Đã xuất ${count.toLocaleString(
          "vi-VN"
        )} khóa học theo bộ lọc đang áp dụng.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xuất Excel.");
    } finally {
      setExporting(false);
    }
  }

  if (authLoading) {
    return (
      <Box
        sx={{
          py: 8,
          display: "grid",
          placeItems: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* TIÊU ĐỀ */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: {
            xs: "stretch",
            sm: "center",
          },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Danh sách khóa học
          </Typography>

          <Typography color="text.secondary">
            Đối chiếu danh sách học viên BC1 và thí sinh BC2.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            color="success"
            startIcon={
              exporting ? (
                <CircularProgress size={17} color="inherit" />
              ) : (
                <FileDownloadOutlined />
              )
            }
            disabled={fetching || exporting || !accessToken}
            onClick={() => void handleExport()}
            sx={{ textTransform: "none" }}
          >
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>

          <Button
            variant="outlined"
            startIcon={<RefreshOutlined />}
            disabled={fetching}
            onClick={() => setReload((value) => value + 1)}
            sx={{ textTransform: "none" }}
          >
            Tải lại
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {success && (
        <Alert severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* BỘ LỌC */}
      <Card
        variant="outlined"
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 3,
        }}
      >
        <Stack
          component="form"
          spacing={2}
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            <Autocomplete
              fullWidth
              size="small"
              options={centers}
              value={selectedCenter}
              loading={loadingCenters}
              disabled={loadingCenters}
              autoHighlight
              openOnFocus
              getOptionLabel={(option) =>
                `${option.code} — ${option.name || "Chưa đặt tên"}`
              }
              isOptionEqualToValue={(option, value) => option.id === value.id}
              onChange={(_, value) => setSelectedCenter(value)}
              noOptionsText="Không tìm thấy trung tâm"
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Trung tâm sát hạch"
                  placeholder="Tất cả trung tâm"
                />
              )}
            />

            <TextField
              select
              fullWidth
              size="small"
              label="Lọc theo thời gian"
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodMode)}
            >
              <MenuItem value="all">Tất cả thời gian</MenuItem>
              <MenuItem value="year">Theo năm</MenuItem>
              <MenuItem value="month">Theo tháng</MenuItem>
              <MenuItem value="quarter">Theo quý</MenuItem>
              <MenuItem value="range">Từ ngày đến ngày</MenuItem>
            </TextField>
          </Box>

          {period !== "all" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                },
                gap: 2,
              }}
            >
              {period !== "range" && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Năm"
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {YEAR_OPTIONS.map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {period === "month" && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Tháng"
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                >
                  {MONTH_OPTIONS.map((value) => (
                    <MenuItem key={value} value={value}>
                      Tháng {value}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {period === "quarter" && (
                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Quý"
                  value={quarter}
                  onChange={(event) => setQuarter(Number(event.target.value))}
                >
                  {[1, 2, 3, 4].map((value) => (
                    <MenuItem key={value} value={value}>
                      Quý {value}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              {period === "range" && (
                <>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Từ ngày"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                    }}
                  />

                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Đến ngày"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: {
                        min: dateFrom || undefined,
                      },
                    }}
                  />
                </>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            size="small"
            label="Tìm mã khóa, tên khóa, cơ sở đào tạo"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SearchOutlined />}
              disabled={fetching}
              sx={{
                flex: 1,
                textTransform: "none",
              }}
            >
              Tìm kiếm
            </Button>

            <Button
              type="button"
              variant="outlined"
              color="inherit"
              disabled={fetching}
              onClick={resetFilters}
              sx={{
                textTransform: "none",
              }}
            >
              Xóa bộ lọc
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Tổng số khóa:{" "}
            <strong>
              {(result?.pagination.total ?? 0).toLocaleString("vi-VN")}
            </strong>
            {schoolId > 0 ? " · Đang lọc theo cơ sở đào tạo" : ""}
            {filters.centerId ? " · Đang lọc theo trung tâm sát hạch" : ""}
            {filters.dateFrom && filters.dateTo
              ? ` · Ngày khai giảng: ${formatDate(
                  filters.dateFrom
                )} - ${formatDate(filters.dateTo)}`
              : ""}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Thời gian được tính theo ngày khai giảng khóa học. Trung tâm sát
            hạch được đối chiếu qua lịch sử dự thi của các học viên thuộc khóa.
          </Typography>
        </Stack>
      </Card>

      {/* DANH SÁCH */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        {fetching && !result ? (
          <Box
            sx={{
              py: 8,
              display: "grid",
              placeItems: "center",
            }}
          >
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Mã khóa</TableCell>
                  <TableCell>Tên khóa</TableCell>
                  <TableCell>Trường đào tạo</TableCell>
                  <TableCell>Hạng GPLX</TableCell>
                  <TableCell>Ngày khai giảng</TableCell>
                  <TableCell align="right">Học viên BC1</TableCell>
                  <TableCell align="right">Đã đối chiếu BC2</TableCell>
                  <TableCell align="right">Chưa đối chiếu</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {(result?.data ?? []).map((course) => (
                  <TableRow key={course.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {course.code}
                    </TableCell>

                    <TableCell>{course.name}</TableCell>

                    <TableCell>{course.schoolName}</TableCell>

                    <TableCell>
                      <Chip
                        label={course.licenseClass ?? "—"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>

                    <TableCell>{formatDate(course.openingDate)}</TableCell>

                    <TableCell align="right">{course.studentCount}</TableCell>

                    <TableCell align="right">
                      <Chip
                        label={course.bc2MatchedCount}
                        size="small"
                        color={
                          course.bc2MatchedCount > 0 ? "success" : "default"
                        }
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Chip
                        label={course.noBc2Count}
                        size="small"
                        color={course.noBc2Count > 0 ? "warning" : "default"}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Button
                        size="small"
                        endIcon={<ArrowForwardOutlined />}
                        onClick={() =>
                          router.push(`/students?courseId=${course.id}`)
                        }
                        sx={{
                          textTransform: "none",
                        }}
                      >
                        Học viên
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!fetching && !(result?.data.length ?? 0) && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      Chưa có khóa học phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {fetching && result && (
          <Box sx={{ p: 1.5 }}>
            <CircularProgress size={18} />
          </Box>
        )}

        {(result?.pagination.totalPages ?? 0) > 1 && (
          <Box
            sx={{
              p: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Pagination
              page={page}
              count={result?.pagination.totalPages ?? 1}
              onChange={(_, value) => setPage(value)}
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
      </Card>
    </Stack>
  );
}
