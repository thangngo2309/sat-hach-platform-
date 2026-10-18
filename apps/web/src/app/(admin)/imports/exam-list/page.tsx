"use client";

import { useRef, useState } from "react";

import {
  CheckCircleOutlineOutlined,
  CloudUploadOutlined,
  DescriptionOutlined,
  FileUploadOutlined,
} from "@mui/icons-material";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
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

import { useAuth } from "@/components/auth/AuthProvider";

import {
  confirmExamList,
  previewExamList,
  type ExamListImportResult,
  type ExamListPreview,
  type ExamCandidateType,
} from "@/lib/exam-list-imports";

const typeLabels: Record<ExamCandidateType, string> = {
  training: "Cơ sở đào tạo",
  independent: "Thí sinh tự do",
  unknown: "Chưa xác định",
};

export default function ImportExamListPage() {
  const { accessToken, user, loading } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExamListPreview | null>(null);
  const [result, setResult] = useState<ExamListImportResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setError("");
  };

  const handlePreview = async () => {
    if (!file || !accessToken) return;

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const data = await previewExamList(file, accessToken);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đọc file XML.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !accessToken || !preview) return;

    setBusy(true);
    setError("");

    try {
      const data = await confirmExamList(file, accessToken);
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import không thành công.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Alert severity="error">
        Bạn không có quyền import danh sách sát hạch.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Import danh sách sát hạch – File 48
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Nhập kỳ sát hạch và danh sách thí sinh đủ điều kiện dự thi.
        </Typography>
      </Box>

      <Alert severity="info">
        Hệ thống có thể tự tạo trung tâm sát hạch, cơ sở đào tạo, khóa học và
        học viên còn thiếu. Tên chưa xác minh sẽ được đánh dấu là dữ liệu tạm.
      </Alert>

      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Stack spacing={3}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              1. Chọn file XML
            </Typography>

            <input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              hidden
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />

            <Paper
              variant="outlined"
              sx={{
                border: "2px dashed #b4c8dd",
                borderRadius: 3,
                bgcolor: "#f8fbff",
                p: { xs: 3, md: 5 },
                textAlign: "center",
              }}
            >
              <Stack sx={{ spacing: 2, alignItems: "center" }}>
                <CloudUploadOutlined sx={{ fontSize: 54, color: "#28669f" }} />

                <Typography sx={{ fontWeight: 700 }}>
                  {file ? file.name : "Chọn file 48_...xml"}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Hỗ trợ XML tối đa 40 MB
                </Typography>

                <Button
                  variant="outlined"
                  startIcon={<DescriptionOutlined />}
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  Chọn file
                </Button>
              </Stack>
            </Paper>

            {file && (
              <Button
                variant="contained"
                startIcon={<FileUploadOutlined />}
                disabled={busy || !accessToken}
                onClick={() => void handlePreview()}
                sx={{ alignSelf: "flex-start" }}
              >
                {busy ? "Đang xử lý..." : "Xem trước dữ liệu"}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {preview && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                2. Kiểm tra danh sách trước khi import
              </Typography>

              {preview.alreadyImported && (
                <Alert severity="warning">
                  File này đã được import. Mã import: {preview.existingImportId}
                </Alert>
              )}

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    lg: "repeat(4, 1fr)",
                  },
                  gap: 2,
                }}
              >
                {[
                  ["Mã kỳ sát hạch", preview.session.code],
                  ["Mã TTSH", preview.session.examinationCenterCode],
                  ["Ngày sát hạch", preview.session.examDate],
                  ["Tổng thí sinh", preview.totalCandidates],
                  ["Học viên CSDT", preview.byType.training],
                  ["Thí sinh tự do", preview.byType.independent],
                  ["Chưa xác định", preview.byType.unknown],
                  ["Số khóa thực có mã", preview.distinctCourses],
                ].map(([label, value]) => (
                  <Paper key={String(label)} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography sx={{ mt: 0.5, fontWeight: 700 }}>
                      {value ?? "—"}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Alert severity="info">
                Các mã CSDT trong file:{" "}
                {preview.schoolCodes.join(", ") || "Không có"}. Những thí sinh
                mang mã 48099 được phân loại là thí sinh tự do.
              </Alert>

              <Divider />

              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ justifyContent: "space-between", spacing: 1 }}
              >
                <Typography sx={{ fontWeight: 700 }}>
                  Danh sách thí sinh
                </Typography>
                <Chip
                  size="small"
                  label={`Xem trước ${preview.candidates.length}/${preview.totalCandidates}`}
                />
              </Stack>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 850 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>SBD</TableCell>
                      <TableCell>Họ và tên</TableCell>
                      <TableCell>Mã đăng ký</TableCell>
                      <TableCell>CSDT</TableCell>
                      <TableCell>Khóa học</TableCell>
                      <TableCell>Hạng</TableCell>
                      <TableCell>Loại thí sinh</TableCell>
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
                        <TableCell>{candidate.schoolCode ?? "—"}</TableCell>
                        <TableCell>
                          {candidate.courseCode ?? "Chưa có mã"}
                        </TableCell>
                        <TableCell>{candidate.licenseClass ?? "—"}</TableCell>
                        <TableCell>
                          {typeLabels[candidate.candidateType]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineOutlined />}
                disabled={busy || preview.alreadyImported}
                onClick={() => void handleConfirm()}
                sx={{ alignSelf: "flex-start" }}
              >
                {busy ? "Đang import..." : "Xác nhận import vào hệ thống"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert severity="success" icon={<CheckCircleOutlineOutlined />}>
          <Typography sx={{ fontWeight: 700 }}>
            Import danh sách sát hạch thành công!
          </Typography>

          <Typography variant="body2" sx={{ mt: 1 }}>
            Kỳ sát hạch: {result.sessionCode}
          </Typography>

          <Typography variant="body2">
            Tổng: {result.totalCandidates} thí sinh. Học viên mới:{" "}
            {result.newStudents}. Học viên liên kết: {result.linkedStudents}.
          </Typography>

          <Typography variant="body2">
            Cơ sở đào tạo mới: {result.newSchools}. Khóa học mới:{" "}
            {result.newCourses}. Hồ sơ dự thi mới: {result.newCandidates}. Hồ sơ
            dự thi cập nhật: {result.updatedCandidates}.
          </Typography>

          <Button
            size="small"
            onClick={() => {
              chooseFile(null);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            sx={{ mt: 1 }}
          >
            Import file khác
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
