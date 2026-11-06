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
  FactCheckOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  downloadPc08FinalResult,
  formatPc08ResultDate,
  formatPc08ResultSize,
  listPc08ReceivedFinalResults,
  type Pc08ReceivedFinalResult,
} from "@/lib/pc08-final-results";

export function Pc08FinalResultsReceivedPanel() {
  const { user, accessToken } = useAuth();

  const authorized = user?.role === "training_school";

  const [files, setFiles] = useState<Pc08ReceivedFinalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    if (!authorized || !accessToken) {
      setFiles([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await listPc08ReceivedFinalResults(accessToken);

      setFiles(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được KQSH cuối cùng."
      );
    } finally {
      setLoading(false);
    }
  }, [authorized, accessToken, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return files;

    return files.filter((file) =>
      [file.originalName, file.sessionCode, String(file.id)]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [files, search]);

  async function download(file: Pc08ReceivedFinalResult) {
    if (!accessToken || downloadingId !== null) return;

    setDownloadingId(file.id);
    setError("");

    try {
      await downloadPc08FinalResult(accessToken, file.id, file.originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải KQSH.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (!authorized) return null;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
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
            <FactCheckOutlined color="success" sx={{ fontSize: 30 }} />

            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                KQSH chính thức nhận từ PC08
              </Typography>

              <Typography variant="body2" color="text.secondary">
                File kết quả cuối cùng đã được SUPER_ADMIN phê duyệt và phát
                hành cho cơ sở đào tạo.
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
          direction={{ xs: "column", sm: "row" }}
          sx={{
            mt: 2.5,
            spacing: 1.5,
            alignItems: {
              xs: "stretch",
              sm: "center",
            },
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm mã kỳ sát hạch hoặc tên file..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <Chip
            color="success"
            variant="outlined"
            label={`${filtered.length} file`}
          />
        </Stack>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mx: 2, mb: 2 }}
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}

      <TableContainer>
        <Table size="small" sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow>
              <TableCell>File KQSH</TableCell>
              <TableCell>Kỳ sát hạch</TableCell>
              <TableCell>Ngày phát hành</TableCell>
              <TableCell>Dung lượng</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {!loading &&
              filtered.map((file) => (
                <TableRow key={file.id} hover>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {file.originalName}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      Hồ sơ #{file.id}
                    </Typography>
                  </TableCell>

                  <TableCell>{file.sessionCode}</TableCell>

                  <TableCell>
                    {formatPc08ResultDate(file.publishedAt)}
                  </TableCell>

                  <TableCell>{formatPc08ResultSize(file.sizeBytes)}</TableCell>

                  <TableCell>
                    <Chip size="small" color="success" label="Đã phát hành" />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={
                        downloadingId === file.id ? (
                          <CircularProgress size={14} />
                        ) : (
                          <DownloadOutlined />
                        )
                      }
                      disabled={downloadingId !== null}
                      onClick={() => void download(file)}
                    >
                      Tải KQSH
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                  <Typography color="text.secondary">
                    {search
                      ? "Không tìm thấy KQSH phù hợp."
                      : "Chưa có KQSH chính thức được phát hành cho cơ sở đào tạo."}
                  </Typography>
                </TableCell>
              </TableRow>
            )}

            {loading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
