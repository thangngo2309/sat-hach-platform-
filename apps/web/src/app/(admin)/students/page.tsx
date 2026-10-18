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
  CloseOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";

import {
  getStudentDetail,
  listStudents,
  type PageResult,
  type StudentDetail,
  type StudentRow,
} from "@/lib/bc2-view";

type Bc2Status = "all" | "has_bc2" | "no_bc2";

function formatDate(value?: string | null) {
  if (!value) return "—";

  const text = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          fontWeight: 600,
          overflowWrap: "anywhere",
        }}
      >
        {value === null || value === undefined || value === "" ? "—" : value}
      </Typography>
    </Box>
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
    hasBc2: bc2Reports.length > 0 || student.hasBc2 === true,
    bc2Count: bc2Reports.length || Number(student.bc2Count ?? 0),
    courseCount: Number(student.courseCount ?? courses.length),
  };
}

export default function StudentsPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const schoolId = Number(searchParams.get("schoolId") || 0);
  const courseId = Number(searchParams.get("courseId") || 0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Bc2Status>("all");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [result, setResult] = useState<PageResult<StudentRow> | null>(null);

  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;

    setFetching(true);
    setError("");

    try {
      const response = await listStudents(accessToken, {
        page,
        limit: 20,
        search,
        schoolId: schoolId || undefined,
        courseId: courseId || undefined,
        bc2Status: status,
      });

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
  }, [accessToken, page, search, schoolId, courseId, status, reload]);

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

  if (authLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "stretch", sm: "center" },
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Danh sách học viên
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Quản lý và đối chiếu hồ sơ BC1, BC2.
          </Typography>
        </Box>

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

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack
          component="form"
          sx={{
            direction: { xs: "column", md: "row" },
            gap: 2,
          }}
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
            sx={{ flex: 1 }}
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
            sx={{ minWidth: { md: 190 } }}
          >
            <MenuItem value="all">Tất cả</MenuItem>
            <MenuItem value="has_bc2">Đã có BC2</MenuItem>
            <MenuItem value="no_bc2">Chưa có BC2</MenuItem>
          </TextField>

          <Button
            type="submit"
            variant="contained"
            startIcon={<SearchOutlined />}
            sx={{ textTransform: "none" }}
          >
            Tìm kiếm
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Tổng học viên:{" "}
          {(result?.pagination.total ?? 0).toLocaleString("vi-VN")}
          {courseId > 0 ? " · Đang lọc theo khóa học" : ""}
          {schoolId > 0 ? " · Đang lọc theo trường" : ""}
        </Typography>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        {fetching && !result ? (
          <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ảnh</TableCell>
                  <TableCell>Mã đăng ký</TableCell>
                  <TableCell>Họ và tên</TableCell>
                  <TableCell>Ngày sinh</TableCell>
                  <TableCell>CCCD</TableCell>
                  <TableCell>Khóa BC1</TableCell>
                  <TableCell>Trạng thái BC2</TableCell>
                  <TableCell>Mã BC2</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {(result?.data ?? []).map((student) => {
                  const courses = student.courses ?? [];
                  const bc2Reports = student.bc2Reports ?? [];

                  const hasBc2 =
                    student.hasBc2 === true || bc2Reports.length > 0;

                  return (
                    <TableRow key={student.id} hover>
                      <TableCell>
                        <StudentAvatar
                          studentId={student.id}
                          fullName={student.fullName}
                          size={44}
                        />
                      </TableCell>

                      <TableCell>{student.registrationCode}</TableCell>

                      <TableCell sx={{ fontWeight: 700 }}>
                        {student.fullName}
                      </TableCell>

                      <TableCell>{formatDate(student.dateOfBirth)}</TableCell>

                      <TableCell>{student.identityNumber ?? "—"}</TableCell>

                      <TableCell>
                        <Stack
                          direction="row"
                          sx={{ flexWrap: "wrap", gap: 0.5 }}
                        >
                          {courses.length
                            ? courses.map((course) => (
                                <Chip
                                  key={course.id}
                                  size="small"
                                  variant="outlined"
                                  label={course.code}
                                />
                              ))
                            : "Chưa có BC1"}
                        </Stack>
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          color={hasBc2 ? "success" : "default"}
                          label={hasBc2 ? "Đã có BC2" : "Chưa có BC2"}
                        />
                      </TableCell>

                      <TableCell>
                        {bc2Reports.length
                          ? [
                              ...new Set(
                                bc2Reports.map((report) => report.bc2Code)
                              ),
                            ].join(", ")
                          : hasBc2
                          ? "Xem chi tiết"
                          : "—"}
                      </TableCell>

                      <TableCell align="right">
                        <Button
                          size="small"
                          startIcon={<VisibilityOutlined />}
                          onClick={() => setSelectedId(student.id)}
                          sx={{ textTransform: "none" }}
                        >
                          Chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!fetching && (result?.data.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      Không có học viên phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
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

      <Dialog
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle component="div">
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Chi tiết hồ sơ học viên
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Tổng hợp thông tin BC1 và BC2
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
            <Stack spacing={3}>
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    mb: 2,
                  }}
                >
                  <StudentAvatar
                    studentId={detail.id}
                    fullName={detail.fullName}
                    size={112}
                  />

                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>
                      {detail.fullName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {detail.registrationCode}
                    </Typography>
                  </Box>
                </Box>

                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Thông tin cá nhân
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "1fr 1fr",
                    },
                    gap: 2,
                  }}
                >
                  <Info label="Họ và tên" value={detail.fullName} />
                  <Info label="Mã đăng ký" value={detail.registrationCode} />
                  <Info
                    label="Ngày sinh"
                    value={formatDate(detail.dateOfBirth)}
                  />
                  <Info label="CCCD/CMND" value={detail.identityNumber} />
                  <Info label="Giới tính" value={detail.gender} />
                  <Info label="Quốc tịch" value={detail.nationalityName} />
                  <Info label="Thường trú" value={detail.permanentAddress} />
                  <Info label="Nơi cư trú" value={detail.currentAddress} />
                </Box>
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Khóa đào tạo BC1 ({detail.courses.length})
                </Typography>

                {detail.courses.length === 0 ? (
                  <Alert severity="info">
                    Chưa có dữ liệu BC1 của học viên.
                  </Alert>
                ) : (
                  detail.courses.map((course) => (
                    <Card
                      key={course.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        mb: 1.5,
                        borderRadius: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "1fr 1fr",
                          },
                          gap: 2,
                        }}
                      >
                        <Info label="Mã khóa" value={course.code} />
                        <Info label="Tên khóa" value={course.name} />
                        <Info
                          label="Trường đào tạo"
                          value={course.schoolName}
                        />
                        <Info label="Mã BC1" value={course.bc1Code} />
                        <Info label="Số hồ sơ" value={course.fileNumber} />
                        <Info label="Hạng GPLX" value={course.licenseClass} />
                      </Box>
                    </Card>
                  ))
                )}
              </Box>

              <Divider />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                  Báo cáo BC2 ({detail.bc2Reports.length})
                </Typography>

                {detail.bc2Reports.length === 0 ? (
                  <Alert severity="info">
                    Chưa tìm thấy báo cáo BC2 tương ứng.
                  </Alert>
                ) : (
                  detail.bc2Reports.map((report) => (
                    <Card
                      key={report.reportId}
                      variant="outlined"
                      sx={{
                        p: 2,
                        mb: 1.5,
                        borderRadius: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "1fr 1fr",
                          },
                          gap: 2,
                        }}
                      >
                        <Info label="Mã BC2" value={report.bc2Code} />
                        <Info
                          label="Mã BC1 tham chiếu"
                          value={report.bc1Code}
                        />
                        <Info
                          label="Trường đào tạo"
                          value={report.schoolName}
                        />
                        <Info
                          label="Ngày báo cáo"
                          value={formatDate(report.documentDate)}
                        />
                        <Info label="Số hồ sơ" value={report.fileNumber} />
                        <Info
                          label="Hạng đề nghị sát hạch"
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
                  ))
                )}
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
