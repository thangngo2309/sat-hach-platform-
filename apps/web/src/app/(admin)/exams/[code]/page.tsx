"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Box,
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

import {
  getExamResults,
  type ExamResultsPage,
  type ExamResultCandidate,
} from "@/lib/exam-results";

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

function CandidateRow({ item }: { item: ExamResultCandidate }) {
  const [expanded, setExpanded] = useState(false);

  const hasAbsentPart =
    item.hasAbsentPart === true ||
    item.resultStatus === "VA" ||
    item.parts.some((part) => part.resultStatus === "VA");

  return (
    <>
      <TableRow
        hover
        sx={
          hasAbsentPart
            ? {
                bgcolor: "rgba(237, 108, 2, 0.035)",
              }
            : undefined
        }
      >
        <TableCell>
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

        <TableCell>{item.examinationNumber ?? "—"}</TableCell>

        <TableCell>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "center",
              minWidth: 190,
            }}
          >
            <StudentAvatar
              studentId={item.studentId}
              fullName={item.fullName}
              size={44}
            />

            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  overflowWrap: "anywhere",
                }}
              >
                {item.fullName}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {item.registrationCode}
              </Typography>

              {hasAbsentPart && (
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

            {hasAbsentPart && item.resultStatus !== "VA" && (
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
                bgcolor: "#f8fafc",
              }}
            >
              <Typography
                sx={{
                  fontWeight: 700,
                  mb: 1,
                }}
              >
                Chi tiết các phần thi
              </Typography>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                CCCD: {item.identityNumber ?? "—"}
                {" · "}
                Khóa học: {item.courseCode ?? "—"}
                {" · "}
                Mã CSDT: {item.schoolCode ?? "—"}
              </Typography>

              {hasAbsentPart && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Thí sinh có ít nhất một phần thi được ghi nhận trạng thái vắng
                  (VA). Vui lòng kiểm tra các phần thi bên dưới.
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
                    {item.parts.map((part) => (
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

                        <TableCell>{part.examDate ?? "—"}</TableCell>

                        <TableCell>{part.score ?? "—"}</TableCell>

                        <TableCell>{part.maximumScore ?? "—"}</TableCell>

                        <TableCell>
                          <ResultChip status={part.resultStatus} />
                        </TableCell>
                      </TableRow>
                    ))}

                    {!item.parts.length && (
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

export default function ExamDetailPage() {
  const params = useParams<{
    code: string;
  }>();

  const code = params.code;

  const { accessToken } = useAuth();

  const [result, setResult] = useState<ExamResultsPage | null>(null);

  const [page, setPage] = useState(1);

  const [searchInput, setSearchInput] = useState("");

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState("");

  const [candidateType, setCandidateType] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken || !code) return;

    setLoading(true);
    setError("");

    try {
      const response = await getExamResults(accessToken, code, {
        page,
        limit: 20,
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
    void load();
  }, [load]);

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

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Kết quả kỳ sát hạch {code}
        </Typography>

        <Typography color="text.secondary">
          {result?.session.centerName ||
            result?.session.centerCode ||
            "Trung tâm sát hạch"}
          {" · "}
          {result?.session.examDate ?? "Chưa có ngày thi"}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

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
          <Card variant="outlined" key={stat.label}>
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
                {stat.value.toLocaleString("vi-VN")}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        Số thí sinh vắng được tính theo mã VA ở kết quả tổng hoặc từng phần thi.
        Chỉ tiêu Vắng có thể trùng với nhóm Không đạt và không cộng thêm vào
        tổng thí sinh.
      </Typography>

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{
              xs: "column",
              md: "row",
            }}
            spacing={2}
          >
            <TextField
              size="small"
              label="Tên, CCCD, SBD, mã đăng ký"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSearch(searchInput.trim());
                }
              }}
              sx={{ flex: 1 }}
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

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Kết quả</InputLabel>

              <Select
                label="Kết quả"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">Tất cả</MenuItem>

                <MenuItem value="DA">Đạt</MenuItem>

                <MenuItem value="RO">Không đạt</MenuItem>

                <MenuItem value="VA">Vắng</MenuItem>

                <MenuItem value="PENDING">Chưa có kết quả</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Loại thí sinh</InputLabel>

              <Select
                label="Loại thí sinh"
                value={candidateType}
                onChange={(e) => {
                  setCandidateType(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">Tất cả</MenuItem>

                <MenuItem value="training">Học viên CSDT</MenuItem>

                <MenuItem value="independent">Thí sinh tự do</MenuItem>

                <MenuItem value="unknown">Chưa xác định</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography
            sx={{
              fontWeight: 700,
              mb: 2,
            }}
          >
            Danh sách kết quả ({result?.pagination.total ?? 0})
          </Typography>

          {loading && (
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

          <TableContainer>
            <Table sx={{ minWidth: 1000 }}>
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
                {result?.data.map((item) => (
                  <CandidateRow item={item} key={item.id} />
                ))}

                {!loading && !result?.data.length && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      Không có kết quả phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {(result?.pagination.totalPages ?? 0) > 1 && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "flex-end",
                mt: 3,
              }}
            >
              <Pagination
                page={page}
                count={result?.pagination.totalPages ?? 1}
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
