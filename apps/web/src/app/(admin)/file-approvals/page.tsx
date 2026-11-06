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
  CancelOutlined,
  CheckCircleOutlineOutlined,
  DownloadOutlined,
  RefreshOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import { describeMetadata } from "@/lib/file-document-metadata";

import {
  downloadFileSubmission,
  FILE_TYPE_LABELS,
  getFileImportStates,
  IMPORT_STATUS_LABELS,
  listFileSubmissions,
  reviewFileSubmission,
  STATUS_LABELS,
  type FileImportState,
  type FileSubmission,
  type SubmissionStatus,
} from "@/lib/file-submissions";
import { Exam48ApprovalDialog } from "@/components/file-submissions/Exam48ApprovalDialog";

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

  if (result.sessionCode) {
    items.push(`Kỳ sát hạch: ${String(result.sessionCode)}`);
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

  const [viewing, setViewing] = useState<FileSubmission | null>(null);

  const [exam48Target, setExam48Target] = useState<FileSubmission | null>(null);

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

      for (let index = 0; index < list.length; index += 100) {
        const ids = list.slice(index, index + 100).map((item) => item.id);

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
    reasonText?: string,
    selectedFileIds?: number[]
  ) {
    if (!accessToken || savingId !== null) return;

    // Không cho file 48_ đi qua luồng duyệt thường.
    if (
      file.fileType === "exam_48" &&
      action === "approve" &&
      selectedFileIds === undefined
    ) {
      setExam48Target(file);
      setViewing(null);
      return;
    }

    setSavingId(file.id);
    setError("");
    setSuccess("");

    try {
      const response = await reviewFileSubmission(
        accessToken,
        file.id,
        action,
        reasonText,
        selectedFileIds
      );

      if (response.importStatus === "failed") {
        throw new Error(
          response.importError || `Hồ sơ #${file.id} import không thành công.`
        );
      }

      if (action === "reject") {
        setSuccess(`Đã từ chối hồ sơ #${file.id}.`);
      } else if (file.fileType === "exam_48") {
        setSuccess(
          `Đã duyệt file 48_ #${file.id}, ` +
            "tạo kỳ sát hạch và liên kết hồ sơ thành công."
        );
      } else if (response.importStatus === "completed") {
        setSuccess(`Đã duyệt và import hồ sơ #${file.id}.`);
      } else {
        setSuccess(`Đã phê duyệt hồ sơ #${file.id}.`);
      }

      setExam48Target(null);
      setRejecting(null);
      setViewing(null);
      setReason("");

      setReload((value) => value + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể xử lý hồ sơ.";

      setError(message);
      throw err;
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
          Kiểm tra thông tin khai báo, duyệt BC1, BC2, danh sách dự sát hạch 48_
          và KQSH.
        </Typography>
      </Box>

      <Alert severity="info">
        BC1, BC2, file 48_ và KQSH được xử lý import khi duyệt theo nghiệp vụ
        hiện tại. File kết quả BC2 từ PC08 chỉ được duyệt để phân phối, chưa
        import dữ liệu chính.
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
          direction={{
            xs: "column",
            sm: "row",
          }}
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
          <Table size="small" sx={{ minWidth: 1250 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Loại hồ sơ</TableCell>
                <TableCell>Đơn vị</TableCell>
                <TableCell>Thông tin khai báo</TableCell>
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

                const metadataLines = describeMetadata(
                  item.fileType,
                  item.documentMetadata
                );

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

                      <Typography variant="caption" color="text.secondary">
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
                      {metadataLines.length ? (
                        <Stack spacing={0.5}>
                          {metadataLines.slice(0, 2).map((line, index) => (
                            <Typography
                              key={index}
                              variant="caption"
                              sx={{
                                display: "block",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {line}
                            </Typography>
                          ))}

                          {metadataLines.length > 2 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              +{metadataLines.length - 2} thông tin
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Chưa khai báo
                        </Typography>
                      )}
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
                            label={
                              IMPORT_STATUS_LABELS[
                                importStatus as keyof typeof IMPORT_STATUS_LABELS
                              ] ?? importStatus
                            }
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
                          startIcon={<VisibilityOutlined />}
                          onClick={() => setViewing(item)}
                        >
                          Thông tin
                        </Button>

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
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    Không có hồ sơ phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog
        open={viewing !== null}
        onClose={() => setViewing(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Thông tin hồ sơ #{viewing?.id}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {viewing && (
            <Stack spacing={2}>
              <Typography sx={{ fontWeight: 700 }}>
                {viewing.originalName}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {FILE_TYPE_LABELS[viewing.fileType]}
                {" · "}
                Phiên bản {viewing.currentVersion}
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Người gửi: {viewing.uploaderName}
              </Typography>

              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Thông tin người gửi khai báo
              </Typography>

              {describeMetadata(viewing.fileType, viewing.documentMetadata)
                .length ? (
                <Stack spacing={1}>
                  {describeMetadata(
                    viewing.fileType,
                    viewing.documentMetadata
                  ).map((line, index) => (
                    <Typography key={index} variant="body2">
                      {line}
                    </Typography>
                  ))}
                </Stack>
              ) : (
                <Alert severity="info">
                  File này chưa có thông tin nghiệp vụ khai báo bổ sung.
                </Alert>
              )}

              {viewing.note && (
                <Typography variant="body2">Ghi chú: {viewing.note}</Typography>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setViewing(null)}>Đóng</Button>

          {viewing && viewing.status === "pending" && (
            <Button
              variant="contained"
              disabled={savingId !== null}
              onClick={() => void review(viewing, "approve")}
            >
              Phê duyệt
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={rejecting !== null}
        onClose={() => {
          if (savingId === null) {
            setRejecting(null);
          }
        }}
        fullWidth
        maxWidth="sm"
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

      <Exam48ApprovalDialog
        open={exam48Target !== null}
        file={exam48Target}
        accessToken={accessToken}
        saving={savingId !== null}
        onClose={() => {
          if (savingId === null) {
            setExam48Target(null);
          }
        }}
        onConfirm={async (selectedFileIds) => {
          if (!exam48Target) return;

          await review(exam48Target, "approve", undefined, selectedFileIds);
        }}
      />
    </Stack>
  );
}
