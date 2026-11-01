"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
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
  CloudUploadOutlined,
  DownloadOutlined,
  HistoryOutlined,
  RefreshOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import type {
  OrganizationOptions,
} from "@/lib/organization-accounts";

import {
  downloadFileSubmission,
  FILE_TYPE_LABELS,
  listFileSubmissionVersions,
  listFileSubmissions,
  replaceFileSubmission,
  STATUS_LABELS,
  uploadFileSubmission,
  type FileSubmission,
  type SubmissionFileType,
  getFileSubmissionOptions,
} from "@/lib/file-submissions";

const ROLE_FILE_TYPES: Record<string, SubmissionFileType[]> = {
  training_school: ["bc1", "bc2"],
  pc08_staff: ["bc2_result", "exam_48"],
  exam_center: ["exam_result"],
};

const EMPTY_OPTIONS: OrganizationOptions = {
  trainingSchools: [],
  examinationCenters: [],
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString("vi-VN");
}

function formatSize(bytes: string): string {
  const size = Number(bytes);
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function FileSubmissionsWorkspace() {
  const { user, accessToken } = useAuth();

  const [rows, setRows] = useState<FileSubmission[]>([]);
  const [options, setOptions] = useState<OrganizationOptions>(EMPTY_OPTIONS);

  const [fileType, setFileType] = useState<SubmissionFileType>("bc1");

  const [schoolId, setSchoolId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  const [versionRows, setVersionRows] = useState<
    Awaited<ReturnType<typeof listFileSubmissionVersions>>
  >([]);
  const [versionSubmissionId, setVersionSubmissionId] = useState<number | null>(
    null
  );

  const replacementInputRef = useRef<HTMLInputElement | null>(null);

  const [replacementId, setReplacementId] = useState<number | null>(null);

  const allowedTypes = useMemo(
    () => ROLE_FILE_TYPES[user?.role ?? ""] ?? [],
    [user?.role]
  );

  useEffect(() => {
    if (allowedTypes.length > 0 && !allowedTypes.includes(fileType)) {
      setFileType(allowedTypes[0]);
    }
  }, [allowedTypes, fileType]);

  const load = useCallback(async () => {
    if (!accessToken || !allowedTypes.length) return;

    setLoading(true);
    setError("");

    try {
      const result = await listFileSubmissions(accessToken);
      setRows(result);

      if (user?.role === "pc08_staff") {
        const available = await getFileSubmissionOptions(accessToken);

        setOptions(available);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải danh sách file."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, allowedTypes.length, user?.role, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload() {
    if (!accessToken || !file || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await uploadFileSubmission(accessToken, {
        file,
        fileType,
        note,
        trainingSchoolId:
          fileType === "bc2_result" ? Number(schoolId) || null : null,
        examinationCenterId:
          fileType === "exam_48" ? Number(centerId) || null : null,
      });

      setFile(null);
      setNote("");
      setSuccess("Đã gửi file. Hồ sơ đang chờ SUPER_ADMIN duyệt.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi file.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReplace(id: number, selectedFile: File) {
    if (!accessToken) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await replaceFileSubmission(accessToken, id, selectedFile);

      setSuccess("Đã cập nhật phiên bản file đang chờ duyệt.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thay file.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(item: FileSubmission) {
    if (!accessToken) return;

    try {
      await downloadFileSubmission(accessToken, item.id, item.originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải file.");
    }
  }

  async function showVersions(id: number) {
    if (!accessToken) return;

    setError("");

    try {
      const result = await listFileSubmissionVersions(accessToken, id);

      setVersionRows(result);
      setVersionSubmissionId(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể lấy lịch sử phiên bản."
      );
    }
  }

  if (!allowedTypes.length) {
    return (
      <Alert severity="info">
        Tài khoản không thuộc nhóm được gửi hồ sơ trong giai đoạn này.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Quản lý hồ sơ gửi lên
        </Typography>
        <Typography color="text.secondary">
          Gửi file, theo dõi phê duyệt và tải lại hồ sơ.
        </Typography>
      </Box>

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

      <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Stack spacing={2}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <CloudUploadOutlined sx={{ mr: 1, verticalAlign: "middle" }} />
            Gửi hồ sơ mới
          </Typography>

          <TextField
            select
            label="Loại file"
            value={allowedTypes.includes(fileType) ? fileType : allowedTypes[0]}
            fullWidth
            size="small"
            disabled={saving}
            onChange={(event) => {
              setFileType(event.target.value as SubmissionFileType);
              setSchoolId("");
              setCenterId("");
            }}
          >
            {allowedTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {FILE_TYPE_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>

          {user?.role === "pc08_staff" && fileType === "bc2_result" && (
            <TextField
              select
              size="small"
              required
              fullWidth
              label="CSĐT nhận kết quả BC2"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              <MenuItem value="">Chọn CSĐT</MenuItem>
              {options.trainingSchools.map((school) => (
                <MenuItem key={school.id} value={String(school.id)}>
                  {school.code} — {school.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {user?.role === "pc08_staff" && fileType === "exam_48" && (
            <TextField
              select
              size="small"
              required
              fullWidth
              label="TTSH nhận file dự sát hạch"
              value={centerId}
              onChange={(event) => setCenterId(event.target.value)}
            >
              <MenuItem value="">Chọn TTSH</MenuItem>
              {options.examinationCenters.map((center) => (
                <MenuItem key={center.id} value={String(center.id)}>
                  {center.code} — {center.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileOutlined />}
            disabled={saving}
          >
            {file ? file.name : "Chọn file từ máy"}
            <input
              hidden
              type="file"
              accept=".xml,.xls,.xlsx,.pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Button>

          <TextField
            label="Ghi chú"
            multiline
            minRows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />

          <Alert severity="info">
            File được lưu trên server và chờ SUPER_ADMIN duyệt. Bạn có thể gửi
            phiên bản mới khi chưa được duyệt. File đã duyệt sẽ bị khóa.
          </Alert>

          <Box>
            <Button
              variant="contained"
              startIcon={<CloudUploadOutlined />}
              disabled={
                saving ||
                !file ||
                (fileType === "bc2_result" && !schoolId) ||
                (fileType === "exam_48" && !centerId)
              }
              onClick={() => void handleUpload()}
            >
              {saving ? "Đang xử lý..." : "Gửi hồ sơ"}
            </Button>
          </Box>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <Stack
          direction="row"
          sx={{ p: 2, alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            File đã gửi
          </Typography>
          <Button
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshOutlined />
            }
            disabled={loading}
            onClick={() => setReload((v) => v + 1)}
          >
            Tải lại
          </Button>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 920 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Phiên bản</TableCell>
                <TableCell>Thời gian gửi</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {item.originalName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{item.id} · {formatSize(item.sizeBytes)}
                    </Typography>
                    {item.rejectionReason && (
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ display: "block" }}
                      >
                        Lý do: {item.rejectionReason}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{FILE_TYPE_LABELS[item.fileType]}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={
                        item.status === "approved"
                          ? "success"
                          : item.status === "rejected"
                          ? "error"
                          : "warning"
                      }
                      label={STATUS_LABELS[item.status]}
                    />
                  </TableCell>
                  <TableCell>{item.currentVersion}</TableCell>
                  <TableCell>{formatTime(item.createdAt)}</TableCell>
                  <TableCell align="right">
                    <Stack
                      direction="row"
                      sx={{ justifyContent: "flex-end", spacing: 0.5 }}
                    >
                      <Button
                        size="small"
                        startIcon={<DownloadOutlined />}
                        onClick={() => void handleDownload(item)}
                      >
                        Tải
                      </Button>
                      <Button
                        size="small"
                        startIcon={<HistoryOutlined />}
                        onClick={() => void showVersions(item.id)}
                      >
                        Lịch sử
                      </Button>
                      {item.status === "pending" && (
                        <Button
                          size="small"
                          disabled={saving}
                          onClick={() => {
                            setReplacementId(item.id);
                            replacementInputRef.current?.click();
                          }}
                        >
                          Thay file
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    Chưa có file được gửi.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <input
        ref={replacementInputRef}
        type="file"
        accept=".xml,.xls,.xlsx,.pdf"
        hidden
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (selectedFile && replacementId !== null) {
            void handleReplace(replacementId, selectedFile);
          }
          event.target.value = "";
        }}
      />

      {versionSubmissionId !== null && (
        <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
              <Typography sx={{ fontWeight: 700 }}>
                Lịch sử phiên bản hồ sơ #{versionSubmissionId}
              </Typography>
              <Button size="small" onClick={() => setVersionSubmissionId(null)}>
                Đóng
              </Button>
            </Stack>
            <Divider />
            {versionRows.map((version) => (
              <Stack
                key={version.id}
                direction="row"
                sx={{
                  spacing: 2,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">
                    Bản {version.version}: {version.originalName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(version.createdAt)}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<DownloadOutlined />}
                  onClick={() => {
                    if (accessToken) {
                      void downloadFileSubmission(
                        accessToken,
                        versionSubmissionId,
                        version.originalName,
                        version.version
                      ).catch((err: unknown) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Không thể tải phiên bản."
                        )
                      );
                    }
                  }}
                >
                  Tải
                </Button>
              </Stack>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
