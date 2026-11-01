"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
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
  DownloadOutlined,
  FileDownloadOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  downloadReceivedFile,
  listReceivedFiles,
  type ReceivedFile,
} from "@/lib/received-files";

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function formatSize(value: string): string {
  const size = Number(value);

  if (!Number.isFinite(size)) return "—";

  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function ReceivedFilesPanel() {
  const { user, accessToken } = useAuth();

  const [rows, setRows] = useState<ReceivedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  const authorized =
    user?.role === "training_school" || user?.role === "exam_center";

  const title =
    user?.role === "training_school"
      ? "Kết quả BC2 nhận từ PC08"
      : "File dự sát hạch 48_ nhận từ PC08";

  const description =
    user?.role === "training_school"
      ? "Các file kết quả BC2 đã được SUPER_ADMIN duyệt và gửi đến cơ sở đào tạo của bạn."
      : "Các file dự sát hạch đã được SUPER_ADMIN duyệt và gửi đến trung tâm sát hạch của bạn.";

  const load = useCallback(async () => {
    if (!accessToken || !authorized) return;

    setLoading(true);
    setError("");

    try {
      const data = await listReceivedFiles(accessToken);

      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được danh sách file nhận."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, authorized, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return rows;

    return rows.filter((item) => {
      return [
        item.originalName,
        item.uploaderName,
        item.trainingSchoolName,
        item.examinationCenterName,
        item.note,
        String(item.id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [rows, search]);

  async function download(item: ReceivedFile) {
    if (!accessToken || downloadingId !== null) return;

    setDownloadingId(item.id);
    setError("");

    try {
      await downloadReceivedFile(accessToken, item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải file.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (!authorized) return null;

  return (
    <Stack spacing={2}>
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            sx={{
              spacing: 2,
              alignItems: {
                xs: "stretch",
                sm: "center",
              },
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" sx={{ spacing: 1.5, alignItems: "center" }}>
              <FileDownloadOutlined color="primary" sx={{ fontSize: 30 }} />

              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {title}
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  {description}
                </Typography>
              </Box>
            </Stack>

            <Button
              variant="outlined"
              startIcon={
                loading ? <CircularProgress size={16} /> : <RefreshOutlined />
              }
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Tải lại
            </Button>
          </Stack>

          <Stack
            direction={{
              xs: "column",
              sm: "row",
            }}
            spacing={1.5}
            sx={{ mt: 2.5 }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm tên file, người gửi hoặc mã hồ sơ..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <Chip
              color="success"
              variant="outlined"
              label={`${filteredRows.length} file`}
              sx={{ alignSelf: "center" }}
            />
          </Stack>
        </Box>

        {error && (
          <Alert
            severity="error"
            onClose={() => setError("")}
            sx={{ mx: 2, mb: 2 }}
          >
            {error}
          </Alert>
        )}

        <TableContainer>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Người gửi</TableCell>
                <TableCell>Ngày duyệt</TableCell>
                <TableCell>Dung lượng</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {filteredRows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.originalName}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Hồ sơ #{item.id} · Phiên bản {item.currentVersion}
                    </Typography>

                    {item.note && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        Ghi chú: {item.note}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell>{item.uploaderName}</TableCell>

                  <TableCell>{formatDate(item.reviewedAt)}</TableCell>

                  <TableCell>{formatSize(item.sizeBytes)}</TableCell>

                  <TableCell>
                    <Chip size="small" color="success" label="Đã phê duyệt" />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        downloadingId === item.id ? (
                          <CircularProgress size={14} />
                        ) : (
                          <DownloadOutlined />
                        )
                      }
                      disabled={downloadingId !== null}
                      onClick={() => void download(item)}
                    >
                      Tải file
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {search
                        ? "Không tìm thấy file phù hợp."
                        : "Chưa có file được PC08 gửi và phê duyệt."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={25} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}
