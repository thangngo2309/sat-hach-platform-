"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
import type { OrganizationOptions } from "@/lib/organization-accounts";

import {
  downloadFileSubmission,
  FILE_TYPE_LABELS,
  formatItOfficer,
  getFileSubmissionOptions,
  listExamSessionOptions,
  listFileSubmissionVersions,
  listFileSubmissions,
  listItOfficerOptions,
  replaceFileSubmission,
  STATUS_LABELS,
  uploadFileSubmission,
  type ExamSessionOption,
  type FileSubmission,
  type FileSubmissionVersion,
  type ItOfficerOption,
  type SubmissionFileType,
} from "@/lib/file-submissions";

import {
  describeMetadata,
  DOCUMENT_FIELDS,
  LICENSE_CLASSES,
  validateMetadata,
  type DocumentMetadata,
} from "@/lib/file-document-metadata";

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
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function formatSize(value: string): string {
  const bytes = Number(value);

  return Number.isFinite(bytes)
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : "—";
}

function formatSession(session: ExamSessionOption): string {
  const date = session.examDate?.slice(0, 10) ?? "Chưa có ngày";

  return [session.code, session.centerName || session.centerCode, date]
    .filter(Boolean)
    .join(" — ");
}

function needsSession(type: SubmissionFileType): boolean {
  return type !== "bc1";
}

type MetadataFormProps = {
  fileType: SubmissionFileType;
  values: DocumentMetadata;
  onChange: (next: DocumentMetadata) => void;
  sessions: ExamSessionOption[];
  itOfficers: ItOfficerOption[];
  loadingOfficers?: boolean;
  disabled?: boolean;
};

/**
 * Metadata chỉ hiển thị các trường nghiệp vụ
 * khác. Kỳ sát hạch được chọn ở form chính,
 * không cho tạo thêm dropdown kỳ thứ hai.
 */
function MetadataForm({
  fileType,
  values,
  onChange,
  sessions,
  itOfficers,
  loadingOfficers = false,
  disabled = false,
}: MetadataFormProps) {
  const fields = DOCUMENT_FIELDS[fileType].filter(
    (field) => field.type !== "session"
  );

  if (!fields.length) return null;

  const update = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  const selectedSession = sessions.find(
    (item) => String(item.id) === String(values.examinationSessionId ?? "")
  );

  return (
    <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Typography sx={{ fontWeight: 700, mb: 2 }}>
        Thông tin đi kèm hồ sơ
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        {fields.map((field) => {
          if (fileType === "exam_result" && field.key === "itOfficer") {
            const current = values.itOfficer ?? "";
            const availableValues = itOfficers.map(formatItOfficer);

            const hasLegacyValue =
              current.length > 0 && !availableValues.includes(current);

            return (
              <TextField
                key={field.key}
                select
                fullWidth
                required
                size="small"
                label="IT phụ trách"
                value={current}
                disabled={
                  disabled || loadingOfficers || itOfficers.length === 0
                }
                onChange={(event) => update("itOfficer", event.target.value)}
                helperText={
                  loadingOfficers
                    ? "Đang tải danh sách IT..."
                    : itOfficers.length === 0
                    ? "Chưa có tài khoản IT trong danh sách."
                    : "Chọn tài khoản IT đã có trong hệ thống."
                }
              >
                <MenuItem value="">Chọn IT phụ trách</MenuItem>

                {hasLegacyValue && (
                  <MenuItem value={current} disabled>
                    {current} (giá trị đã lưu)
                  </MenuItem>
                )}

                {itOfficers.map((officer) => (
                  <MenuItem key={officer.id} value={formatItOfficer(officer)}>
                    {officer.fullName} (@{officer.username})
                  </MenuItem>
                ))}
              </TextField>
            );
          }

          if (field.type === "license") {
            return (
              <TextField
                key={field.key}
                select
                fullWidth
                required
                size="small"
                label={field.label}
                value={values[field.key] ?? ""}
                disabled={disabled}
                onChange={(event) => update(field.key, event.target.value)}
              >
                <MenuItem value="">Chọn hạng</MenuItem>

                {LICENSE_CLASSES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {value}
                  </MenuItem>
                ))}
              </TextField>
            );
          }

          const isDate = field.type === "date";
          const isExamDate = field.key === "examinationDate";

          return (
            <TextField
              key={field.key}
              fullWidth
              required
              size="small"
              label={field.label}
              type={isDate ? "date" : "text"}
              value={values[field.key] ?? ""}
              disabled={disabled || (isExamDate && Boolean(selectedSession))}
              slotProps={
                isDate
                  ? { inputLabel: { shrink: true } }
                  : { htmlInput: { maxLength: 255 } }
              }
              onChange={(event) => update(field.key, event.target.value)}
              helperText={
                isExamDate && selectedSession
                  ? "Ngày được lấy từ kỳ sát hạch đã chọn."
                  : undefined
              }
            />
          );
        })}
      </Box>
    </Card>
  );
}

export function FileSubmissionsWorkspace() {
  const { user, accessToken } = useAuth();

  const [rows, setRows] = useState<FileSubmission[]>([]);
  const [options, setOptions] = useState<OrganizationOptions>(EMPTY_OPTIONS);

  const [fileType, setFileType] = useState<SubmissionFileType>("bc1");

  const [schoolId, setSchoolId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata>({});

  const [sessions, setSessions] = useState<ExamSessionOption[]>([]);

  const [itOfficers, setItOfficers] = useState<ItOfficerOption[]>([]);

  const [loadingSessions, setLoadingSessions] = useState(false);

  const [loadingOfficers, setLoadingOfficers] = useState(false);

  const [replaceTarget, setReplaceTarget] = useState<FileSubmission | null>(
    null
  );

  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const [replacementMetadata, setReplacementMetadata] =
    useState<DocumentMetadata>({});

  const [versions, setVersions] = useState<FileSubmissionVersion[]>([]);

  const [versionSubmissionId, setVersionSubmissionId] = useState<number | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  const allowedTypes = useMemo(
    () => ROLE_FILE_TYPES[user?.role ?? ""] ?? [],
    [user?.role]
  );

  const availableSessions = useMemo(() => {
    if (!centerId) return sessions;

    return sessions.filter(
      (session) =>
        !session.examinationCenterId ||
        Number(session.examinationCenterId) === Number(centerId)
    );
  }, [sessions, centerId]);

  const selectedSession = sessions.find(
    (session) => String(session.id) === selectedSessionId
  );

  useEffect(() => {
    if (allowedTypes.length && !allowedTypes.includes(fileType)) {
      setFileType(allowedTypes[0]);
      setMetadata({});
      setSelectedSessionId("");
    }
  }, [allowedTypes, fileType]);

  /**
   * Kỳ sát hạch dùng chung cho CSĐT, PC08, TTSH.
   * Chỉ tải IT phụ trách đối với TTSH.
   */
  const loadSessions = useCallback(async () => {
    if (!accessToken || !allowedTypes.length) {
      setSessions([]);
      return;
    }

    setLoadingSessions(true);

    try {
      const data = await listExamSessionOptions(accessToken);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách kỳ sát hạch."
      );
    } finally {
      setLoadingSessions(false);
    }
  }, [accessToken, allowedTypes.length]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!accessToken || user?.role !== "exam_center") {
      setItOfficers([]);
      return;
    }

    let active = true;

    setLoadingOfficers(true);

    void listItOfficerOptions(accessToken)
      .then((data) => {
        if (active) setItOfficers(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Không thể tải danh sách IT."
          );
        }
      })
      .finally(() => {
        if (active) setLoadingOfficers(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, user?.role]);

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

  function selectSession(id: string) {
    setSelectedSessionId(id);

    const session = sessions.find((item) => String(item.id) === id);

    setMetadata((current) => ({
      ...current,
      examinationSessionId: id,
      examinationDate: session?.examDate?.slice(0, 10) ?? "",
    }));

    if (session?.examinationCenterId && fileType === "exam_48") {
      setCenterId(String(session.examinationCenterId));
    }
  }

  function changeFileType(type: SubmissionFileType) {
    setFileType(type);
    setSchoolId("");
    setCenterId("");
    setSelectedSessionId("");
    setMetadata({});
    setFile(null);
  }

  async function handleUpload() {
    if (!accessToken || !file || saving) return;

    setError("");
    setSuccess("");

    if (needsSession(fileType) && !selectedSessionId) {
      setError("Vui lòng chọn kỳ sát hạch trước khi gửi hồ sơ.");
      return;
    }

    const mergedMetadata: DocumentMetadata = needsSession(fileType)
      ? {
          ...metadata,
          examinationSessionId: selectedSessionId,
          examinationDate: selectedSession?.examDate?.slice(0, 10) ?? "",
        }
      : metadata;

    const validationError = validateMetadata(fileType, mergedMetadata);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (
      fileType === "exam_result" &&
      !itOfficers.some(
        (officer) => formatItOfficer(officer) === mergedMetadata.itOfficer
      )
    ) {
      setError("Vui lòng chọn IT trong danh sách.");
      return;
    }

    if (fileType === "bc2_result" && !schoolId) {
      setError("Vui lòng chọn CSĐT nhận kết quả BC2.");
      return;
    }

    if (fileType === "exam_48" && !centerId) {
      setError("Vui lòng chọn TTSH nhận file 48_.");
      return;
    }

    if (
      fileType === "exam_48" &&
      selectedSession?.examinationCenterId &&
      Number(centerId) !== Number(selectedSession.examinationCenterId)
    ) {
      setError("Trung tâm sát hạch không khớp kỳ đã chọn.");
      return;
    }

    setSaving(true);

    try {
      await uploadFileSubmission(accessToken, {
        file,
        fileType,
        note,
        documentMetadata: mergedMetadata,
        examinationSessionId: needsSession(fileType)
          ? Number(selectedSessionId)
          : null,
        trainingSchoolId: fileType === "bc2_result" ? Number(schoolId) : null,
        examinationCenterId: fileType === "exam_48" ? Number(centerId) : null,
      });

      setFile(null);
      setNote("");
      setMetadata({});
      setSelectedSessionId("");

      setSuccess("Đã gửi hồ sơ. File đang chờ SUPER_ADMIN duyệt.");

      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể gửi file.");
    } finally {
      setSaving(false);
    }
  }

  function openReplace(item: FileSubmission) {
    setReplaceTarget(item);
    setReplaceFile(null);

    setReplacementMetadata({
      ...(item.documentMetadata ?? {}),
      ...(item.examinationSessionId
        ? {
            examinationSessionId: String(item.examinationSessionId),
          }
        : {}),
    });

    setError("");
  }

  async function handleReplace() {
    if (!accessToken || !replaceTarget || !replaceFile || saving) {
      return;
    }

    const currentSession = sessions.find(
      (session) => session.id === replaceTarget.examinationSessionId
    );

    const nextMetadata: DocumentMetadata = replaceTarget.examinationSessionId
      ? {
          ...replacementMetadata,
          examinationSessionId: String(replaceTarget.examinationSessionId),
          examinationDate:
            currentSession?.examDate?.slice(0, 10) ??
            replacementMetadata.examinationDate ??
            "",
        }
      : replacementMetadata;

    const validationError = validateMetadata(
      replaceTarget.fileType,
      nextMetadata
    );

    if (validationError) {
      setError(validationError);
      return;
    }

    if (
      replaceTarget.fileType === "exam_result" &&
      !itOfficers.some(
        (officer) => formatItOfficer(officer) === nextMetadata.itOfficer
      )
    ) {
      setError("Vui lòng chọn IT trong danh sách.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await replaceFileSubmission(
        accessToken,
        replaceTarget.id,
        replaceFile,
        nextMetadata
      );

      setReplaceTarget(null);
      setReplaceFile(null);
      setReplacementMetadata({});

      setSuccess("Đã cập nhật phiên bản mới. Kỳ sát hạch không thay đổi.");

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

    try {
      const result = await listFileSubmissionVersions(accessToken, id);

      setVersions(result);
      setVersionSubmissionId(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải lịch sử phiên bản."
      );
    }
  }

  if (!allowedTypes.length) {
    return (
      <Alert severity="info">
        Tài khoản không được phép gửi hồ sơ tại đây.
      </Alert>
    );
  }

  const versionFileType = rows.find(
    (item) => item.id === versionSubmissionId
  )?.fileType;

  const canUpload =
    Boolean(file) &&
    !saving &&
    !loadingSessions &&
    (!needsSession(fileType) || Boolean(selectedSessionId)) &&
    !validateMetadata(
      fileType,
      needsSession(fileType)
        ? {
            ...metadata,
            examinationSessionId: selectedSessionId,
            examinationDate: selectedSession?.examDate?.slice(0, 10) ?? "",
          }
        : metadata
    ) &&
    (fileType !== "exam_result" ||
      itOfficers.some(
        (officer) => formatItOfficer(officer) === metadata.itOfficer
      )) &&
    (fileType !== "bc2_result" || Boolean(schoolId)) &&
    (fileType !== "exam_48" || Boolean(centerId));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Quản lý hồ sơ gửi lên
        </Typography>

        <Typography color="text.secondary">
          Gửi hồ sơ, theo dõi phê duyệt và quản lý các phiên bản file theo kỳ
          sát hạch.
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
            fullWidth
            size="small"
            label="Loại file"
            value={allowedTypes.includes(fileType) ? fileType : allowedTypes[0]}
            disabled={saving}
            onChange={(event) =>
              changeFileType(event.target.value as SubmissionFileType)
            }
          >
            {allowedTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {FILE_TYPE_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>

          {needsSession(fileType) && (
            <TextField
              select
              required
              fullWidth
              size="small"
              label="Kỳ sát hạch"
              value={selectedSessionId}
              disabled={saving || loadingSessions}
              onChange={(event) => selectSession(event.target.value)}
              helperText={
                loadingSessions
                  ? "Đang tải danh sách kỳ sát hạch..."
                  : "Kỳ phải được tạo trước khi gửi file."
              }
            >
              <MenuItem value="">Chọn kỳ sát hạch</MenuItem>

              {availableSessions.map((session) => (
                <MenuItem key={session.id} value={String(session.id)}>
                  {formatSession(session)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {fileType === "exam_48" && user?.role === "pc08_staff" && (
            <TextField
              select
              required
              fullWidth
              size="small"
              label="TTSH nhận file dự sát hạch"
              value={centerId}
              disabled={saving}
              onChange={(event) => {
                setCenterId(event.target.value);

                if (
                  selectedSession?.examinationCenterId &&
                  Number(event.target.value) !==
                    Number(selectedSession.examinationCenterId)
                ) {
                  selectSession("");
                }
              }}
            >
              <MenuItem value="">Chọn TTSH</MenuItem>

              {options.examinationCenters.map((center) => (
                <MenuItem key={center.id} value={String(center.id)}>
                  {center.code} — {center.name}
                </MenuItem>
              ))}
            </TextField>
          )}

          {fileType === "bc2_result" && user?.role === "pc08_staff" && (
            <TextField
              select
              required
              fullWidth
              size="small"
              label="CSĐT nhận kết quả BC2"
              value={schoolId}
              disabled={saving}
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

          <MetadataForm
            fileType={fileType}
            values={metadata}
            onChange={setMetadata}
            sessions={sessions}
            itOfficers={itOfficers}
            loadingOfficers={loadingOfficers}
            disabled={saving}
          />

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
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
            slotProps={{
              htmlInput: { maxLength: 2000 },
            }}
          />

          <Alert severity="info">
            File được lưu trên server và chờ SUPER_ADMIN phê duyệt. Các file
            liên quan kỳ sát hạch sẽ giữ liên kết theo ID ngay cả khi mã kỳ tạm
            được cập nhật thành mã chính thức.
          </Alert>

          <Box>
            <Button
              variant="contained"
              startIcon={<CloudUploadOutlined />}
              disabled={!canUpload}
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
          sx={{
            p: 2,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            File đã gửi
          </Typography>

          <Button
            disabled={loading}
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshOutlined />
            }
            onClick={() => setReload((value) => value + 1)}
          >
            Tải lại
          </Button>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Kỳ sát hạch</TableCell>
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

                    {describeMetadata(item.fileType, item.documentMetadata).map(
                      (line, index) => (
                        <Typography
                          key={`${item.id}-${index}`}
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {line}
                        </Typography>
                      )
                    )}

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
                    {item.examinationSessionCode ??
                      (item.examinationSessionId
                        ? `#${item.examinationSessionId}`
                        : "—")}
                  </TableCell>

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
                      sx={{
                        gap: 0.5,
                        justifyContent: "flex-end",
                      }}
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
                          onClick={() => openReplace(item)}
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
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    Chưa có file được gửi.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog
        open={replaceTarget !== null}
        onClose={() => {
          if (!saving) setReplaceTarget(null);
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Thay phiên bản hồ sơ #{replaceTarget?.id}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Chọn file mới và xác nhận thông tin khai báo.
            </Typography>

            {replaceTarget?.examinationSessionId && (
              <Alert severity="info">
                Kỳ sát hạch:{" "}
                {replaceTarget.examinationSessionCode ??
                  `#${replaceTarget.examinationSessionId}`}
                . Không thể đổi kỳ khi thay phiên bản.
              </Alert>
            )}

            <Button component="label" variant="outlined" disabled={saving}>
              {replaceFile ? replaceFile.name : "Chọn file thay thế"}

              <input
                hidden
                type="file"
                accept=".xml,.xls,.xlsx,.pdf"
                onChange={(event) =>
                  setReplaceFile(event.target.files?.[0] ?? null)
                }
              />
            </Button>

            {replaceTarget && (
              <MetadataForm
                fileType={replaceTarget.fileType}
                values={replacementMetadata}
                onChange={setReplacementMetadata}
                sessions={sessions}
                itOfficers={itOfficers}
                loadingOfficers={loadingOfficers}
                disabled={saving}
              />
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={saving} onClick={() => setReplaceTarget(null)}>
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={
              saving ||
              !replaceTarget ||
              !replaceFile ||
              Boolean(
                replaceTarget &&
                  validateMetadata(replaceTarget.fileType, replacementMetadata)
              ) ||
              Boolean(
                replaceTarget?.fileType === "exam_result" &&
                  !itOfficers.some(
                    (officer) =>
                      formatItOfficer(officer) === replacementMetadata.itOfficer
                  )
              )
            }
            onClick={() => void handleReplace()}
          >
            {saving ? "Đang lưu..." : "Lưu phiên bản mới"}
          </Button>
        </DialogActions>
      </Dialog>

      {versionSubmissionId !== null && (
        <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
          <Stack spacing={1.5}>
            <Stack
              direction="row"
              sx={{
                justifyContent: "space-between",
              }}
            >
              <Typography sx={{ fontWeight: 700 }}>
                Lịch sử phiên bản hồ sơ #{versionSubmissionId}
              </Typography>

              <Button size="small" onClick={() => setVersionSubmissionId(null)}>
                Đóng
              </Button>
            </Stack>

            <Divider />

            {versions.map((version) => (
              <Stack
                key={version.id}
                direction="row"
                sx={{
                  gap: 2,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2">
                    Bản {version.version}: {version.originalName}
                  </Typography>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block" }}
                  >
                    {formatTime(version.createdAt)}
                  </Typography>

                  {versionFileType &&
                    describeMetadata(
                      versionFileType,
                      version.documentMetadata
                    ).map((line, index) => (
                      <Typography
                        key={`${version.id}-${index}`}
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {line}
                      </Typography>
                    ))}
                </Box>

                <Button
                  size="small"
                  startIcon={<DownloadOutlined />}
                  onClick={() => {
                    if (!accessToken) return;

                    void downloadFileSubmission(
                      accessToken,
                      versionSubmissionId,
                      version.originalName,
                      version.version
                    ).catch((err: unknown) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Không thể tải phiên bản."
                      );
                    });
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
