"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
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
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { StudentFormDialog } from "@/components/students/StudentFormDialog";

import {
  getStudentDetail,
  listStudents,
  listCourseSummaries,
  type CourseSummary,
  type StudentDetail,
  type StudentExamHistory,
  type StudentExamStatus,
  type StudentRow,
  type StudentsPageResult,
} from "@/lib/bc2-view";

import type { StudentFormData } from "@/lib/student-management";
import { API_URL } from "@/lib/auth";

type Bc2Status = "all" | "has_bc2" | "no_bc2";

type ExamFilter = "all" | StudentExamStatus | "absent" | "retake";

function formatDate(value?: string | null) {
  if (!value) return "—";

  const text = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        {label}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          overflowWrap: "anywhere",
          mt: 0.25,
        }}
      >
        {value === null || value === undefined || value === "" ? "—" : value}
      </Typography>
    </Box>
  );
}

function ExamStatusChip({ status }: { status: StudentExamStatus }) {
  const config = {
    passed: {
      label: "Đã đậu",
      color: "success",
    },
    failed: {
      label: "Chưa đậu",
      color: "error",
    },
    pending: {
      label: "Chờ kết quả",
      color: "warning",
    },
    not_examined: {
      label: "Chưa dự thi",
      color: "default",
    },
  } as const;

  const item = config[status] ?? config.not_examined;

  return (
    <Chip
      size="small"
      label={item.label}
      color={item.color}
      sx={{
        fontWeight: 600,
        maxWidth: "100%",
      }}
    />
  );
}

function PartResultChip({ value }: { value: string | null }) {
  if (value === "DA") {
    return <Chip size="small" color="success" label="Đạt" />;
  }

  if (value === "RO") {
    return <Chip size="small" color="error" label="Không đạt" />;
  }

  if (value === "VA") {
    return <Chip size="small" color="warning" label="Vắng" />;
  }

  return (
    <Chip size="small" variant="outlined" label={value || "Chưa có kết quả"} />
  );
}

function normalizeStudent<T extends StudentRow>(student: T): T {
  const courses = Array.isArray(student.courses) ? student.courses : [];

  const bc2Reports = Array.isArray(student.bc2Reports)
    ? student.bc2Reports
    : [];

  return {
    ...student,
    courses,
    bc2Reports,
    hasBc2: student.hasBc2 === true || bc2Reports.length > 0,
    bc2Count: Number(student.bc2Count ?? bc2Reports.length),
    courseCount: Number(student.courseCount ?? courses.length),
    examSessionCount: Number(student.examSessionCount ?? 0),
    examResultCount: Number(student.examResultCount ?? 0),
    passedSessionCount: Number(student.passedSessionCount ?? 0),
    everAbsent: student.everAbsent === true,
    examStatus: student.examStatus ?? "not_examined",
    latestExam: student.latestExam ?? null,
  };
}

function SummaryCards({
  summary,
}: {
  summary: StudentsPageResult["summary"] | null;
}) {
  const stats = [
    {
      label: "Tổng học viên",
      value: summary?.total ?? 0,
      color: "text.primary",
    },
    {
      label: "Đã đậu",
      value: summary?.passed ?? 0,
      color: "success.main",
    },
    {
      label: "Chưa đậu",
      value: summary?.failed ?? 0,
      color: "error.main",
    },
    {
      label: "Chờ kết quả",
      value: summary?.pending ?? 0,
      color: "warning.main",
    },
    {
      label: "Chưa dự thi",
      value: summary?.notExamined ?? 0,
      color: "text.primary",
    },
    {
      label: "Từng vắng",
      value: summary?.everAbsent ?? 0,
      color: "warning.main",
    },
    {
      label: "Từ 2 kỳ trở lên",
      value: summary?.retake ?? 0,
      color: "info.main",
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
          xl: "repeat(7, minmax(0, 1fr))",
        },
        gap: 1.5,
      }}
    >
      {stats.map((stat) => (
        <Card
          key={stat.label}
          variant="outlined"
          sx={{ borderRadius: 2.5, minWidth: 0 }}
        >
          <Box sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                minHeight: 20,
              }}
            >
              {stat.label}
            </Typography>

            <Typography
              variant="h5"
              sx={{
                mt: 0.5,
                fontWeight: 800,
                color: stat.color,
              }}
            >
              {stat.value.toLocaleString("vi-VN")}
            </Typography>
          </Box>
        </Card>
      ))}
    </Box>
  );
}

function StudentTable({
  students,
  loading,
  onEdit,
  onDetail,
}: {
  students: StudentRow[];
  loading: boolean;
  onEdit: (id: number) => void;
  onDetail: (id: number) => void;
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
        size="medium"
        sx={{
          minWidth: 950,
          tableLayout: "fixed",

          "& .MuiTableCell-head": {
            bgcolor: "grey.50",
            color: "text.secondary",
            fontWeight: 700,
            fontSize: 12,
            whiteSpace: "nowrap",
            borderBottom: "1px solid",
            borderColor: "divider",
            py: 1.75,
          },

          "& .MuiTableCell-body": {
            py: 1.75,
            px: 1.5,
            verticalAlign: "middle",
            borderBottom: "1px solid",
            borderColor: "divider",
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 250 }}>Học viên</TableCell>

            <TableCell sx={{ width: 160 }}>Thông tin cá nhân</TableCell>

            <TableCell sx={{ width: 170 }}>Đào tạo</TableCell>

            <TableCell sx={{ width: 150 }}>Lịch sử sát hạch</TableCell>

            <TableCell sx={{ width: 125 }}>Kết quả</TableCell>

            <TableCell align="right" sx={{ width: 125 }}>
              Thao tác
            </TableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          {students.map((student) => {
            const courses = student.courses ?? [];
            const bc2Reports = student.bc2Reports ?? [];

            const hasBc2 = student.hasBc2 === true || bc2Reports.length > 0;

            return (
              <TableRow
                key={student.id}
                hover
                sx={{
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                {/* HỌC VIÊN */}
                <TableCell>
                  <Stack
                    direction="row"
                    sx={{ minWidth: 0, spacing: 1.5, alignItems: "center" }}
                  >
                    <Box sx={{ flexShrink: 0 }}>
                      <StudentAvatar
                        studentId={student.id}
                        fullName={student.fullName}
                        size={48}
                      />
                    </Box>

                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          lineHeight: 1.4,
                          overflowWrap: "break-word",
                        }}
                      >
                        {student.fullName}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          mt: 0.5,
                          fontSize: 11,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {student.registrationCode}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>

                {/* THÔNG TIN CÁ NHÂN */}
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography
                      variant="body2"
                      sx={{ whiteSpace: "nowrap", fontWeight: 600 }}
                    >
                      {formatDate(student.dateOfBirth)}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      CCCD: {student.identityNumber ?? "—"}
                    </Typography>
                  </Stack>
                </TableCell>

                {/* ĐÀO TẠO */}
                <TableCell>
                  <Stack sx={{ spacing: 0.75, alignItems: "flex-start" }}>
                    {courses.length ? (
                      <Stack
                        direction="row"
                        sx={{ flexWrap: "wrap", gap: 0.5 }}
                      >
                        {courses.slice(0, 2).map((course) => (
                          <Chip
                            key={course.id}
                            size="small"
                            variant="outlined"
                            label={course.code}
                            sx={{
                              height: "auto",
                              maxWidth: 150,
                              "& .MuiChip-label": {
                                py: 0.5,
                                whiteSpace: "normal",
                                overflowWrap: "anywhere",
                              },
                            }}
                          />
                        ))}

                        {courses.length > 2 && (
                          <Chip
                            size="small"
                            label={`+${courses.length - 2} khóa`}
                          />
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        Chưa có BC1
                      </Typography>
                    )}

                    <Chip
                      size="small"
                      color={hasBc2 ? "success" : "default"}
                      variant={hasBc2 ? "outlined" : "filled"}
                      label={hasBc2 ? "Đã có BC2" : "Chưa có BC2"}
                      sx={{ height: 23, fontSize: 11 }}
                    />

                    {hasBc2 && bc2Reports.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          maxWidth: "100%",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {[
                          ...new Set(bc2Reports.map((item) => item.bc2Code)),
                        ].join(", ")}
                      </Typography>
                    )}
                  </Stack>
                </TableCell>

                {/* LỊCH SỬ SÁT HẠCH */}
                <TableCell>
                  <Stack spacing={0.4}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      {student.examSessionCount} kỳ
                      <Typography
                        component="span"
                        variant="caption"
                        color="text.secondary"
                        sx={{ ml: 0.75, fontWeight: 400 }}
                      >
                        ({student.examResultCount} có KQ)
                      </Typography>
                    </Typography>

                    {student.latestExam ? (
                      <>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {student.latestExam.sessionCode}
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          {formatDate(student.latestExam.examDate)}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        Chưa có kỳ thi
                      </Typography>
                    )}
                  </Stack>
                </TableCell>

                {/* KẾT QUẢ */}
                <TableCell>
                  <Stack sx={{ spacing: 0.75, alignItems: "flex-start" }}>
                    <ExamStatusChip status={student.examStatus} />

                    {student.everAbsent && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label="Từng vắng"
                        sx={{ height: 23, fontSize: 11 }}
                      />
                    )}
                  </Stack>
                </TableCell>

                {/* THAO TÁC */}
                <TableCell align="right">
                  <Stack
                    direction="column"
                    sx={{ spacing: 0.5, alignItems: "flex-end" }}
                  >
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlined fontSize="small" />}
                      onClick={() => onDetail(student.id)}
                      sx={{
                        minWidth: 100,
                        textTransform: "none",
                      }}
                    >
                      Chi tiết
                    </Button>

                    {!hasBc2 && (
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<EditOutlined fontSize="small" />}
                        onClick={() => onEdit(student.id)}
                        sx={{
                          minWidth: 100,
                          textTransform: "none",
                        }}
                      >
                        Sửa
                      </Button>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}

          {!loading && students.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                <Typography color="text.secondary">
                  Không có học viên phù hợp.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ExamHistoryCard({
  exam,
  order,
}: {
  exam: StudentExamHistory;
  order: number;
}) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <Box sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
            spacing: 1,
          }}
        >
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Lần {order} · Kỳ {exam.sessionCode}
            </Typography>

            <Typography variant="caption" color="text.secondary">
              {formatDate(exam.examDate)}
              {" · "}
              SBD: {exam.examinationNumber ?? "—"}
              {" · "}
              Hạng: {exam.licenseClass ?? "—"}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5}>
            {exam.hasAbsentPart && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label="Có phần vắng"
              />
            )}

            {exam.hasResult ? (
              <PartResultChip value={exam.resultStatus} />
            ) : (
              <Chip size="small" variant="outlined" label="Chờ KQSH" />
            )}
          </Stack>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          Trung tâm: {exam.centerName || exam.centerCode || "—"}
          {" · "}
          Nội dung: {exam.examinationContent || "—"}
        </Typography>

        {exam.parts.length > 0 && (
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
                {exam.parts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell>{part.examType}</TableCell>

                    <TableCell>{formatDate(part.examDate)}</TableCell>

                    <TableCell>
                      {part.score ?? "—"}
                      {part.maximumScore ? ` / ${part.maximumScore}` : ""}
                    </TableCell>

                    <TableCell>
                      <PartResultChip value={part.resultStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {!exam.hasResult && (
          <Alert severity="info" sx={{ mt: 1.5 }}>
            Đã có tên trong danh sách kỳ sát hạch nhưng chưa có file KQSH.
          </Alert>
        )}
      </Box>
    </Card>
  );
}

function StudentDetailContent({ detail }: { detail: StudentDetail }) {
  const history = Array.isArray(detail.examHistory) ? detail.examHistory : [];

  const partStats = Array.isArray(detail.partStats) ? detail.partStats : [];

  const courses = Array.isArray(detail.courses) ? detail.courses : [];

  const reports = Array.isArray(detail.bc2Reports) ? detail.bc2Reports : [];

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: "center", spacing: 2 }}>
        <StudentAvatar
          studentId={detail.id}
          fullName={detail.fullName}
          size={96}
        />

        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {detail.fullName}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            {detail.registrationCode}
          </Typography>

          <ExamStatusChip status={detail.examStatus} />
        </Box>
      </Stack>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Thông tin cá nhân
        </Typography>

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
          <Info label="Họ và tên" value={detail.fullName} />
          <Info label="Mã đăng ký" value={detail.registrationCode} />
          <Info label="Ngày sinh" value={formatDate(detail.dateOfBirth)} />
          <Info label="CCCD/CMND" value={detail.identityNumber} />
          <Info label="Giới tính" value={detail.gender} />
          <Info label="Quốc tịch" value={detail.nationalityName} />
          <Info label="Thường trú" value={detail.permanentAddress} />
          <Info label="Nơi cư trú" value={detail.currentAddress} />
        </Box>
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Tổng hợp sát hạch
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              sm: "repeat(3, minmax(0, 1fr))",
            },
            gap: 2,
          }}
        >
          <Info label="Số kỳ được xếp thi" value={detail.examSessionCount} />

          <Info label="Số kỳ có kết quả" value={detail.examResultCount} />

          <Info label="Số kỳ đạt" value={detail.passedSessionCount} />

          <Info label="Từng vắng" value={detail.everAbsent ? "Có" : "Không"} />

          <Info label="Kỳ gần nhất" value={detail.latestExam?.sessionCode} />

          <Info
            label="Ngày kỳ gần nhất"
            value={formatDate(detail.latestExam?.examDate)}
          />
        </Box>

        {partStats.length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              Thống kê theo phần thi
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Phần thi</TableCell>
                    <TableCell align="center">Số lượt</TableCell>
                    <TableCell align="center">Đạt</TableCell>
                    <TableCell align="center">Không đạt</TableCell>
                    <TableCell align="center">Vắng</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {partStats.map((stat) => (
                    <TableRow key={stat.examType}>
                      <TableCell>{stat.examType}</TableCell>
                      <TableCell align="center">{stat.attemptCount}</TableCell>
                      <TableCell align="center">{stat.passedCount}</TableCell>
                      <TableCell align="center">{stat.failedCount}</TableCell>
                      <TableCell align="center">{stat.absentCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Lịch sử sát hạch ({history.length})
        </Typography>

        {history.length === 0 ? (
          <Alert severity="info">Chưa có dữ liệu sát hạch từ file 48.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {history.map((exam, index) => (
              <ExamHistoryCard
                key={exam.id}
                exam={{
                  ...exam,
                  parts: Array.isArray(exam.parts) ? exam.parts : [],
                }}
                order={index + 1}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Khóa đào tạo BC1 ({courses.length})
        </Typography>

        {courses.length === 0 ? (
          <Alert severity="info">Chưa có dữ liệu BC1 của học viên.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {courses.map((course) => (
              <Card
                key={course.id}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2 }}
              >
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
                  <Info label="Mã khóa" value={course.code} />
                  <Info label="Tên khóa" value={course.name} />
                  <Info label="Trường đào tạo" value={course.schoolName} />
                  <Info label="Mã BC1" value={course.bc1Code} />
                  <Info label="Số hồ sơ" value={course.fileNumber} />
                  <Info label="Hạng GPLX" value={course.licenseClass} />
                </Box>
              </Card>
            ))}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Báo cáo BC2 ({reports.length})
        </Typography>

        {reports.length === 0 ? (
          <Alert severity="info">Chưa tìm thấy báo cáo BC2 tương ứng.</Alert>
        ) : (
          <Stack spacing={1.5}>
            {reports.map((report) => (
              <Card
                key={report.reportId}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2 }}
              >
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
                  <Info label="Mã BC2" value={report.bc2Code} />
                  <Info label="Mã BC1" value={report.bc1Code} />
                  <Info label="Trường đào tạo" value={report.schoolName} />
                  <Info
                    label="Ngày báo cáo"
                    value={formatDate(report.documentDate)}
                  />
                  <Info label="Số hồ sơ" value={report.fileNumber} />
                  <Info
                    label="Hạng sát hạch"
                    value={report.requestedLicenseClass}
                  />
                  <Info
                    label="Số GPLX đã có"
                    value={report.previousLicenseNumber}
                  />
                  <Info
                    label="Hạng GPLX đã có"
                    value={report.previousLicenseClass}
                  />
                  <Info
                    label="Nội dung sát hạch"
                    value={report.examContentCode}
                  />
                </Box>
              </Card>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

export default function StudentsPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const schoolId = Number(searchParams.get("schoolId") || 0);
  const urlCourseId = Number(searchParams.get("courseId") || 0);
  const [selectedCourseId, setSelectedCourseId] = useState(urlCourseId);
  const [bc1Code, setBc1Code] = useState("");
  const [courseOptions, setCourseOptions] = useState<CourseSummary[]>([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseError, setCourseError] = useState("");

  useEffect(() => {
    setSelectedCourseId(urlCourseId);
    setBc1Code("");
    setPage(1);
  }, [urlCourseId]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setCourseLoading(true);
    setCourseError("");

    const fetchCourses = async () => {
      const collected: CourseSummary[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const response = await listCourseSummaries(accessToken, {
          page: currentPage,
          limit: 100,
          schoolId: schoolId || undefined,
        });
        if (cancelled) return;
        collected.push(...response.data);
        totalPages = response.pagination.totalPages;
        currentPage += 1;
      } while (currentPage <= totalPages);

      if (!cancelled) setCourseOptions(collected);
    };

    void fetchCourses()
      .catch((error: unknown) => {
        if (!cancelled) {
          setCourseError(
            error instanceof Error
              ? error.message
              : "Không thể tải danh sách khóa học."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCourseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, schoolId]);

  const bc1Options = [
    ...new Set(
      courseOptions
        .map((course) => course.bc1Code)
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b, "vi"));

  const visibleCourses = bc1Code
    ? courseOptions.filter((course) => course.bc1Code === bc1Code)
    : courseOptions;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [status, setStatus] = useState<Bc2Status>("all");
  const [examStatus, setExamStatus] = useState<ExamFilter>("all");

  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [result, setResult] = useState<StudentsPageResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [formOpen, setFormOpen] = useState(false);

  const [editingStudent, setEditingStudent] = useState<
    | (Partial<StudentFormData> & {
        id: number;
        hasPhoto?: boolean;
      })
    | null
  >(null);

  const load = useCallback(async () => {
    if (!accessToken) return;

    setFetching(true);
    setError("");

    try {
      const filters = {
        page,
        limit: 20,
        search,
        schoolId: schoolId || undefined,
        courseId: selectedCourseId || undefined,
        bc2Status: status,
        examStatus,
      };

      // bc1Code requires corresponding server-side support in Bc2ViewService.students().
      // This keeps pagination and summary consistent; no client-side page filtering.
      let response: StudentsPageResult;
      if (bc1Code) {
        const query = new URLSearchParams({
          page: String(filters.page),
          limit: String(filters.limit),
          bc1Code,
          bc2Status: filters.bc2Status,
          examStatus: filters.examStatus,
        });
        if (filters.search) query.set("search", filters.search);
        if (filters.schoolId) query.set("schoolId", String(filters.schoolId));
        if (filters.courseId) query.set("courseId", String(filters.courseId));

        const res = await fetch(`${API_URL}/bc2-view/students?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Không thể lọc học viên theo BC1.");
        response = (await res.json()) as StudentsPageResult;
      } else {
        response = await listStudents(accessToken, filters);
      }

      setResult({
        ...response,
        data: Array.isArray(response.data)
          ? response.data.map(normalizeStudent)
          : [],
      });
    } catch (err) {
      setResult(null);

      setError(
        err instanceof Error ? err.message : "Không thể tải danh sách học viên."
      );
    } finally {
      setFetching(false);
    }
  }, [
    accessToken,
    page,
    search,
    schoolId,
    selectedCourseId,
    bc1Code,
    status,
    examStatus,
    reload,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId || !accessToken) return;

    let active = true;

    setDetailLoading(true);
    setDetailError("");
    setDetail(null);

    void getStudentDetail(accessToken, selectedId)
      .then((response) => {
        if (active) {
          setDetail(normalizeStudent(response));
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setDetailError(
            err instanceof Error
              ? err.message
              : "Không thể tải chi tiết học viên."
          );
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, selectedId]);

  const openCreateStudent = () => {
    setEditingStudent(null);
    setFormOpen(true);
  };

  const openEditStudent = async (id: number) => {
    if (!accessToken) return;

    try {
      const student = await getStudentDetail(accessToken, id);

      setEditingStudent({
        id: student.id,
        hasPhoto: student.hasPhoto,
        registrationCode: student.registrationCode,
        fullName: student.fullName,
        familyName: student.familyName ?? "",
        givenName: student.givenName ?? "",
        dateOfBirth: student.dateOfBirth ?? "",
        gender: student.gender ?? "",
        identityNumber: student.identityNumber ?? "",
        nationalityCode: student.nationalityCode ?? "",
        nationalityName: student.nationalityName ?? "",
        permanentAddress: student.permanentAddress ?? "",
        currentAddress: student.currentAddress ?? "",
      });

      setFormOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải học viên để chỉnh sửa."
      );
    }
  };

  if (authLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0, maxWidth: "100%" }}>
      {/* HEADER */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Danh sách học viên
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Quản lý hồ sơ BC1, BC2 và lịch sử sát hạch.
          </Typography>
        </Box>

        <Stack direction="row" sx={{ spacing: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={openCreateStudent}
            sx={{ textTransform: "none" }}
          >
            Thêm học viên
          </Button>

          <Button
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => setReload((value) => value + 1)}
            disabled={fetching}
            sx={{ textTransform: "none" }}
          >
            Tải lại
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {courseError && <Alert severity="warning">{courseError}</Alert>}

      {/* SUMMARY */}
      <SummaryCards summary={result?.summary ?? null} />

      {/* FILTERS */}
      <Card
        variant="outlined"
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 3,
        }}
      >
        <Stack spacing={1.5}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
              gap: 1.5,
            }}
          >
            <TextField
              select
              size="small"
              fullWidth
              label="BC1"
              value={bc1Code}
              disabled={courseLoading}
              onChange={(event) => {
                setBc1Code(event.target.value);
                setSelectedCourseId(0);
                setPage(1);
              }}
            >
              <MenuItem value="">Tất cả BC1</MenuItem>
              {bc1Options.map((code) => (
                <MenuItem key={code} value={code}>
                  {code}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              fullWidth
              label="Khóa đào tạo"
              value={selectedCourseId ? String(selectedCourseId) : ""}
              disabled={courseLoading}
              onChange={(event) => {
                setSelectedCourseId(Number(event.target.value) || 0);
                setPage(1);
              }}
            >
              <MenuItem value="">Tất cả khóa đào tạo</MenuItem>
              {visibleCourses.map((course) => (
                <MenuItem key={course.id} value={String(course.id)}>
                  {course.code}
                  {course.name && course.name !== course.code
                    ? ` — ${course.name}`
                    : ""}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Stack
            component="form"
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <TextField
              size="small"
              label="Họ tên, mã đăng ký, CCCD"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              sx={{ flex: 1, minWidth: { md: 200 } }}
            />

            <TextField
              select
              size="small"
              label="Trạng thái BC2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as Bc2Status);
                setPage(1);
              }}
              sx={{ minWidth: { md: 165 } }}
            >
              <MenuItem value="all">Tất cả BC2</MenuItem>
              <MenuItem value="has_bc2">Đã có BC2</MenuItem>
              <MenuItem value="no_bc2">Chưa có BC2</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Kết quả sát hạch"
              value={examStatus}
              onChange={(event) => {
                setExamStatus(event.target.value as ExamFilter);
                setPage(1);
              }}
              sx={{ minWidth: { md: 170 } }}
            >
              <MenuItem value="all">Tất cả kết quả</MenuItem>
              <MenuItem value="passed">Đã đậu</MenuItem>
              <MenuItem value="failed">Chưa đậu</MenuItem>
              <MenuItem value="pending">Chờ kết quả</MenuItem>
              <MenuItem value="not_examined">Chưa dự thi</MenuItem>
              <MenuItem value="absent">Từng vắng</MenuItem>
              <MenuItem value="retake">Từ 2 kỳ trở lên</MenuItem>
            </TextField>

            <Button
              type="submit"
              variant="contained"
              startIcon={<SearchOutlined />}
              sx={{
                textTransform: "none",
                px: 2.5,
              }}
            >
              Tìm kiếm
            </Button>
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 1.5 }}
          >
            Tìm thấy{" "}
            <strong>
              {(result?.pagination.total ?? 0).toLocaleString("vi-VN")}
            </strong>{" "}
            học viên
            {selectedCourseId > 0 ? " · Đang lọc theo khóa học" : ""}
            {bc1Code ? ` · BC1: ${bc1Code}` : ""}
            {schoolId > 0 ? " · Đang lọc theo trường" : ""}
          </Typography>
        </Stack>
      </Card>

      {/* TABLE */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
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
          <StudentTable
            students={result?.data ?? []}
            loading={fetching}
            onEdit={(id) => void openEditStudent(id)}
            onDetail={setSelectedId}
          />
        )}

        {fetching && result && (
          <Box sx={{ px: 2, py: 1 }}>
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
              color="primary"
              page={page}
              count={result!.pagination.totalPages}
              onChange={(_, value) => setPage(value)}
            />
          </Box>
        )}
      </Card>

      {/* DETAIL */}
      <Dialog
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
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
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Chi tiết hồ sơ học viên
              </Typography>

              <Typography variant="caption" color="text.secondary">
                Thông tin cá nhân, BC1, BC2 và lịch sử sát hạch
              </Typography>
            </Box>

            <IconButton onClick={() => setSelectedId(null)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {detailLoading ? (
            <Box
              sx={{
                py: 6,
                display: "grid",
                placeItems: "center",
              }}
            >
              <CircularProgress />
            </Box>
          ) : detailError ? (
            <Alert severity="error">{detailError}</Alert>
          ) : detail ? (
            <StudentDetailContent detail={detail} />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* CREATE / EDIT */}
      <StudentFormDialog
        open={formOpen}
        student={editingStudent}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          setEditingStudent(null);
          setSelectedId(null);
          setReload((current) => current + 1);
        }}
      />
    </Stack>
  );
}
