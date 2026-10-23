"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  AssessmentOutlined,
  ArrowForwardOutlined,
  CalendarMonthOutlined,
  CheckCircleOutlineOutlined,
  FileUploadOutlined,
  GroupsOutlined,
  HistoryOutlined,
  RefreshOutlined,
  SchoolOutlined,
  TrendingUpOutlined,
  WarningAmberOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  getExamStatisticsFilters,
  type ExamStatisticsFilters,
} from "@/lib/exam-statistics";

import {
  getDashboardOverview,
  type DashboardOverview,
  type DashboardMonth,
  type DashboardPartResult,
} from "@/lib/dashboard";

const formatNumber = (value?: number | null) =>
  Number(value ?? 0).toLocaleString("vi-VN");

function formatDate(value?: string | null) {
  if (!value) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN");
}

function percent(passed: number, failed: number) {
  const total = passed + failed;

  return total > 0 ? (passed / total) * 100 : 0;
}

function partName(code: string) {
  const names: Record<string, string> = {
    L: "Lý thuyết",
    LT: "Lý thuyết",
    M: "Mô phỏng",
    MP: "Mô phỏng",
    H: "Sa hình",
    SH: "Sa hình",
    D: "Đường trường",
    DD: "Đường trường",
  };

  return names[code.toUpperCase()] ?? code;
}

function SectionHeader({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      sx={{
        mb: 2,
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
        spacing: 1,
      }}
    >
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          {title}
        </Typography>

        {description && (
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>

      {href && (
        <Button
          component={Link}
          href={href}
          size="small"
          endIcon={<ArrowForwardOutlined />}
          sx={{
            textTransform: "none",
            whiteSpace: "nowrap",
          }}
        >
          {linkLabel || "Xem tất cả"}
        </Button>
      )}
    </Stack>
  );
}

function KpiCards({ data }: { data: DashboardOverview["summary"] | null }) {
  const cards = [
    {
      label: "Tổng học viên",
      value: data?.totalStudents,
      icon: GroupsOutlined,
      color: "#2563eb",
      background: "#eff6ff",
    },
    {
      label: "Đã đậu",
      value: data?.passed,
      icon: CheckCircleOutlineOutlined,
      color: "#15803d",
      background: "#f0fdf4",
    },
    {
      label: "Chưa đậu",
      value: data?.failed,
      icon: AssessmentOutlined,
      color: "#dc2626",
      background: "#fef2f2",
    },
    {
      label: "Chờ kết quả",
      value: data?.pending,
      icon: CalendarMonthOutlined,
      color: "#d97706",
      background: "#fffbeb",
    },
    {
      label: "Có lần vắng",
      value: data?.absent,
      icon: WarningAmberOutlined,
      color: "#b45309",
      background: "#fffbeb",
    },
    {
      label: "Học viên thi lại",
      value: data?.retakeStudents,
      icon: HistoryOutlined,
      color: "#7c3aed",
      background: "#f5f3ff",
    },
    {
      label: "Kỳ sát hạch",
      value: data?.totalSessions,
      icon: AssessmentOutlined,
      color: "#0369a1",
      background: "#f0f9ff",
    },
    {
      label: "Khóa đào tạo",
      value: data?.totalCourses,
      icon: SchoolOutlined,
      color: "#475569",
      background: "#f8fafc",
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
        gap: 2,
      }}
    >
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card
            key={card.label}
            variant="outlined"
            sx={{
              borderRadius: 3,
              minWidth: 0,
              height: "100%",
            }}
          >
            <CardContent
              sx={{
                p: { xs: 1.75, md: 2.5 },
                "&:last-child": {
                  pb: { xs: 1.75, md: 2.5 },
                },
              }}
            >
              <Stack
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  spacing: 1,
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 600 }}
                >
                  {card.label}
                </Typography>

                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    color: card.color,
                    bgcolor: card.background,
                  }}
                >
                  <Icon fontSize="small" />
                </Box>
              </Stack>

              <Typography
                variant="h4"
                sx={{
                  mt: 1,
                  fontWeight: 800,
                  fontSize: { xs: 24, md: 30 },
                  color: card.color,
                }}
              >
                {formatNumber(card.value)}
              </Typography>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

const monthlyColors = {
  passed: "#16a34a",
  failed: "#ef4444",
  pending: "#94a3b8",
};

function MonthlyChart({ items }: { items: DashboardMonth[] }) {
  const maxValue = Math.max(
    1,
    ...items.map((item) => item.passed + item.failed + item.pending)
  );

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        minWidth: 0,
        height: "100%",
      }}
    >
      <CardContent>
        <SectionHeader
          title="Kết quả sát hạch theo tháng"
          description="Số học viên theo trạng thái trong từng tháng"
          href="/exam-statistics"
          linkLabel="Xem thống kê"
        />

        <Stack direction="row" sx={{ mb: 2, spacing: 2, flexWrap: "wrap" }}>
          {[
            { label: "Đạt", color: monthlyColors.passed },
            { label: "Không đạt", color: monthlyColors.failed },
            { label: "Chờ kết quả", color: monthlyColors.pending },
          ].map((item) => (
            <Stack
              key={item.label}
              direction="row"
              sx={{ alignItems: "center", spacing: 0.75 }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  bgcolor: item.color,
                  borderRadius: 0.5,
                }}
              />

              <Typography variant="caption" color="text.secondary">
                {item.label}
              </Typography>
            </Stack>
          ))}
        </Stack>

        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            gap: 1,
            height: 240,
            pt: 2,
            pb: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          {items.map((item) => {
            const total = item.passed + item.failed + item.pending;

            return (
              <Box
                key={item.month}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "stretch",
                }}
                title={[
                  `Tháng ${item.month}`,
                  `Đạt: ${item.passed}`,
                  `Không đạt: ${item.failed}`,
                  `Chờ: ${item.pending}`,
                  `Vắng: ${item.absent}`,
                ].join(" | ")}
              >
                <Box
                  sx={{
                    height: `${Math.max(0, (total / maxValue) * 100)}%`,
                    minHeight: total > 0 ? 3 : 0,
                    display: "flex",
                    flexDirection: "column-reverse",
                    borderRadius: "4px 4px 0 0",
                    overflow: "hidden",
                  }}
                >
                  {[
                    {
                      value: item.passed,
                      color: monthlyColors.passed,
                    },
                    {
                      value: item.failed,
                      color: monthlyColors.failed,
                    },
                    {
                      value: item.pending,
                      color: monthlyColors.pending,
                    },
                  ].map((part, index) => (
                    <Box
                      key={index}
                      sx={{
                        height:
                          total > 0 ? `${(part.value / total) * 100}%` : "0%",
                        bgcolor: part.color,
                      }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gap: 1,
            mt: 0.75,
          }}
        >
          {items.map((item) => (
            <Typography
              key={item.month}
              variant="caption"
              color="text.secondary"
              sx={{ textAlign: "center", fontSize: 10 }}
            >
              T{item.month}
            </Typography>
          ))}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 2 }}
        >
          Mỗi tháng đếm học viên duy nhất trong tháng. Một học viên dự thi ở
          nhiều tháng có thể xuất hiện trong nhiều cột.
        </Typography>
      </CardContent>
    </Card>
  );
}

function PartStatistics({ items }: { items: DashboardPartResult[] }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        minWidth: 0,
        height: "100%",
      }}
    >
      <CardContent>
        <SectionHeader
          title="Kết quả theo phần thi"
          description="Tỷ lệ đạt trên số lượt đạt và rớt"
          href="/exam-statistics"
          linkLabel="Chi tiết"
        />

        {items.length === 0 ? (
          <Alert severity="info">
            Chưa có kết quả từng phần thi trong phạm vi lọc.
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            {items.map((item) => {
              const rate = percent(item.passed, item.failed);

              return (
                <Box key={item.examType}>
                  <Stack
                    direction="row"
                    sx={{
                      mb: 1,
                      justifyContent: "space-between",
                      alignItems: "center",
                      spacing: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {partName(item.examType)}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        {formatNumber(item.passed)} đạt ·{" "}
                        {formatNumber(item.failed)} rớt ·{" "}
                        {formatNumber(item.absent)} vắng
                      </Typography>
                    </Box>

                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        color: "success.main",
                      }}
                    >
                      {rate.toFixed(1)}%
                    </Typography>
                  </Stack>

                  <LinearProgress
                    variant="determinate"
                    value={rate}
                    sx={{
                      height: 9,
                      borderRadius: 5,
                      bgcolor: "#fee2e2",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 5,
                        bgcolor: "#16a34a",
                      },
                    }}
                  />
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSessions({
  items,
}: {
  items: DashboardOverview["recentSessions"];
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, minWidth: 0 }}>
      <CardContent>
        <SectionHeader
          title="Kỳ sát hạch gần đây"
          description="Các kỳ mới nhất trong phạm vi lọc"
        />

        {items.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            Chưa có kỳ sát hạch phù hợp.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />}>
            {items.map((session) => {
              const rate = percent(session.passed, session.failed);

              return (
                <Stack
                  key={session.id}
                  direction={{ xs: "column", sm: "row" }}
                  sx={{
                    py: 1.5,
                    alignItems: {
                      xs: "flex-start",
                      sm: "center",
                    },
                    justifyContent: "space-between",
                    spacing: 1.5,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      {session.code}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {formatDate(session.examDate)}
                      {" · "}
                      {session.centerName || session.centerCode}
                    </Typography>

                    <Stack
                      direction="row"
                      sx={{ mt: 1, gap: 0.5, spacing: 0.75, flexWrap: "wrap" }}
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${formatNumber(
                          session.totalCandidates
                        )} thí sinh`}
                      />
                      <Chip
                        size="small"
                        color="success"
                        variant="outlined"
                        label={`${session.passed} đạt`}
                      />
                      <Chip
                        size="small"
                        color="error"
                        variant="outlined"
                        label={`${session.failed} rớt`}
                      />
                      {session.absent > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={`${session.absent} vắng`}
                        />
                      )}
                    </Stack>
                  </Box>

                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", spacing: 1.5 }}
                  >
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {session.withResults > 0 ? `${rate.toFixed(1)}%` : "—"}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        Tỷ lệ đạt
                      </Typography>
                    </Box>

                    <Button
                      component={Link}
                      href={`/exams/${encodeURIComponent(session.code)}`}
                      variant="outlined"
                      size="small"
                      sx={{
                        whiteSpace: "nowrap",
                        textTransform: "none",
                      }}
                    >
                      Xem kỳ
                    </Button>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function CoursePerformance({
  items,
}: {
  items: DashboardOverview["coursePerformance"];
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, minWidth: 0 }}>
      <CardContent>
        <SectionHeader
          title="Kết quả theo khóa đào tạo"
          description="Các khóa có nhiều học viên trong phạm vi lọc"
          href="/courses"
          linkLabel="Quản lý khóa"
        />

        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Chưa có dữ liệu khóa đào tạo.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />}>
            {items.map((course) => {
              const rate = percent(course.passed, course.failed);

              return (
                <Box key={course.courseId} sx={{ py: 1.5 }}>
                  <Stack
                    direction="row"
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      spacing: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {course.courseCode}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {course.schoolName}
                      </Typography>
                    </Box>

                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatNumber(course.totalStudents)}
                    </Typography>
                  </Stack>

                  <Stack
                    direction="row"
                    sx={{ mt: 1, spacing: 1.5, flexWrap: "wrap" }}
                  >
                    <Typography variant="caption" color="success.main">
                      {course.passed} đạt
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      {course.failed} rớt
                    </Typography>
                    <Typography variant="caption" color="warning.main">
                      {course.pending} chờ
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Tỷ lệ đạt:{" "}
                      {course.passed + course.failed > 0
                        ? `${rate.toFixed(1)}%`
                        : "—"}
                    </Typography>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function RecentImports({
  items,
}: {
  items: DashboardOverview["recentImports"];
}) {
  const typeName = (type: string) => {
    const names: Record<string, string> = {
      BC1: "BC1",
      BC2: "BC2",
      EXAM_LIST: "File 48",
      EXAM_RESULT: "KQSH",
    };

    return names[type] ?? type;
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, minWidth: 0 }}>
      <CardContent>
        <SectionHeader
          title="Import dữ liệu gần đây"
          description="6 lần import mới nhất trên hệ thống"
        />

        {!items.length ? (
          <Typography variant="body2" color="text.secondary">
            Chưa có lịch sử import.
          </Typography>
        ) : (
          <Stack divider={<Divider flexItem />}>
            {items.map((item) => (
              <Stack
                key={item.id}
                direction="row"
                sx={{
                  py: 1.25,
                  alignItems: "center",
                  justifyContent: "space-between",
                  spacing: 1,
                }}
              >
                <Stack
                  direction="row"
                  sx={{ minWidth: 0, spacing: 1.25, alignItems: "center" }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "#eff6ff",
                      color: "#2563a6",
                      borderRadius: 2,
                    }}
                  >
                    <FileUploadOutlined fontSize="small" />
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.fileName}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(item.importedAt)}
                      {" · "}
                      {formatNumber(item.totalRecords)} bản ghi
                    </Typography>
                  </Box>
                </Stack>

                <Chip
                  size="small"
                  variant="outlined"
                  label={typeName(item.type)}
                />
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

const quickLinks = [
  {
    label: "Học viên",
    description: "Danh sách và lịch sử thi",
    href: "/students",
    icon: GroupsOutlined,
  },
  {
    label: "Khóa đào tạo",
    description: "Quản lý khóa học",
    href: "/courses",
    icon: SchoolOutlined,
  },
  {
    label: "Thống kê sát hạch",
    description: "Báo cáo chuyên sâu",
    href: "/exam-statistics",
    icon: TrendingUpOutlined,
  },
  {
    label: "Kỳ sát hạch",
    description: "Danh sách và kết quả",
    href: "/exams",
    icon: AssessmentOutlined,
  },
];

export function DashboardContent() {
  const { user, accessToken, loading: authLoading } = useAuth();

  const [year, setYear] = useState(new Date().getFullYear());

  const [courseId, setCourseId] = useState<number | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);

  const [options, setOptions] = useState<ExamStatisticsFilters | null>(null);

  const [data, setData] = useState<DashboardOverview | null>(null);

  const [filtersLoading, setFiltersLoading] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // Bộ lọc lấy từ API thống kê sát hạch hiện có.
  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    setFiltersLoading(true);

    void getExamStatisticsFilters(accessToken, {
      year,
      courseId,
    })
      .then((response) => {
        if (!active) return;

        setOptions(response);

        if (
          sessionId !== null &&
          !response.sessions.some((item) => item.id === sessionId)
        ) {
          setSessionId(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error ? err.message : "Không thể tải bộ lọc Dashboard."
        );
      })
      .finally(() => {
        if (active) setFiltersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, year, courseId, sessionId]);

  const load = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");

    try {
      const response = await getDashboardOverview(accessToken, {
        year,
        courseId,
        sessionId,
      });

      setData(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải dữ liệu Dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, year, courseId, sessionId, reload]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <Stack
      spacing={3}
      sx={{
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      {/* WELCOME */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: {
            xs: "flex-start",
            sm: "center",
          },
          spacing: 2,
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              fontSize: { xs: 21, md: 26 },
            }}
          >
            Xin chào, {user?.fullName || "Quản trị viên"}!
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Tổng quan hoạt động đào tạo và sát hạch lái xe.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshOutlined />}
          disabled={loading || filtersLoading}
          onClick={() => setReload((n) => n + 1)}
          sx={{ textTransform: "none" }}
        >
          Làm mới dữ liệu
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {/* FILTERS */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
            Phạm vi thống kê
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "160px minmax(200px,1fr) minmax(230px,1fr)",
              },
              gap: 2,
            }}
          >
            <TextField
              select
              size="small"
              label="Năm sát hạch"
              value={year}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setCourseId(null);
                setSessionId(null);
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

            <TextField
              select
              size="small"
              label="Khóa đào tạo"
              value={courseId === null ? "" : String(courseId)}
              onChange={(event) => {
                const value = event.target.value;

                setCourseId(value ? Number(value) : null);
                setSessionId(null);
              }}
              fullWidth
            >
              <MenuItem value="">Tất cả khóa đào tạo</MenuItem>

              {(options?.courses ?? []).map((course) => (
                <MenuItem key={course.id} value={String(course.id)}>
                  {course.code} — {course.schoolName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Kỳ sát hạch"
              value={sessionId === null ? "" : String(sessionId)}
              onChange={(event) => {
                const value = event.target.value;
                setSessionId(value ? Number(value) : null);
              }}
              disabled={filtersLoading}
              fullWidth
            >
              <MenuItem value="">Tất cả kỳ sát hạch</MenuItem>

              {(options?.sessions ?? []).map((session) => (
                <MenuItem key={session.id} value={String(session.id)}>
                  {session.code} — {formatDate(session.examDate)}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {(loading || filtersLoading) && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* KPI */}
      <KpiCards data={data?.summary ?? null} />

      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        Đạt, Chưa đậu và Chờ kết quả là các nhóm học viên trong phạm vi lọc. Chỉ
        tiêu Có lần vắng có thể trùng các nhóm khác. Học viên thi lại được xác
        định trên toàn bộ lịch sử sát hạch.
      </Typography>

      {/* CHARTS */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "minmax(0,1.45fr) minmax(0,1fr)",
          },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        <MonthlyChart items={data?.monthlyResults ?? []} />
        <PartStatistics items={data?.partResults ?? []} />
      </Box>

      {/* SESSIONS AND COURSES */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            lg: "repeat(2, minmax(0,1fr))",
          },
          gap: 2,
          alignItems: "start",
        }}
      >
        <RecentSessions items={data?.recentSessions ?? []} />
        <CoursePerformance items={data?.coursePerformance ?? []} />
      </Box>

      {/* IMPORTS */}
      <RecentImports items={data?.recentImports ?? []} />

      {/* QUICK LINKS */}
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
          Truy cập nhanh
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0,1fr))",
              lg: "repeat(4, minmax(0,1fr))",
            },
            gap: 2,
          }}
        >
          {quickLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Card
                key={item.href}
                component={Link}
                href={item.href}
                variant="outlined"
                sx={{
                  minWidth: 0,
                  borderRadius: 3,
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 160ms",
                  "&:hover": {
                    borderColor: "primary.main",
                    bgcolor: "action.hover",
                  },
                }}
              >
                <CardContent>
                  <Icon color="primary" sx={{ mb: 1, fontSize: 28 }} />

                  <Typography variant="body2" sx={{ fontWeight: 800 }}>
                    {item.label}
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    {item.description}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Box>
    </Stack>
  );
}
