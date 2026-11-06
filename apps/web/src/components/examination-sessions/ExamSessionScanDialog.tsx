"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  CloudUploadOutlined,
  DownloadOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import {
  downloadExaminationSessionScan,
  listExaminationSessionScans,
  uploadExaminationSessionScan,
  type ExaminationSessionScan,
} from "@/lib/examination-session-scans";

type Props = {
  open: boolean;
  sessionId: number | null;
  sessionCode: string;
  completed: boolean;
  canUpload: boolean;
  accessToken: string | null;
  onClose: () => void;
};

function displayDate(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function displaySize(value: string) {
  const size = Number(value);

  return Number.isFinite(size) ? `${(size / 1024 / 1024).toFixed(2)} MB` : "—";
}

const MAX_BYTES = 25 * 1024 * 1024;

export function ExamSessionScanDialog({
  open,
  sessionId,
  sessionCode,
  completed,
  canUpload,
  accessToken,
  onClose,
}: Props) {
  const [files, setFiles] = useState<ExaminationSessionScan[]>([]);

  const [selected, setSelected] = useState<File | null>(null);
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    if (!open || !accessToken || !sessionId) return;

    setLoading(true);
    setError("");

    try {
      const data = await listExaminationSessionScans(accessToken, sessionId);

      setFiles(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được hồ sơ scan."
      );
    } finally {
      setLoading(false);
    }
  }, [open, accessToken, sessionId, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setNote("");
      setError("");
      setSuccess("");
      setFiles([]);
    }
  }, [open]);

  function selectFile(file: File | undefined) {
    setError("");
    setSuccess("");

    if (!file) {
      setSelected(null);
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop();

    if (!["pdf", "jpg", "jpeg", "png"].includes(extension ?? "")) {
      setSelected(null);
      setError("Chỉ hỗ trợ PDF, JPG, JPEG hoặc PNG.");
      return;
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      setSelected(null);
      setError("Dung lượng file tối đa 25 MB.");
      return;
    }

    setSelected(file);
  }

  async function upload() {
    if (
      !accessToken ||
      !sessionId ||
      !canUpload ||
      !completed ||
      !selected ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await uploadExaminationSessionScan(
        accessToken,
        sessionId,
        selected,
        note
      );

      setSelected(null);
      setNote("");
      setSuccess("Đã upload hồ sơ scan thành công.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể upload file scan."
      );
    } finally {
      setSaving(false);
    }
  }

  async function download(file: ExaminationSessionScan) {
    if (!accessToken || !sessionId) return;

    setDownloadingId(file.id);
    setError("");

    try {
      await downloadExaminationSessionScan(
        accessToken,
        sessionId,
        file.id,
        file.originalName
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải file scan.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle component="div">
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Hồ sơ scan kỳ sát hạch
        </Typography>

        <Typography variant="body2" color="text.secondary">
          Kỳ: {sessionCode}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
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

          {canUpload && !completed && (
            <Alert severity="warning">
              PC08 chưa xác nhận kỳ sát hạch đã tổ chức xong. Chưa thể upload
              file scan.
            </Alert>
          )}

          {canUpload && completed && (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Stack spacing={2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Upload hồ sơ mới
                </Typography>

                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<CloudUploadOutlined />}
                  disabled={saving}
                  sx={{
                    justifyContent: "flex-start",
                    py: 1.5,
                  }}
                >
                  {selected ? selected.name : "Chọn file PDF, JPG hoặc PNG"}

                  <input
                    key={selected?.name ?? "empty"}
                    type="file"
                    hidden
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(event) => {
                      selectFile(event.currentTarget.files?.[0]);
                    }}
                  />
                </Button>

                {selected && (
                  <Typography variant="caption" color="text.secondary">
                    {displaySize(String(selected.size))}
                    {" · "}
                    Giới hạn 25 MB/file
                  </Typography>
                )}

                <TextField
                  label="Ghi chú hồ sơ"
                  multiline
                  minRows={2}
                  fullWidth
                  size="small"
                  value={note}
                  disabled={saving}
                  onChange={(event) => setNote(event.target.value)}
                  slotProps={{
                    htmlInput: { maxLength: 2000 },
                  }}
                />

                <Box>
                  <Button
                    variant="contained"
                    startIcon={
                      saving ? (
                        <CircularProgress size={16} />
                      ) : (
                        <CloudUploadOutlined />
                      )
                    }
                    disabled={saving || !selected}
                    onClick={() => void upload()}
                  >
                    {saving ? "Đang upload..." : "Upload file scan"}
                  </Button>
                </Box>
              </Stack>
            </Box>
          )}

          <Divider />

          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Danh sách hồ sơ đã upload ({files.length})
            </Typography>

            <Button
              size="small"
              startIcon={<RefreshOutlined />}
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Tải lại
            </Button>
          </Stack>

          {loading && (
            <Box sx={{ py: 3, textAlign: "center" }}>
              <CircularProgress size={24} />
            </Box>
          )}

          {!loading && !files.length && (
            <Alert severity="info">Kỳ sát hạch chưa có hồ sơ scan.</Alert>
          )}

          {!loading &&
            files.map((file) => (
              <Box
                key={file.id}
                sx={{
                  p: 1.5,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
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
                    justifyContent: "space-between",
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {file.originalName}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {file.uploaderName}
                      {" · "}
                      {displayDate(file.createdAt)}
                      {" · "}
                      {displaySize(file.sizeBytes)}
                    </Typography>

                    {file.note && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        Ghi chú: {file.note}
                      </Typography>
                    )}
                  </Box>

                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={
                      downloadingId === file.id ? (
                        <CircularProgress size={15} />
                      ) : (
                        <DownloadOutlined />
                      )
                    }
                    disabled={downloadingId !== null}
                    onClick={() => void download(file)}
                  >
                    Tải file
                  </Button>
                </Stack>
              </Box>
            ))}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button disabled={saving} onClick={onClose}>
          Đóng
        </Button>
      </DialogActions>
    </Dialog>
  );
}
