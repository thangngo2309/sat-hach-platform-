"use client";

import { useRef, useState } from "react";

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

import {
  CheckCircleOutlineOutlined,
  CloudUploadOutlined,
  DescriptionOutlined,
  FileUploadOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  confirmBc1,
  previewBc1,
  type Bc1ImportResult,
  type Bc1Preview,
} from "@/lib/imports";

export default function Bc1ImportPage() {
  const { accessToken, user, loading } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Bc1Preview | null>(null);
  const [result, setResult] = useState<Bc1ImportResult | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const chooseFile = (selected: File | null) => {
    setError("");
    setPreview(null);
    setResult(null);
    setFile(selected);
  };

  const handlePreview = async () => {
    if (!file || !accessToken) return;

    setBusy(true);
    setError("");

    try {
      setPreview(await previewBc1(file, accessToken));
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
      const imported = await confirmBc1(file, accessToken);

      setResult(imported);
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
        Bạn không có quyền thực hiện import dữ liệu.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Import danh sách học viên
        </Typography>

        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Nhập dữ liệu trường đào tạo, khóa học và học viên từ báo cáo BC1.
        </Typography>
      </Box>

      <Alert severity="info">
        Hiện tại chỉ hỗ trợ XML có cấu trúc BAO_CAO1. Dữ liệu sẽ chỉ được lưu
        sau khi bạn kiểm tra và xác nhận.
      </Alert>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
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
              <Stack spacing={2} sx={{ alignItems: "center" }}>
                <CloudUploadOutlined sx={{ fontSize: 54, color: "#28669f" }} />

                <Typography sx={{ fontWeight: 700 }}>
                  {file ? file.name : "Chọn báo cáo BC1"}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  File XML, dung lượng tối đa 30 MB
                </Typography>

                <Button
                  variant="outlined"
                  startIcon={<DescriptionOutlined />}
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  sx={{ textTransform: "none" }}
                >
                  Chọn file
                </Button>
              </Stack>
            </Paper>

            {file && (
              <Button
                variant="contained"
                startIcon={
                  busy ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <FileUploadOutlined />
                  )
                }
                disabled={busy || !accessToken}
                onClick={() => void handlePreview()}
                sx={{ alignSelf: "flex-start", textTransform: "none" }}
              >
                Kiểm tra và xem trước
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {preview && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                2. Xem trước dữ liệu
              </Typography>

              {preview.alreadyImported && (
                <Alert severity="warning">
                  File này đã được import trước đó (mã lượt import:{" "}
                  {preview.existingImportId}).
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
                  ["Mã trường", preview.school.code],
                  ["Trường đào tạo", preview.school.name],
                  ["Mã khóa học", preview.course.code],
                  ["Tên khóa học", preview.course.name],
                  ["Hạng GPLX", preview.course.licenseClass ?? "—"],
                  ["Mã báo cáo BC1", preview.reportCode ?? "—"],
                  ["Tổng học viên", preview.totalStudents],
                  ["Dung lượng", `${(preview.fileSize / 1024).toFixed(1)} KB`],
                ].map(([label, value]) => (
                  <Paper
                    key={String(label)}
                    variant="outlined"
                    sx={{ p: 2, borderRadius: 2 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.5,
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Divider />

              <Stack
                sx={{ justifyContent: "space-between" }}
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
              >
                <Typography sx={{ fontWeight: 700 }}>
                  Danh sách học viên
                </Typography>

                <Chip
                  size="small"
                  label={`Hiển thị tối đa ${preview.previewLimit} học viên`}
                />
              </Stack>

              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 750 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>STT</TableCell>
                      <TableCell>Mã đăng ký</TableCell>
                      <TableCell>Họ và tên</TableCell>
                      <TableCell>Ngày sinh</TableCell>
                      <TableCell>CCCD/CMND</TableCell>
                      <TableCell>Số hồ sơ</TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {preview.students.map((student, index) => (
                      <TableRow key={student.registrationCode}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{student.registrationCode}</TableCell>
                        <TableCell>{student.fullName}</TableCell>
                        <TableCell>{student.dateOfBirth ?? "—"}</TableCell>
                        <TableCell>{student.identityNumber ?? "—"}</TableCell>
                        <TableCell>{student.fileNumber ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button
                variant="contained"
                color="success"
                startIcon={
                  busy ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <CheckCircleOutlineOutlined />
                  )
                }
                disabled={busy || preview.alreadyImported}
                onClick={() => void handleConfirm()}
                sx={{
                  alignSelf: "flex-start",
                  textTransform: "none",
                }}
              >
                Xác nhận import vào hệ thống
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert severity="success" icon={<CheckCircleOutlineOutlined />}>
          <Typography sx={{ fontWeight: 700 }}>
            Import BC1 thành công!
          </Typography>

          <Typography variant="body2">
            Tổng số: {result.totalStudents} học viên. Học viên mới:{" "}
            {result.newStudents}. Liên kết khóa học mới: {result.newEnrollments}
            . Liên kết đã có: {result.skippedEnrollments}.
          </Typography>

          <Button
            size="small"
            startIcon={<RefreshOutlined />}
            onClick={() => {
              chooseFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            sx={{ mt: 1, textTransform: "none" }}
          >
            Import file khác
          </Button>
        </Alert>
      )}
    </Stack>
  );
}
