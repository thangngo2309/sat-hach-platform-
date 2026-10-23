"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
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
  CloseOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";

import {
  getExamStatisticsFilters,
  getExamStatisticsReport,
  getExamStatisticsStudentHistory,
  type ExamPartStatistics,
  type ExamStatisticsFilters,
  type ExamStatisticsHistoryItem,
  type ExamStatisticsReport,
  type ExamStatisticsStudent,
} from "@/lib/exam-statistics";
import { exportExamStatisticsExcel } from "@/lib/exam-statistics-export";
import { ExportExcelButton } from "@/components/common/ExportExcelButton";

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

function partName(code: string) {
  const names: Record<string, string> = {
    L: "Lý thuyết",
    LT: "Lý thuyết",
    M: "Mô phỏng",
    MP: "Mô phỏng",
    H: "Thực hành hình",
    SH: "Sa hình",
    D: "Đường trường",
    DD: "Đường trường",
  };

  return names[code.toUpperCase()] ?? code;
}

function StatusChip({ status }: { status: string | null }) {
  if (status === "DA" || status === "passed") {
    return <Chip size="small" color="success" label="Đạt" />;
  }

  if (status === "RO" || status === "failed") {
    return <Chip size="small" color="error" label="Không đạt" />;
  }

  if (status === "VA") {
    return <Chip size="small" color="warning" label="Vắng" />;
  }

  return (
    <Chip
      size="small"
      variant="outlined"
      label={status === "pending" ? "Chờ kết quả" : status || "Chưa có kết quả"}
    />
  );
}

// ============================================================
// SUMMARY CARDS
// ============================================================

function SummaryCards({
  data,
}: {
  data: ExamStatisticsReport["summary"] | null;
}) {
  const items = [
    {
      label: "Tổng học viên",
      value: data?.totalStudents,
      color: "text.primary",
    },
    {
      label: "Đã đậu",
      value: data?.passed,
      color: "success.main",
    },
    {
      label: "Chưa đậu",
      value: data?.failed,
      color: "error.main",
    },
    {
      label: "Chờ kết quả",
      value: data?.pending,
      color: "warning.main",
    },
    {
      label: "Có lần vắng",
      value: data?.absent,
      color: "warning.main",
    },
    {
      label: "Thi từ 2 kỳ",
      value: data?.retakeStudents,
      color: "info.main",
    },
    {
      label: "Tổng lượt dự kỳ",
      value: data?.totalStudentSessions,
      color: "text.primary",
    },
    {
      label: "Lượt kỳ có KQ",
      value: data?.totalResultSessions,
      color: "text.primary",
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(4, minmax(0, 1fr))",
        },
        gap: 1.5,
      }}
    >
      {items.map((item) => (
        <Card
          key={item.label}
          variant="outlined"
          sx={{
            borderRadius: 2.5,
            minWidth: 0,
          }}
        >
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>

            <Typography
              variant="h5"
              sx={{
                mt: 1,
                fontWeight: 800,
                color: item.color,
              }}
            >
              {formatNumber(item.value)}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

// ============================================================
// PART STATISTICS
// ============================================================

function PartsTable({ items }: { items: ExamPartStatistics[] }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Kết quả theo từng phần thi
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Thống kê các lượt Đạt, Không đạt và Vắng theo từng phần thi trong năm,
          khóa đào tạo và kỳ sát hạch đã chọn.
        </Typography>
      </Box>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            minWidth: 650,
            "& .MuiTableCell-head": {
              fontWeight: 700,
              whiteSpace: "nowrap",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>Phần thi</TableCell>
              <TableCell align="right">Học viên</TableCell>
              <TableCell align="right">Lượt ghi</TableCell>
              <TableCell align="right">Đạt</TableCell>
              <TableCell align="right">Rớt</TableCell>
              <TableCell align="right">Vắng</TableCell>
              <TableCell align="right">Khác</TableCell>
              <TableCell align="right">Tỷ lệ đạt</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {items.map((part) => {
              const examined = part.passed + part.failed;

              const other = Math.max(
                0,
                part.totalRecords - part.passed - part.failed - part.absent
              );

              const rate = examined > 0 ? (part.passed / examined) * 100 : 0;

              return (
                <TableRow key={part.examType} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {partName(part.examType)}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      Mã: {part.examType}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    {formatNumber(part.studentCount)}
                  </TableCell>

                  <TableCell align="right">
                    {formatNumber(part.totalRecords)}
                  </TableCell>

                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      color: "success.main",
                    }}
                  >
                    {formatNumber(part.passed)}
                  </TableCell>

                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      color: "error.main",
                    }}
                  >
                    {formatNumber(part.failed)}
                  </TableCell>

                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      color: "warning.main",
                    }}
                  >
                    {formatNumber(part.absent)}
                  </TableCell>

                  <TableCell align="right">{formatNumber(other)}</TableCell>

                  <TableCell align="right">
                    {examined > 0 ? `${rate.toFixed(1)}%` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}

            {!items.length && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  Chưa có dữ liệu kết quả từng phần thi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

// ============================================================
// STUDENT RESULTS TABLE
// ============================================================

function StudentResultsTable({
  items,
  onView,
}: {
  items: ExamStatisticsStudent[];
  onView: (student: ExamStatisticsStudent) => void;
}) {
  return (
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
          minWidth: 980,
          "& .MuiTableCell-head": {
            fontWeight: 700,
            whiteSpace: "nowrap",
          },
          "& .MuiTableCell-body": {
            py: 1.5,
            verticalAlign: "middle",
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Học viên</TableCell>
            <TableCell align="center">Kỳ trong bộ lọc</TableCell>
            <TableCell align="center">Toàn lịch sử</TableCell>
            <TableCell>Phần thi</TableCell>
            <TableCell>Kỳ gần nhất</TableCell>
            <TableCell>Kết quả</TableCell>
            <TableCell align="right">Chi tiết</TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {items.map((student) => (
            <TableRow key={student.id} hover>
              <TableCell>
                <Stack
                  direction="row"
                  sx={{ minWidth: 210, spacing: 1.5, alignItems: "center" }}
                >
                  <StudentAvatar
                    studentId={student.id}
                    fullName={student.fullName}
                    size={44}
                  />

                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {student.fullName}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {student.registrationCode}
                    </Typography>

                    {student.identityNumber && (
                      <Typography variant="caption" color="text.secondary">
                        CCCD: {student.identityNumber}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </TableCell>

              <TableCell align="center">
                <Typography sx={{ fontWeight: 700 }}>
                  {student.sessionCount}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  {student.resultCount} kỳ có KQ
                </Typography>
              </TableCell>

              <TableCell align="center">
                <Typography sx={{ fontWeight: 700 }}>
                  {student.allTimeSessionCount}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  {student.allTimeResultCount} kỳ có KQ
                </Typography>
              </TableCell>

              <TableCell>
                <Stack sx={{ spacing: 0.5, alignItems: "flex-start" }}>
                  {student.parts.map((part) => (
                    <Typography
                      key={part.examType}
                      variant="caption"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {partName(part.examType)}:{" "}
                      <Box component="span" sx={{ color: "success.main" }}>
                        {part.passed}Đ
                      </Box>
                      {" · "}
                      <Box component="span" sx={{ color: "error.main" }}>
                        {part.failed}R
                      </Box>
                      {" · "}
                      <Box component="span" sx={{ color: "warning.main" }}>
                        {part.absent}V
                      </Box>
                    </Typography>
                  ))}

                  {!student.parts.length && (
                    <Typography variant="caption" color="text.secondary">
                      Chưa có kết quả phần thi
                    </Typography>
                  )}
                </Stack>
              </TableCell>

              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {student.latestSessionCode || "—"}
                </Typography>

                <Typography variant="caption" color="text.secondary">
                  {formatDate(student.latestExamDate)}
                </Typography>
              </TableCell>

              <TableCell>
                <Stack sx={{ spacing: 0.5, alignItems: "flex-start" }}>
                  <StatusChip status={student.status} />

                  {student.hasAbsent && (
                    <Chip
                      size="small"
                      color="warning"
                      variant="outlined"
                      label="Có lần vắng"
                    />
                  )}
                </Stack>
              </TableCell>

              <TableCell align="right">
                <Button
                  size="small"
                  startIcon={<VisibilityOutlined />}
                  onClick={() => onView(student)}
                  sx={{ textTransform: "none" }}
                >
                  Lịch sử
                </Button>
              </TableCell>
            </TableRow>
          ))}

          {!items.length && (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                Không có học viên phù hợp.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================================
// STUDENT HISTORY DETAIL
// ============================================================

function HistoryItem({
  item,
  order,
}: {
  item: ExamStatisticsHistoryItem;
  order: number;
}) {
  const selected =
    item.inSelectedYear && item.inSelectedCourse && item.inSelectedSession;

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        opacity: selected ? 1 : 0.72,
        borderColor: selected ? "primary.light" : "divider",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          spacing: 1,
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Lần {order} — Kỳ {item.sessionCode}
          </Typography>

          <Typography variant="caption" color="text.secondary">
            Ngày: {formatDate(item.examDate)}
            {" · "}
            SBD: {item.examinationNumber ?? "—"}
            {" · "}
            Hạng: {item.licenseClass ?? "—"}
          </Typography>
        </Box>

        <Stack
          direction="row"
          sx={{ spacing: 1, alignItems: "center", flexWrap: "wrap" }}
        >
          {!selected && (
            <Chip size="small" variant="outlined" label="Ngoài phạm vi lọc" />
          )}

          <StatusChip status={item.hasResult ? item.resultStatus : "pending"} />
        </Stack>
      </Stack>

      {item.parts.length > 0 ? (
        <TableContainer sx={{ mt: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Phần thi</TableCell>
                <TableCell>Ngày thi</TableCell>
                <TableCell>Điểm</TableCell>
                <TableCell>Kết quả</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {item.parts.map((part) => (
                <TableRow key={part.id}>
                  <TableCell>{partName(part.examType)}</TableCell>

                  <TableCell>{formatDate(part.examDate)}</TableCell>

                  <TableCell>
                    {part.score ?? "—"}
                    {part.maximumScore ? ` / ${part.maximumScore}` : ""}
                  </TableCell>

                  <TableCell>
                    <StatusChip status={part.resultStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {item.hasResult
            ? "Chưa có chi tiết phần thi."
            : "Kỳ này chưa có kết quả KQSH."}
        </Typography>
      )}
    </Card>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ExamStatisticsPage() {
  const { accessToken, loading: authLoading } = useAuth();

  const [options, setOptions] = useState<ExamStatisticsFilters | null>(null);

  const [year, setYear] = useState(new Date().getFullYear());

  const [courseId, setCourseId] = useState<number | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);

  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [reload, setReload] = useState(0);

  const [report, setReport] = useState<ExamStatisticsReport | null>(null);

  const [loading, setLoading] = useState(false);

  const [filtersLoading, setFiltersLoading] = useState(false);

  const [error, setError] = useState("");

  const [selectedStudent, setSelectedStudent] =
    useState<ExamStatisticsStudent | null>(null);

  const [history, setHistory] = useState<ExamStatisticsHistoryItem[]>([]);

  const [historyLoading, setHistoryLoading] = useState(false);

  const [historyError, setHistoryError] = useState("");

  // ==========================================================
  // LOAD FILTER OPTIONS
  // ==========================================================

  useEffect(() => {
    if (!accessToken) return;

    let active = true;

    setFiltersLoading(true);

    void getExamStatisticsFilters(accessToken, {
      year,
      courseId,
    })
      .then((result) => {
        if (!active) return;

        setOptions(result);

        if (
          sessionId !== null &&
          !result.sessions.some((session) => session.id === sessionId)
        ) {
          setSessionId(null);
          setPage(1);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách kỳ sát hạch."
        );
      })
      .finally(() => {
        if (active) {
          setFiltersLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, year, courseId, sessionId]);

  // ==========================================================
  // LOAD REPORT
  // ==========================================================

  const load = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");

    try {
      const data = await getExamStatisticsReport(accessToken, {
        year,
        courseId,
        sessionId,
        page,
        limit: 20,
        search,
      });

      setReport(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải thống kê sát hạch."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, year, courseId, sessionId, page, search, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  // ==========================================================
  // OPEN STUDENT HISTORY
  // ==========================================================

  const openStudent = async (student: ExamStatisticsStudent) => {
    if (!accessToken) return;

    setSelectedStudent(student);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    try {
      const response = await getExamStatisticsStudentHistory(
        accessToken,
        student.id,
        {
          year,
          courseId,
          sessionId,
        }
      );

      setHistory(
        Array.isArray(response.history)
          ? response.history.map((item) => ({
              ...item,
              parts: Array.isArray(item.parts) ? item.parts : [],
            }))
          : []
      );
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Không thể tải lịch sử sát hạch."
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  // ==========================================================
  // AUTH LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          py: 8,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <Stack
      spacing={2.5}
      sx={{
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* HEADER */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Thống kê sát hạch
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Theo năm, khóa đào tạo, kỳ sát hạch và kết quả từng phần thi.
          </Typography>
        </Box>

        <ExportExcelButton
          disabled={!accessToken || loading || filtersLoading}
          onExport={async () => {
            if (!accessToken) return;

            const course = options?.courses.find(
              (item) => item.id === courseId
            );

            const session = options?.sessions.find(
              (item) => item.id === sessionId
            );

            await exportExamStatisticsExcel(
              accessToken,
              {
                year,
                courseId,
                sessionId,
                search,
              },
              {
                courseName: course
                  ? `${course.code} - ${course.schoolName}`
                  : "Tất cả khóa đào tạo",
                sessionName: session
                  ? `${session.code} - ${formatDate(session.examDate)}`
                  : "Tất cả kỳ sát hạch",
              }
            );
          }}
        />

        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          disabled={loading || filtersLoading}
          onClick={() => setReload((value) => value + 1)}
          sx={{ textTransform: "none" }}
        >
          Tải lại
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {/* FILTERS */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          p: 2,
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            mb: 2,
          }}
        >
          Bộ lọc thống kê
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "160px minmax(220px, 1fr) minmax(250px, 1fr)",
            },
            gap: 2,
            alignItems: "start",
          }}
        >
          {/* NĂM */}
          <TextField
            select
            size="small"
            label="Năm sát hạch"
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setCourseId(null);
              setSessionId(null);
              setPage(1);
            }}
            fullWidth
          >
            {(options?.years ?? []).map((item) => (
              <MenuItem key={item.year} value={item.year}>
                {item.year}
              </MenuItem>
            ))}

            {!options?.years.some((item) => item.year === year) && (
              <MenuItem value={year}>{year}</MenuItem>
            )}
          </TextField>

          {/* KHÓA ĐÀO TẠO */}
          <TextField
            select
            size="small"
            label="Khóa đào tạo"
            value={courseId === null ? "" : String(courseId)}
            onChange={(event) => {
              const value = event.target.value;

              setCourseId(value ? Number(value) : null);

              setSessionId(null);
              setPage(1);
            }}
            fullWidth
            slotProps={{
              select: {
                displayEmpty: false,
              },
            }}
          >
            <MenuItem value="">Tất cả khóa đào tạo</MenuItem>

            {(options?.courses ?? []).map((course) => (
              <MenuItem key={course.id} value={String(course.id)}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {course.code}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {course.schoolName}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>

          {/* KỲ SÁT HẠCH */}
          <TextField
            select
            size="small"
            label="Kỳ sát hạch"
            value={sessionId === null ? "" : String(sessionId)}
            onChange={(event) => {
              const value = event.target.value;

              setSessionId(value ? Number(value) : null);

              setPage(1);
            }}
            fullWidth
            disabled={filtersLoading}
          >
            <MenuItem value="">Tất cả kỳ sát hạch</MenuItem>

            {(options?.sessions ?? []).map((session) => (
              <MenuItem key={session.id} value={String(session.id)}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {session.code}
                    {" · "}
                    {formatDate(session.examDate)}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {session.centerName || session.centerCode}
                    {" · "}
                    {formatNumber(session.totalCandidates)} thí sinh
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {filtersLoading && (
          <Stack
            direction="row"
            sx={{ mt: 1.5, alignItems: "center", spacing: 1 }}
          >
            <CircularProgress size={14} />

            <Typography variant="caption" color="text.secondary">
              Đang tải danh sách kỳ sát hạch...
            </Typography>
          </Stack>
        )}

        {!filtersLoading && options && options.sessions.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Không có kỳ sát hạch nào phù hợp với năm và khóa đào tạo đã chọn.
          </Alert>
        )}
      </Card>

      {/* SUMMARY */}
      <SummaryCards data={report?.summary ?? null} />

      <Typography variant="caption" color="text.secondary">
        Các chỉ tiêu Đã đậu, Chưa đậu và Chờ kết quả được tính theo học viên
        trong phạm vi lọc. Người có lần vắng vẫn có thể thuộc nhóm Chưa đậu hoặc
        Đã đậu.
      </Typography>

      {/* PART STATISTICS */}
      <PartsTable items={report?.parts ?? []} />

      {/* STUDENTS */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{
              justifyContent: "space-between",
              alignItems: {
                xs: "stretch",
                sm: "center",
              },
              spacing: 2,
            }}
          >
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Kết quả từng học viên
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {formatNumber(report?.pagination.total)} học viên phù hợp
              </Typography>
            </Box>

            <Stack
              component="form"
              direction="row"
              spacing={1}
              onSubmit={(event) => {
                event.preventDefault();

                setSearch(searchInput.trim());
                setPage(1);
              }}
            >
              <TextField
                size="small"
                label="Tên, CCCD, mã đăng ký"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                sx={{
                  minWidth: {
                    sm: 250,
                  },
                  flex: 1,
                }}
              />

              <Button
                type="submit"
                variant="outlined"
                startIcon={<SearchOutlined />}
                sx={{
                  textTransform: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Tìm
              </Button>
            </Stack>
          </Stack>
        </Box>

        {loading && (
          <Box sx={{ px: 2, pb: 1 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <StudentResultsTable
          items={report?.students ?? []}
          onView={(student) => {
            void openStudent(student);
          }}
        />

        {(report?.pagination.totalPages ?? 0) > 1 && (
          <Box
            sx={{
              p: 2,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Pagination
              color="primary"
              page={page}
              count={report?.pagination.totalPages ?? 1}
              onChange={(_, next) => setPage(next)}
            />
          </Box>
        )}
      </Card>

      {/* STUDENT HISTORY DIALOG */}
      <Dialog
        open={selectedStudent !== null}
        onClose={() => setSelectedStudent(null)}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              maxHeight: "90vh",
            },
          },
        }}
      >
        <DialogTitle component="div">
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Lịch sử sát hạch
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {selectedStudent?.fullName}
              </Typography>

              {selectedStudent && (
                <Typography variant="caption" color="text.secondary">
                  Tổng toàn lịch sử: {selectedStudent.allTimeSessionCount} kỳ
                  sát hạch
                </Typography>
              )}
            </Box>

            <IconButton onClick={() => setSelectedStudent(null)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {historyLoading ? (
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                py: 5,
              }}
            >
              <CircularProgress />
            </Box>
          ) : historyError ? (
            <Alert severity="error">{historyError}</Alert>
          ) : (
            <Stack spacing={1.5}>
              <Alert severity="info">
                Hiển thị toàn bộ lịch sử của học viên. Các kỳ không thuộc năm,
                khóa đào tạo hoặc kỳ sát hạch đang chọn sẽ được đánh dấu riêng.
              </Alert>

              {history.map((item, index) => (
                <HistoryItem key={item.id} item={item} order={index + 1} />
              ))}

              {!history.length && (
                <Typography color="text.secondary">
                  Chưa có lịch sử sát hạch.
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
