"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  CloudUploadOutlined,
  DownloadOutlined,
  DescriptionOutlined,
  HistoryOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  downloadStudentScan,
  listStudentScanIntakes,
  listStudentScans,
  uploadStudentScan,
  type StudentScanAttachment,
  type StudentScanIntake,
} from "@/lib/student-scans";

type Props = {
  open: boolean;
  studentId: number | null;
  studentName?: string;
  onClose: () => void;
  onChanged?: () => void;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function formatSize(value: string) {
  return `${(Number(value) / 1024 / 1024).toFixed(2)} MB`;
}

function validateFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !["pdf", "jpg", "jpeg", "png"].includes(extension)) {
    return "Chỉ được upload PDF, JPG, JPEG hoặc PNG.";
  }

  if (file.size <= 0) {
    return "File đã chọn bị rỗng.";
  }

  if (file.size > 20 * 1024 * 1024) {
    return "File không được vượt quá 20 MB.";
  }

  return null;
}

export function StudentScanDialog({
  open,
  studentId,
  studentName,
  onClose,
  onChanged,
}: Props) {
  const { accessToken } = useAuth();

  const [intakes, setIntakes] = useState<StudentScanIntake[]>([]);

  const [intakeId, setIntakeId] = useState<number | null>(null);

  const [attachments, setAttachments] = useState<StudentScanAttachment[]>([]);

  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open || !studentId || !accessToken) {
      setIntakes([]);
      setIntakeId(null);
      setAttachments([]);
      setFile(null);
      return;
    }

    let active = true;

    setLoading(true);
    setError("");
    setSuccess("");
    setIntakes([]);
    setIntakeId(null);
    setAttachments([]);

    void listStudentScanIntakes(accessToken, studentId)
      .then((result) => {
        if (!active) return;

        setIntakes(result);
        setIntakeId(result[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error ? err.message : "Không thể tải hồ sơ tiếp nhận."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, studentId, accessToken]);

  useEffect(() => {
    if (!open || !studentId || !intakeId || !accessToken) {
      setAttachments([]);
      return;
    }

    let active = true;

    setFilesLoading(true);
    setAttachments([]);

    void listStudentScans(accessToken, studentId, intakeId)
      .then((result) => {
        if (active) setAttachments(result);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách file scan."
        );
      })
      .finally(() => {
        if (active) setFilesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, studentId, intakeId, accessToken, reload]);

  async function handleUpload() {
    if (!accessToken || !studentId || !intakeId || !file || saving) {
      return;
    }

    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await uploadStudentScan(accessToken, studentId, intakeId, file);

      setFile(null);

      setSuccess("Đã lưu hồ sơ scan thành công.");

      setReload((current) => current + 1);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể upload hồ sơ scan."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(attachment: StudentScanAttachment) {
    if (!accessToken || !studentId || !intakeId) {
      return;
    }

    setError("");

    try {
      await downloadStudentScan(accessToken, studentId, intakeId, attachment);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải hồ sơ scan."
      );
    }
  }

  const currentFile = attachments[0];

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            maxHeight: "90vh",
          },
        },
      }}
    >
      <DialogTitle component="div">
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Hồ sơ scan thí sinh tự do
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {studentName || `Học viên #${studentId}`}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {success && <Alert severity="success">{success}</Alert>}

          {loading ? (
            <Box
              sx={{
                display: "grid",
                placeItems: "center",
                py: 5,
              }}
            >
              <CircularProgress />
            </Box>
          ) : intakes.length === 0 ? (
            <Alert severity="warning">
              Không tìm thấy hồ sơ tiếp nhận thí sinh tự do mà tài khoản được
              phép quản lý.
            </Alert>
          ) : (
            <>
              <TextField
                select
                fullWidth
                size="small"
                label="Hồ sơ tiếp nhận"
                value={intakeId !== null ? String(intakeId) : ""}
                disabled={saving}
                onChange={(event) => {
                  setIntakeId(Number(event.target.value));
                  setFile(null);
                  setError("");
                  setSuccess("");
                }}
              >
                {intakes.map((intake) => (
                  <MenuItem key={intake.id} value={String(intake.id)}>
                    Hồ sơ #{intake.id} — {intake.createdByName} —{" "}
                    {formatDateTime(intake.createdAt)}
                  </MenuItem>
                ))}
              </TextField>

              <Divider />

              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 700,
                    mb: 1.5,
                  }}
                >
                  Hồ sơ scan hiện tại
                </Typography>

                {filesLoading ? (
                  <CircularProgress size={22} />
                ) : currentFile ? (
                  <Stack spacing={1.5}>
                    <Stack
                      direction={{
                        xs: "column",
                        sm: "row",
                      }}
                      sx={{
                        spacing: 2,
                        alignItems: {
                          xs: "flex-start",
                          sm: "center",
                        },
                        justifyContent: "space-between",
                      }}
                    >
                      <Stack
                        direction="row"
                        sx={{ minWidth: 0, spacing: 1.5, alignItems: "center" }}
                      >
                        <DescriptionOutlined color="primary" />

                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              overflowWrap: "anywhere",
                            }}
                          >
                            {currentFile.originalName}
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            {formatSize(currentFile.sizeBytes)}
                            {" · "}
                            {formatDateTime(currentFile.createdAt)}
                          </Typography>
                        </Box>
                      </Stack>

                      <Button
                        variant="outlined"
                        startIcon={<DownloadOutlined />}
                        onClick={() => void handleDownload(currentFile)}
                      >
                        Tải xuống
                      </Button>
                    </Stack>

                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label="Đã có hồ sơ scan"
                      sx={{ alignSelf: "flex-start" }}
                    />
                  </Stack>
                ) : (
                  <Alert severity="info">Chưa có file hồ sơ scan.</Alert>
                )}
              </Box>

              <Divider />

              <Stack spacing={1.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {currentFile ? "Upload phiên bản mới" : "Upload hồ sơ scan"}
                </Typography>

                <Button
                  component="label"
                  variant="outlined"
                  disabled={saving}
                  startIcon={<CloudUploadOutlined />}
                >
                  {file ? file.name : "Chọn PDF hoặc ảnh scan"}

                  <input
                    hidden
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(event) => {
                      const selected = event.target.files?.[0] ?? null;

                      setFile(selected);
                      setError("");

                      if (selected) {
                        const message = validateFile(selected);

                        if (message) {
                          setError(message);
                        }
                      }

                      event.target.value = "";
                    }}
                  />
                </Button>

                <Typography variant="caption" color="text.secondary">
                  Hỗ trợ PDF, JPG, JPEG, PNG. Tối đa 20 MB mỗi file. Upload mới
                  sẽ không xóa các bản cũ.
                </Typography>

                <Button
                  variant="contained"
                  disabled={
                    saving || !file || Boolean(file && validateFile(file))
                  }
                  startIcon={
                    saving ? (
                      <CircularProgress size={16} color="inherit" />
                    ) : (
                      <CloudUploadOutlined />
                    )
                  }
                  onClick={() => void handleUpload()}
                >
                  {saving ? "Đang upload..." : "Lưu hồ sơ scan"}
                </Button>
              </Stack>

              {attachments.length > 1 && (
                <>
                  <Divider />

                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    <HistoryOutlined
                      sx={{
                        mr: 1,
                        verticalAlign: "middle",
                      }}
                    />
                    Lịch sử upload
                  </Typography>

                  <Stack spacing={1}>
                    {attachments.slice(1).map((attachment) => (
                      <Stack
                        key={attachment.id}
                        direction={{
                          xs: "column",
                          sm: "row",
                        }}
                        sx={{
                          spacing: 1,
                          alignItems: {
                            xs: "flex-start",
                            sm: "center",
                          },
                          justifyContent: "space-between",
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              overflowWrap: "anywhere",
                            }}
                          >
                            {attachment.originalName}
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(attachment.createdAt)}
                            {" · "}
                            {attachment.uploadedByName}
                          </Typography>
                        </Box>

                        <Button
                          size="small"
                          startIcon={<DownloadOutlined />}
                          onClick={() => void handleDownload(attachment)}
                        >
                          Tải
                        </Button>
                      </Stack>
                    ))}
                  </Stack>
                </>
              )}
            </>
          )}
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
