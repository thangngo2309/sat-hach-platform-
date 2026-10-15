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
  ArrowBackOutlined,
  CheckCircleOutlineOutlined,
  CloudUploadOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  confirmBc2,
  previewBc2,
  type Bc2Preview,
  type Bc2Result,
} from "@/lib/bc2-imports";

export default function Bc2ImportPage() {
  const { accessToken, user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Bc2Preview | null>(null);
  const [result, setResult] = useState<Bc2Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const chooseFile = (next: File | null) => {
    setFile(next);
    setPreview(null);
    setResult(null);
    setError("");
  };

  const handlePreview = async () => {
    if (!file || !accessToken) return;

    setBusy(true);
    setError("");

    try {
      setPreview(await previewBc2(file, accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể đọc BC2.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !preview || !accessToken) return;

    setBusy(true);
    setError("");

    try {
      const response = await confirmBc2(file, accessToken);
      setResult(response);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import thất bại.");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return <Alert severity="error">Bạn không có quyền import BC2.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
        spacing={2}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Import báo cáo BC2
          </Typography>
          <Typography color="text.secondary">
            Nhập danh sách thí sinh đề nghị sát hạch từ XML BAO_CAO2.
          </Typography>
        </Box>

        <Button
          component={Link}
          href="/imports"
          startIcon={<ArrowBackOutlined />}
          variant="outlined"
          sx={{ textTransform: "none" }}
        >
          Về Import BC1
        </Button>
      </Stack>

      <Alert severity="info">
        BC2 có thể import trước BC1. Nếu chưa có BC1 phù hợp, hệ thống vẫn lưu
        báo cáo và các thí sinh, không tự ghép vào khóa học chưa xác định.
      </Alert>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 4 } }}>
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              1. Chọn báo cáo XML
            </Typography>

            <input
              ref={inputRef}
              hidden
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />

            <Paper
              variant="outlined"
              sx={{
                p: 3,
                width: "100%",
                textAlign: "center",
                borderStyle: "dashed",
                borderRadius: 3,
              }}
            >
              <Stack sx={{ alignItems: "center", spacing: 1.5 }}>
                <CloudUploadOutlined sx={{ fontSize: 50, color: "#27669e" }} />
                <Typography sx={{ fontWeight: 700 }}>
                  {file?.name ?? "Chưa chọn file XML"}
                </Typography>
                <Button
                  variant="outlined"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  sx={{ textTransform: "none" }}
                >
                  Chọn file BC2
                </Button>
              </Stack>
            </Paper>

            <Button
              variant="contained"
              startIcon={<VisibilityOutlined />}
              disabled={!file || busy || !accessToken}
              onClick={() => void handlePreview()}
              sx={{ textTransform: "none" }}
            >
              {busy ? "Đang xử lý..." : "Kiểm tra và xem trước"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {preview && (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={3}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                2. Kiểm tra báo cáo và thí sinh
              </Typography>

              {preview.alreadyImported && (
                <Alert severity="warning">
                  File đã được import với mã lượt #{preview.existingImportId}.
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
                  ["Mã BC2", preview.report.bc2Code],
                  ["Mã BC1 tham chiếu", preview.report.bc1Code ?? "—"],
                  ["Mã trường", preview.report.schoolCode],
                  ["Số thí sinh", preview.totalCandidates],
                  ["Đã có hồ sơ", preview.existingStudents],
                  ["Hồ sơ mới", preview.newStudents],
                  ["Hạng GPLX", preview.report.licenseClass ?? "—"],
                  ["Số công văn", preview.report.documentNumber ?? "—"],
                ].map(([label, value]) => (
                  <Paper key={String(label)} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography
                      sx={{ fontWeight: 700, overflowWrap: "anywhere" }}
                    >
                      {value}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Alert
                severity={
                  preview.bc1MatchStatus === "matched" ? "success" : "warning"
                }
              >
                {preview.bc1MatchStatus === "matched"
                  ? `Tìm thấy BC1 tham chiếu: ${preview.matchedCourses[0].code}`
                  : preview.bc1MatchStatus === "ambiguous"
                  ? "Có nhiều khóa học trùng mã BC1; cần đối chiếu thủ công."
                  : "Chưa tìm thấy khóa học BC1 tương ứng. BC2 vẫn có thể được lưu."}
              </Alert>

              <TableContainer>
                <Table size="small" sx={{ minWidth: 850 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>STT</TableCell>
                      <TableCell>MA_DK</TableCell>
                      <TableCell>Họ và tên</TableCell>
                      <TableCell>Ngày sinh</TableCell>
                      <TableCell>CCCD</TableCell>
                      <TableCell>Số hồ sơ</TableCell>
                      <TableCell>Hạng đề nghị</TableCell>
                      <TableCell>Trạng thái</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.students.map((student) => (
                      <TableRow key={student.registrationCode}>
                        <TableCell>{student.order}</TableCell>
                        <TableCell>{student.registrationCode}</TableCell>
                        <TableCell>{student.fullName}</TableCell>
                        <TableCell>{student.dateOfBirth ?? "—"}</TableCell>
                        <TableCell>{student.identityNumber ?? "—"}</TableCell>
                        <TableCell>{student.fileNumber ?? "—"}</TableCell>
                        <TableCell>
                          {student.requestedLicenseClass ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={student.alreadyExists ? "Đã có" : "Mới"}
                            color={
                              student.alreadyExists ? "default" : "success"
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {preview.totalCandidates > preview.students.length && (
                <Typography variant="caption" color="text.secondary">
                  Đang hiển thị {preview.students.length} trên tổng số{" "}
                  {preview.totalCandidates} thí sinh.
                </Typography>
              )}

              <Button
                variant="contained"
                color="success"
                startIcon={
                  busy ? (
                    <CircularProgress size={18} />
                  ) : (
                    <CheckCircleOutlineOutlined />
                  )
                }
                disabled={busy || preview.alreadyImported}
                onClick={() => void handleConfirm()}
                sx={{ alignSelf: "flex-start", textTransform: "none" }}
              >
                Xác nhận import BC2
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert severity="success">
          <Typography sx={{ fontWeight: 700 }}>
            Import BC2 thành công – {result.bc2Code}
          </Typography>
          Đã lưu {result.totalCandidates} thí sinh. Tạo mới {result.newStudents}{" "}
          hồ sơ; sử dụng lại {result.existingStudents} hồ sơ đã có.
          <Box sx={{ mt: 1 }}>
            <Button
              component={Link}
              href="/imports/bc2/history"
              size="small"
              sx={{ textTransform: "none" }}
            >
              Xem lịch sử BC2
            </Button>
          </Box>
        </Alert>
      )}
    </Stack>
  );
}
