"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
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
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  listCourseSummaries,
  type CourseSummary,
  type PageResult,
} from "@/lib/bc2-view";

export default function CoursesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, loading: authLoading } = useAuth();

  const schoolId = Number(searchParams.get("schoolId") || 0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [result, setResult] = useState<PageResult<CourseSummary> | null>(null);

  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;

    setFetching(true);
    setError("");

    try {
      setResult(
        await listCourseSummaries(accessToken, {
          page,
          limit: 20,
          search,
          schoolId: schoolId || undefined,
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được khóa học.");
    } finally {
      setFetching(false);
    }
  }, [accessToken, page, search, schoolId, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  if (authLoading) {
    return (
      <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
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
          gap: 2,
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
        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          disabled={fetching}
          onClick={() => setReload((v) => v + 1)}
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
            direction: { xs: "column", sm: "row" },
            gap: 2,
          }}
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <TextField
            label="Tìm mã khóa, tên khóa, trường"
            size="small"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flex: 1 }}
          />
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
          Tổng số khóa: {result?.pagination.total ?? 0}
          {schoolId > 0 ? " · Đang lọc theo trường đào tạo" : ""}
        </Typography>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        {fetching && !result ? (
          <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Mã khóa</TableCell>
                  <TableCell>Tên khóa</TableCell>
                  <TableCell>Trường đào tạo</TableCell>
                  <TableCell>Hạng GPLX</TableCell>
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
                        sx={{ textTransform: "none" }}
                      >
                        Học viên
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!fetching && !result?.data.length && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      Chưa có khóa học phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {(result?.pagination.totalPages ?? 0) > 1 && (
          <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
            <Pagination
              page={page}
              count={result!.pagination.totalPages}
              onChange={(_, value) => setPage(value)}
              color="primary"
            />
          </Box>
        )}
      </Card>
    </Stack>
  );
}
