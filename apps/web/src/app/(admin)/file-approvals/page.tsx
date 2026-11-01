"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
  CheckCircleOutlineOutlined,
  DownloadOutlined,
  RefreshOutlined,
  CancelOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  downloadFileSubmission,
  FILE_TYPE_LABELS,
  getFileImportStates,
  IMPORT_STATUS_LABELS,
  listFileSubmissions,
  reviewFileSubmission,
  STATUS_LABELS,
  type FileSubmission,
  type FileImportState,
  type SubmissionStatus,
} from "@/lib/file-submissions";

type FilterStatus = Exclude<SubmissionStatus, "processing"> | "all";

const IMPORT_FILE_TYPES = new Set(["bc1", "bc2", "exam_48", "exam_result"]);

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function summarizeResult(
  result: Record<string, unknown> | null | undefined
): string {
  if (!result) return "";

  const items: string[] = [];

  const sessionCode = result.sessionCode;
  if (sessionCode) {
    items.push(`Kỳ sát hạch: ${String(sessionCode)}`);
  }

  const numericLabels: Array<[string, string]> = [
    ["totalStudents", "Học viên"],
    ["totalCandidates", "Thí sinh"],
    ["newStudents", "HV mới"],
    ["newCandidates", "TS mới"],
    ["updatedCandidates", "TS cập nhật"],
    ["newEnrollments", "Ghi danh mới"],
  ];

  for (const [key, label] of numericLabels) {
    const value = result[key];

    if (typeof value === "number") {
      items.push(`${label}: ${value.toLocaleString("vi-VN")}`);
    }
  }

  return items.join(" · ");
}

function importColor(
  status: string
): "success" | "error" | "warning" | "default" {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "processing") return "warning";
  return "default";
}

export default function FileApprovalsPage() {
  const { user, accessToken } = useAuth();

  const [files, setFiles] = useState<FileSubmission[]>([]);

  const [states, setStates] = useState<Record<number, FileImportState>>({});

  const [filter, setFilter] = useState<FilterStatus>("pending");

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  const [rejecting, setRejecting] = useState<FileSubmission | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!accessToken || user?.role !== "super_admin") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const list = await listFileSubmissions(
        accessToken,
        filter === "all" ? undefined : filter
      );

      const allStates: FileImportState[] = [];

      for (let i = 0; i < list.length; i += 100) {
        const ids = list.slice(i, i + 100).map((item) => item.id);

        if (ids.length) {
          const batch = await getFileImportStates(accessToken, ids);

          allStates.push(...batch);
        }
      }

      setFiles(list);
      setStates(Object.fromEntries(allStates.map((item) => [item.id, item])));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được danh sách phê duyệt."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.role, filter, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    file: FileSubmission,
    action: "approve" | "reject",
    reasonText?: string
  ) {
    if (!accessToken || savingId !== null) return;

    setSavingId(file.id);
    setError("");
    setSuccess("");

    try {
      const response = await reviewFileSubmission(
        accessToken,
        file.id,
        action,
        reasonText
      );

      if (response.importStatus === "failed") {
        setError(
          `Hồ sơ #${file.id} xử lý không thành công: ` +
            (response.importError || "Không rõ nguyên nhân.")
        );
      } else if (action === "reject") {
        setSuccess(`Đã từ chối hồ sơ #${file.id}.`);
      } else if (response.importStatus === "completed") {
        setSuccess(`Đã duyệt và import thành công hồ sơ #${file.id}.`);
      } else {
        setSuccess(
          `Đã phê duyệt hồ sơ #${file.id}. ` +
            "File đã được lưu và có thể phân phối; " +
            "chưa cập nhật DB nghiệp vụ."
        );
      }

      setRejecting(null);
      setReason("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xử lý hồ sơ.");
    } finally {
      setSavingId(null);
    }
  }

  async function download(file: FileSubmission) {
    if (!accessToken) return;

    try {
      await downloadFileSubmission(accessToken, file.id, file.originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải file.");
    }
  }

  if (user?.role !== "super_admin") {
    return (
      <Alert severity="error">Chỉ SUPER_ADMIN được phê duyệt hồ sơ.</Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Phê duyệt hồ sơ
        </Typography>

        <Typography color="text.secondary">
          Duyệt BC1, BC2, danh sách dự sát hạch 48_ và kết quả sát hạch KQSH.
        </Typography>
      </Box>

      <Alert severity="info">
        BC1, BC2, file 48_ và KQSH sẽ được import khi duyệt. File kết quả BC2 do
        PC08 gửi hiện được phê duyệt để phân phối cho CSĐT; chưa có chức năng
        import kết quả BC2 này.
      </Alert>

      {error && (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            spacing: 1.5,
            alignItems: {
              xs: "stretch",
              sm: "center",
            },
          }}
        >
          <TextField
            select
            size="small"
            label="Trạng thái phê duyệt"
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterStatus)}
            sx={{ minWidth: 210 }}
          >
            <MenuItem value="pending">Chờ duyệt</MenuItem>
            <MenuItem value="approved">Đã duyệt</MenuItem>
            <MenuItem value="rejected">Từ chối</MenuItem>
            <MenuItem value="all">Tất cả</MenuItem>
          </TextField>

          <Button
            variant="outlined"
            startIcon={<RefreshOutlined />}
            disabled={loading || savingId !== null}
            onClick={() => setReload((value) => value + 1)}
          >
            Tải lại
          </Button>

          {loading && <CircularProgress size={20} />}
        </Stack>
      </Card>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <TableContainer>
          <Table size="small" sx={{ minWidth: 1180 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Loại hồ sơ</TableCell>
                <TableCell>Đơn vị</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Import</TableCell>
                <TableCell>Ngày gửi</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {files.map((item) => {
                const state = states[item.id];
                const importStatus = state?.importStatus ?? item.importStatus;

                const busy = savingId !== null || item.status === "processing";

                const requiresImport = IMPORT_FILE_TYPES.has(item.fileType);

                return (
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
                        #{item.id} · Phiên bản {item.currentVersion}
                      </Typography>
                    </TableCell>

                    <TableCell>{FILE_TYPE_LABELS[item.fileType]}</TableCell>

                    <TableCell>
                      <Typography variant="body2">
                        {item.trainingSchoolName ||
                          item.examinationCenterName ||
                          "—"}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        {item.uploaderName}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[item.status]}
                        color={
                          item.status === "approved"
                            ? "success"
                            : item.status === "rejected"
                            ? "error"
                            : "warning"
                        }
                      />

                      {item.rejectionReason && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ display: "block" }}
                        >
                          {item.rejectionReason}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      {requiresImport ? (
                        <Stack spacing={0.5}>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={importColor(importStatus)}
                            label={IMPORT_STATUS_LABELS[importStatus]}
                          />

                          {state?.importBatchId && (
                            <Typography variant="caption">
                              Batch #{state.importBatchId}
                            </Typography>
                          )}

                          {state?.importError && (
                            <Typography
                              variant="caption"
                              color="error"
                              sx={{
                                maxWidth: 300,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {state.importError}
                            </Typography>
                          )}

                          {state?.importResult && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ maxWidth: 330 }}
                            >
                              {summarizeResult(state.importResult)}
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Chip
                          size="small"
                          variant="outlined"
                          label="Lưu và phân phối file"
                        />
                      )}
                    </TableCell>

                    <TableCell>{formatDate(item.createdAt)}</TableCell>

                    <TableCell align="right">
                      <Stack
                        direction="row"
                        sx={{ spacing: 0.5, justifyContent: "flex-end" }}
                      >
                        <Button
                          size="small"
                          disabled={busy}
                          startIcon={<DownloadOutlined />}
                          onClick={() => void download(item)}
                        >
                          Tải
                        </Button>

                        {item.status === "pending" && (
                          <>
                            <Button
                              size="small"
                              color="success"
                              disabled={busy}
                              startIcon={
                                savingId === item.id ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  <CheckCircleOutlineOutlined />
                                )
                              }
                              onClick={() => void review(item, "approve")}
                            >
                              {savingId === item.id ? "Đang xử lý" : "Duyệt"}
                            </Button>

                            <Button
                              size="small"
                              color="error"
                              disabled={busy}
                              startIcon={<CancelOutlined />}
                              onClick={() => {
                                setRejecting(item);
                                setReason("");
                              }}
                            >
                              Từ chối
                            </Button>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    Không có hồ sơ phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog
        open={Boolean(rejecting)}
        onClose={() => {
          if (savingId === null) setRejecting(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Từ chối hồ sơ #{rejecting?.id}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              {rejecting?.originalName}
            </Typography>

            <TextField
              fullWidth
              multiline
              required
              minRows={3}
              label="Lý do từ chối"
              value={reason}
              disabled={savingId !== null}
              onChange={(event) => setReason(event.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            disabled={savingId !== null}
            onClick={() => setRejecting(null)}
          >
            Hủy
          </Button>

          <Button
            variant="contained"
            color="error"
            disabled={savingId !== null || !reason.trim()}
            onClick={() => {
              if (rejecting) {
                void review(rejecting, "reject", reason);
              }
            }}
          >
            Xác nhận từ chối
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
