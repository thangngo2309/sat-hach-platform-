"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
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
  ArrowForwardOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";

import {
  getCourses,
  getSchools,
  getStudents,
  type Course,
  type PageResult,
  type Student,
  type TrainingSchool,
} from "@/lib/catalog";

type Section = "schools" | "courses" | "students";
type Item = TrainingSchool | Course | Student;

const sectionConfig = {
  schools: {
    title: "Trường đào tạo",
    description: "Danh sách cơ sở đào tạo được tổng hợp từ BC1.",
  },
  courses: {
    title: "Khóa học",
    description: "Danh sách các khóa đào tạo và số học viên đã import.",
  },
  students: {
    title: "Học viên",
    description: "Tra cứu thông tin học viên và các khóa học tham gia.",
  },
};

const PAGE_SIZE = 20;

export function CatalogPage({ section }: { section: Section }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, loading: authLoading } = useAuth();

  const initialSchoolId = Number(searchParams.get("schoolId") || 0);
  const initialCourseId = Number(searchParams.get("courseId") || 0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [courseId, setCourseId] = useState(initialCourseId);

  const [schools, setSchools] = useState<TrainingSchool[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [result, setResult] = useState<PageResult<Item> | null>(null);

  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const config = sectionConfig[section];

  const load = useCallback(async () => {
    if (!accessToken) return;

    setFetching(true);
    setError("");

    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        search,
        schoolId: schoolId || null,
        courseId: courseId || null,
      };

      let response: PageResult<Item>;

      if (section === "schools") {
        response = await getSchools(accessToken, params);
      } else if (section === "courses") {
        response = await getCourses(accessToken, params);
      } else {
        response = await getStudents(accessToken, params);
      }

      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu.");
      setResult(null);
    } finally {
      setFetching(false);
    }
  }, [accessToken, section, page, search, schoolId, courseId, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accessToken || section === "schools") return;

    let active = true;

    void getSchools(accessToken, { page: 1, limit: 100 })
      .then((response) => {
        if (active) setSchools(response.data);
      })
      .catch(() => {
        if (active) setSchools([]);
      });

    return () => {
      active = false;
    };
  }, [accessToken, section]);

  useEffect(() => {
    if (!accessToken || section !== "students") return;

    let active = true;

    void getCourses(accessToken, {
      page: 1,
      limit: 100,
      schoolId: schoolId || null,
    })
      .then((response) => {
        if (active) setCourses(response.data);
      })
      .catch(() => {
        if (active) setCourses([]);
      });

    return () => {
      active = false;
    };
  }, [accessToken, section, schoolId]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const formatDate = (value: string | null) => {
    if (!value) return "—";

    const parts = value.slice(0, 10).split("-");

    if (parts.length !== 3) return value;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const count = result?.pagination.total ?? 0;
  const rows = result?.data ?? [];

  const renderSchool = (school: TrainingSchool) => (
    <TableRow hover key={school.id}>
      <TableCell sx={{ fontWeight: 700 }}>{school.code}</TableCell>
      <TableCell>{school.name}</TableCell>
      <TableCell>{school.provinceName ?? "—"}</TableCell>
      <TableCell align="right">{school.courseCount}</TableCell>
      <TableCell align="right">{school.enrollmentCount}</TableCell>
      <TableCell align="right">
        <Button
          size="small"
          endIcon={<ArrowForwardOutlined />}
          onClick={() => router.push(`/courses?schoolId=${school.id}`)}
          sx={{ textTransform: "none" }}
        >
          Xem khóa học
        </Button>
      </TableCell>
    </TableRow>
  );

  const renderCourse = (course: Course) => (
    <TableRow hover key={course.id}>
      <TableCell sx={{ fontWeight: 700 }}>{course.code}</TableCell>
      <TableCell>{course.name}</TableCell>
      <TableCell>{course.schoolName}</TableCell>
      <TableCell>
        <Chip
          size="small"
          label={course.licenseClass ?? "—"}
          variant="outlined"
        />
      </TableCell>
      <TableCell>{formatDate(course.openingDate)}</TableCell>
      <TableCell align="right">{course.studentCount}</TableCell>
      <TableCell align="right">
        <Button
          size="small"
          endIcon={<ArrowForwardOutlined />}
          onClick={() => router.push(`/students?courseId=${course.id}`)}
          sx={{ textTransform: "none" }}
        >
          Xem học viên
        </Button>
      </TableCell>
    </TableRow>
  );

  const renderStudent = (student: Student) => (
    <TableRow hover key={student.id}>
      <TableCell>
        <StudentAvatar
          studentId={student.id}
          fullName={student.fullName}
          size={42}
        />
      </TableCell>
      <TableCell sx={{ fontWeight: 700 }}>{student.registrationCode}</TableCell>
      <TableCell>{student.fullName}</TableCell>
      <TableCell>{formatDate(student.dateOfBirth)}</TableCell>
      <TableCell>{student.identityNumber ?? "—"}</TableCell>
      <TableCell>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {student.courses.length ? (
            student.courses.map((course) => (
              <Chip
                key={course.id}
                size="small"
                label={course.code}
                variant="outlined"
                onClick={() =>
                  router.push(`/courses?schoolId=${course.schoolId}`)
                }
                title={course.schoolName}
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Chưa có khóa
            </Typography>
          )}
        </Stack>
      </TableCell>
      <TableCell>
        {student.courses.map((course) => (
          <Typography variant="body2" key={course.id} sx={{ mb: 0.5 }}>
            {course.fileNumber ?? "—"}
          </Typography>
        ))}
      </TableCell>
    </TableRow>
  );

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
        }}
        spacing={2}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{ fontWeight: 800, fontSize: { xs: 21, md: 26 } }}
          >
            {config.title}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            {config.description}
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          disabled={fetching}
          onClick={() => setReloadKey((value) => value + 1)}
          sx={{ textTransform: "none" }}
        >
          Tải lại
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Stack
              component="form"
              onSubmit={submitSearch}
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
            >
              <TextField
                size="small"
                label={
                  section === "students"
                    ? "Tên, mã đăng ký, CCCD"
                    : "Tìm theo mã hoặc tên"
                }
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                sx={{ flex: 1, minWidth: 0 }}
              />

              {section !== "schools" && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Trường đào tạo</InputLabel>
                  <Select
                    label="Trường đào tạo"
                    value={schoolId}
                    onChange={(event) => {
                      setSchoolId(Number(event.target.value));
                      setCourseId(0);
                      setPage(1);
                    }}
                  >
                    <MenuItem value={0}>Tất cả trường</MenuItem>
                    {schools.map((school) => (
                      <MenuItem key={school.id} value={school.id}>
                        {school.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {section === "students" && (
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Khóa học</InputLabel>
                  <Select
                    label="Khóa học"
                    value={
                      courseId && !courses.some((c) => c.id === courseId)
                        ? ""
                        : courseId
                    }
                    onChange={(event) => {
                      setCourseId(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <MenuItem value={0}>Tất cả khóa</MenuItem>
                    {courses.map((course) => (
                      <MenuItem key={course.id} value={course.id}>
                        {course.code}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              <Button
                type="submit"
                variant="contained"
                startIcon={<SearchOutlined />}
                sx={{ textTransform: "none", px: 3 }}
              >
                Tìm kiếm
              </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Tổng cộng: <strong>{count.toLocaleString("vi-VN")}</strong>{" "}
              {section === "schools"
                ? "trường"
                : section === "courses"
                ? "khóa học"
                : "học viên"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
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
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={{ minWidth: 850 }} size="small">
                <TableHead>
                  {section === "schools" && (
                    <TableRow>
                      {[
                        "Mã trường",
                        "Tên trường",
                        "Địa phương",
                        "Số khóa",
                        "Ghi danh",
                        "Thao tác",
                      ].map((label, index) => (
                        <TableCell
                          key={label}
                          align={index >= 3 ? "right" : "left"}
                          sx={{ fontWeight: 700 }}
                        >
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}

                  {section === "courses" && (
                    <TableRow>
                      {[
                        "Mã khóa",
                        "Tên khóa",
                        "Trường đào tạo",
                        "Hạng GPLX",
                        "Khai giảng",
                        "Học viên",
                        "Thao tác",
                      ].map((label, index) => (
                        <TableCell
                          key={label}
                          align={index >= 5 ? "right" : "left"}
                          sx={{ fontWeight: 700 }}
                        >
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}

                  {section === "students" && (
                    <TableRow>
                      {[
                        "Ảnh",
                        "Mã đăng ký",
                        "Họ và tên",
                        "Ngày sinh",
                        "CCCD/CMND",
                        "Khóa học",
                        "Số hồ sơ",
                      ].map((label) => (
                        <TableCell key={label} sx={{ fontWeight: 700 }}>
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableHead>

                <TableBody>
                  {rows.map((item) => {
                    if (section === "schools") {
                      return renderSchool(item as TrainingSchool);
                    }
                    if (section === "courses") {
                      return renderCourse(item as Course);
                    }
                    return renderStudent(item as Student);
                  })}

                  {!rows.length && (
                    <TableRow>
                      <TableCell
                        colSpan={
                          section === "courses"
                            ? 7
                            : section === "students"
                            ? 7
                            : 6
                        }
                        align="center"
                        sx={{ py: 6 }}
                      >
                        {fetching ? (
                          <CircularProgress size={24} />
                        ) : (
                          "Không có dữ liệu phù hợp."
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>

        {result && result.pagination.totalPages > 1 && (
          <Box
            sx={{
              p: 2,
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "center",
              overflowX: "auto",
            }}
          >
            <Pagination
              page={page}
              count={result.pagination.totalPages}
              color="primary"
              size="small"
              onChange={(_, nextPage) => setPage(nextPage)}
            />
          </Box>
        )}
      </Card>
    </Stack>
  );
}
