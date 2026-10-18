"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import {
  CloudUploadOutlined,
  CheckCircleOutlineOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  confirmExamResult,
  previewExamResult,
  type ExamResultPreview,
  type ExamResultImportResponse,
} from "@/lib/exam-results";

export default function ImportExamResultPage() {
  const { accessToken, user, loading } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExamResultPreview | null>(null);
  const [result, setResult] = useState<ExamResultImportResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const chooseFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setResult(null);
    setError("");
  };

  const previewFile = async () => {
    if (!file || !accessToken) return;

    setBusy(true);
    setError("");

    try {
      setPreview(await previewExamResult(accessToken, file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Không đọc được KQSH.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    if (!file || !accessToken || !preview?.canImport || busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const saved = await confirmExamResult(accessToken, file);

      setResult(saved);
      setPreview(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Không thể import kết quả."
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Alert severity="error">
        Bạn không có quyền import kết quả sát hạch.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Import kết quả sát hạch – KQSH
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Đối chiếu danh sách dự thi và cập nhật kết quả từng thí sinh, từng
          phần thi.
        </Typography>
      </Box>

      <Alert severity="info">
        Hãy import BC1, BC2 và file 48 trước KQSH. File kết quả chỉ cập nhật
        những thí sinh đã có trong đúng kỳ sát hạch.
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              1. Chọn file KQSH
            </Typography>

            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />

            <Paper
              variant="outlined"
              sx={{
                border: "2px dashed #b7cadc",
                bgcolor: "#f8fbff",
                borderRadius: 3,
                p: 4,
                textAlign: "center",
              }}
            >
              <Stack sx={{ spacing: 2, alignItems: "center" }}>
                <CloudUploadOutlined sx={{ fontSize: 54, color: "#28669f" }} />

                <Typography sx={{ fontWeight: 700 }}>
                  {file?.name ?? "KQSH_...xml"}
                </Typography>

                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  Chọn file XML
                </Button>
              </Stack>
            </Paper>

            <Button
              variant="contained"
              disabled={!file || busy}
              onClick={() => void previewFile()}
              sx={{ alignSelf: "flex-start" }}
              startIcon={<VisibilityOutlined />}
            >
              {busy ? "Đang kiểm tra..." : "Xem trước kết quả"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {preview && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                2. Đối chiếu kết quả
              </Typography>

              {preview.alreadyImported && (
                <Alert severity="warning">
                  File này đã được import trước đó.
                </Alert>
              )}

              {!!preview.validation.unmatched.length && (
                <Alert severity="error">
                  Có {preview.validation.unmatched.length} thí sinh chưa tìm
                  thấy trong danh sách dự thi. Ví dụ:{" "}
                  {preview.validation.unmatched.slice(0, 5).join(", ")}
                </Alert>
              )}

              {!!preview.validation.conflicts.length && (
                <Alert severity="error">
                  Có {preview.validation.conflicts.length} hồ sơ bị sai lệch SBD
                  hoặc CCCD. Ví dụ:{" "}
                  {preview.validation.conflicts.slice(0, 3).join("; ")}
                </Alert>
              )}

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr 1fr",
                    md: "repeat(4, 1fr)",
                  },
                  gap: 2,
                }}
              >
                {[
                  ["Mã kỳ thi", preview.sessionCode],
                  ["Tổng thí sinh", preview.totalCandidates],
                  ["Đối chiếu thành công", preview.validation.matched],
                  ["Số phần thi", preview.totalParts],
                  ["Đạt (DA)", preview.byResult.DA ?? 0],
                  ["Không đạt (RO)", preview.byResult.RO ?? 0],
                  [
                    "Chưa rõ kết quả",
                    preview.totalCandidates -
                      (preview.byResult.DA ?? 0) -
                      (preview.byResult.RO ?? 0),
                  ],
                  ["Số thí sinh kỳ thi", preview.validation.expectedCandidates],
                ].map(([label, value]) => (
                  <Paper key={String(label)} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography sx={{ fontWeight: 800, mt: 0.5 }}>
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Typography sx={{ fontWeight: 700 }}>
                Xem trước {preview.candidates.length} thí sinh
              </Typography>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 750 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>SBD</TableCell>
                      <TableCell>Họ tên</TableCell>
                      <TableCell>Mã đăng ký</TableCell>
                      <TableCell>Kết quả</TableCell>
                      <TableCell>Lý thuyết</TableCell>
                      <TableCell>Hình</TableCell>
                      <TableCell>Đường</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.candidates.map((candidate) => (
                      <TableRow key={candidate.registrationCode}>
                        <TableCell>
                          {candidate.examinationNumber ?? "—"}
                        </TableCell>
                        <TableCell>{candidate.fullName}</TableCell>
                        <TableCell>{candidate.registrationCode}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              candidate.resultStatus === "DA"
                                ? "success"
                                : candidate.resultStatus === "RO"
                                ? "error"
                                : "default"
                            }
                            label={
                              candidate.resultStatus === "DA"
                                ? "Đạt"
                                : candidate.resultStatus === "RO"
                                ? "Không đạt"
                                : candidate.resultStatus || "Chưa rõ"
                            }
                          />
                        </TableCell>
                        <TableCell>{candidate.theoryScore ?? "—"}</TableCell>
                        <TableCell>{candidate.practicalScore ?? "—"}</TableCell>
                        <TableCell>{candidate.roadScore ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                color="success"
                variant="contained"
                startIcon={<CheckCircleOutlineOutlined />}
                disabled={!preview.canImport || busy}
                onClick={() => void importFile()}
                sx={{ alignSelf: "flex-start" }}
              >
                Xác nhận import KQSH
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert severity="success">
          <Typography sx={{ fontWeight: 700 }}>
            Đã import kết quả sát hạch thành công!
          </Typography>
          <Typography>
            Kỳ {result.sessionCode}: cập nhật {result.updatedCandidates} thí
            sinh,
            {result.totalParts} bản ghi phần thi.
          </Typography>

          <Button
            component={Link}
            href={`/exams/${encodeURIComponent(result.sessionCode)}`}
            sx={{ mt: 1 }}
          >
            Xem kết quả sát hạch
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
