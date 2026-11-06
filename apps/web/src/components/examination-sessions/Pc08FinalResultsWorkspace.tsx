"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
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
  CloudUploadOutlined,
  DownloadOutlined,
  RefreshOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  listExamSessionOptions,
  type ExamSessionOption,
} from "@/lib/file-submissions";

import {
  confirmPc08FinalResults,
  downloadPc08FinalResult,
  formatPc08ResultDate,
  formatPc08ResultSize,
  getPc08FinalResultSession,
  reviewPc08FinalResult,
  uploadPc08FinalResult,
  type Pc08FinalResultDelivery,
  type Pc08FinalResultSessionStatus,
} from "@/lib/pc08-final-results";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Không thể thực hiện thao tác.";
}

function formatSession(item: ExamSessionOption): string {
  return [
    item.officialCode || item.code,
    item.centerName || item.centerCode,
    item.examDate?.slice(0, 10),
  ]
    .filter(Boolean)
    .join(" — ");
}

function deliveryLabel(status: string): string {
  if (status === "approved") return "Đã duyệt";
  if (status === "rejected") return "Bị từ chối";
  return "Chờ duyệt";
}

function deliveryColor(status: string): "success" | "error" | "warning" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "warning";
}

type RejectTarget = {
  delivery: Pc08FinalResultDelivery;
};

export function Pc08FinalResultsWorkspace() {
  const { user, accessToken } = useAuth();

  const isPc08 = user?.role === "pc08_staff";
  const isAdmin = user?.role === "super_admin";
  const authorized = isPc08 || isAdmin;

  const [sessions, setSessions] = useState<ExamSessionOption[]>([]);
  const [sessionId, setSessionId] = useState("");

  const [details, setDetails] = useState<Pc08FinalResultSessionStatus | null>(
    null
  );

  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const [uploadSchoolId, setUploadSchoolId] = useState<number | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [confirmed, setConfirmed] = useState(false);
  const [confirmationNote, setConfirmationNote] = useState("");

  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);

  const [rejectionReason, setRejectionReason] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!accessToken || !authorized) {
      setSessions([]);
      return;
    }

    let active = true;

    setLoadingSessions(true);

    void listExamSessionOptions(accessToken)
      .then((data) => {
        if (active) setSessions(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoadingSessions(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, authorized]);

  const load = useCallback(async () => {
    const id = Number(sessionId);

    if (!accessToken || !authorized || !id) {
      setDetails(null);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await getPc08FinalResultSession(accessToken, id);

      setDetails(response);
    } catch (err) {
      setDetails(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [accessToken, authorized, sessionId, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setConfirmed(false);
    setConfirmationNote("");
    setUploadSchoolId(null);
    setUploadFile(null);
    setRejectTarget(null);
  }, [sessionId]);

  const deliveryBySchool = useMemo(() => {
    return new Map(
      (details?.deliveries ?? []).map((item) => [item.trainingSchoolId, item])
    );
  }, [details]);

  const summary = useMemo(() => {
    const deliveries = details?.deliveries ?? [];

    return {
      total: details?.schools.length ?? 0,
      uploaded: deliveries.length,
      approved: deliveries.filter((item) => item.status === "approved").length,
      rejected: deliveries.filter((item) => item.status === "rejected").length,
      pending: deliveries.filter((item) => item.status === "pending").length,
      missing: details?.missingSchools.length ?? 0,
    };
  }, [details]);

  function resetMessage() {
    setError("");
    setSuccess("");
  }

  async function upload() {
    if (
      !accessToken ||
      !details ||
      !isPc08 ||
      !uploadSchoolId ||
      !uploadFile ||
      saving
    ) {
      return;
    }

    if (!/\.xml$/i.test(uploadFile.name)) {
      setError("KQSH cuối cùng phải là file XML.");
      return;
    }

    if (uploadFile.size <= 0 || uploadFile.size > 64 * 1024 * 1024) {
      setError("File XML phải có dung lượng tối đa 64 MB.");
      return;
    }

    setSaving(true);
    resetMessage();

    try {
      const response = await uploadPc08FinalResult(
        accessToken,
        details.session.id,
        uploadSchoolId,
        uploadFile
      );

      setSuccess(
        `Đã gửi KQSH phiên bản ${response.version}. ` +
          "Xác nhận đầy đủ trước đó (nếu có) đã mất hiệu lực."
      );

      setUploadSchoolId(null);
      setUploadFile(null);
      setConfirmed(false);

      setReload((value) => value + 1);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmCompleteSet() {
    if (
      !accessToken ||
      !details ||
      !isPc08 ||
      !confirmed ||
      !details.canConfirm ||
      saving
    ) {
      return;
    }

    setSaving(true);
    resetMessage();

    try {
      await confirmPc08FinalResults(
        accessToken,
        details.session.id,
        confirmationNote
      );

      setSuccess(
        "Đã xác nhận gửi đầy đủ KQSH cho các CSĐT. " +
          "SUPER_ADMIN có thể bắt đầu phê duyệt bộ file."
      );

      setConfirmed(false);
      setReload((value) => value + 1);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function download(item: Pc08FinalResultDelivery) {
    if (!accessToken || saving) return;

    setSaving(true);
    setError("");

    try {
      await downloadPc08FinalResult(accessToken, item.id, item.originalName);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function review(
    item: Pc08FinalResultDelivery,
    action: "approve" | "reject",
    reason?: string
  ) {
    if (!accessToken || !isAdmin || !details?.confirmationValid || saving) {
      return;
    }

    setSaving(true);
    resetMessage();

    try {
      const response = await reviewPc08FinalResult(
        accessToken,
        item.id,
        action,
        reason
      );

      setSuccess(
        response.message ||
          (action === "approve"
            ? `Đã duyệt KQSH của ${item.schoolName}.`
            : `Đã từ chối KQSH của ${item.schoolName}.`)
      );

      setRejectTarget(null);
      setRejectionReason("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!authorized) return null;

  const completed = Boolean(details?.session.completedAt);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {isAdmin
            ? "Phê duyệt KQSH cuối cùng từ PC08"
            : "Trả KQSH cho các cơ sở đào tạo"}
        </Typography>

        <Typography color="text.secondary">
          {isAdmin
            ? "Kiểm tra xác nhận đầy đủ của IT, phê duyệt các file và phát hành kết quả cho CSĐT."
            : "Gửi KQSH cuối cùng theo từng CSĐT, theo dõi xử lý và xác nhận đã gửi đầy đủ."}
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

      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          sx={{ spacing: 2, alignItems: { xs: "stretch", md: "center" } }}
        >
          <TextField
            select
            fullWidth
            size="small"
            label="Kỳ sát hạch"
            value={sessionId}
            disabled={loadingSessions || saving}
            onChange={(event) => {
              resetMessage();
              setSessionId(event.target.value);
            }}
          >
            <MenuItem value="">Chọn kỳ sát hạch</MenuItem>

            {sessions.map((item) => (
              <MenuItem key={item.id} value={String(item.id)}>
                {formatSession(item)}
              </MenuItem>
            ))}
          </TextField>

          <Button
            variant="outlined"
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshOutlined />
            }
            disabled={!sessionId || loading || saving}
            onClick={() => setReload((value) => value + 1)}
          >
            Tải lại
          </Button>
        </Stack>

        {isPc08 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 1.5, display: "block" }}
          >
            Chỉ các kỳ có KQSH ban đầu đã duyệt và được phân công cho tài khoản
            IT của bạn mới mở được chi tiết.
          </Typography>
        )}
      </Card>

      {loading && (
        <Box sx={{ py: 3, textAlign: "center" }}>
          <CircularProgress size={25} />
        </Box>
      )}

      {!loading && details && (
        <>
          <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{
                  spacing: 1.5,
                  alignItems: {
                    xs: "flex-start",
                    sm: "center",
                  },
                  justifyContent: "space-between",
                }}
              >
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Kỳ {details.session.officialCode || details.session.code}
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Tiến độ xử lý KQSH cuối cùng
                  </Typography>
                </Box>

                <Chip
                  color={
                    completed
                      ? "success"
                      : details.confirmationValid
                      ? "info"
                      : "warning"
                  }
                  label={
                    completed
                      ? "Đã kết thúc kỳ"
                      : details.confirmationValid
                      ? "IT đã xác nhận đủ file"
                      : "Chưa có xác nhận hợp lệ"
                  }
                />
              </Stack>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(5, minmax(0, 1fr))",
                  },
                  gap: 1.5,
                }}
              >
                {[
                  ["CSĐT", summary.total],
                  ["Đã upload", summary.uploaded],
                  ["Chờ duyệt", summary.pending],
                  ["Đã duyệt", summary.approved],
                  ["Thiếu file", summary.missing],
                ].map(([label, value]) => (
                  <Box
                    key={String(label)}
                    sx={{
                      p: 1.5,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>

                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {summary.rejected > 0 && (
                <Alert severity="error">
                  Có {summary.rejected} file bị từ chối. IT cần gửi lại file và
                  xác nhận đầy đủ lần nữa.
                </Alert>
              )}

              {details.state?.confirmedAt && (
                <Alert
                  severity={details.confirmationValid ? "success" : "warning"}
                >
                  Xác nhận IT: {formatPc08ResultDate(details.state.confirmedAt)}
                  {" · "}
                  Người xác nhận #{details.state.confirmedByUserId}
                  {" · "}
                  {details.confirmationValid
                    ? "Còn hiệu lực"
                    : "Đã mất hiệu lực"}
                  {details.state.confirmationNote
                    ? ` · ${details.state.confirmationNote}`
                    : ""}
                </Alert>
              )}

              {details.state?.publishedAt && (
                <Alert severity="success">
                  Bộ KQSH đã phát hành lúc{" "}
                  {formatPc08ResultDate(details.state.publishedAt)}.
                </Alert>
              )}
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Danh sách CSĐT nhận KQSH
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Danh sách được lấy từ thí sinh thực tế thuộc kỳ sát hạch.
              </Typography>
            </Box>

            <TableContainer>
              <Table size="small" sx={{ minWidth: 1050 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>CSĐT</TableCell>
                    <TableCell>Thí sinh</TableCell>
                    <TableCell>File hiện tại</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {details.schools.map((school) => {
                    const delivery = deliveryBySchool.get(school.id);

                    const mayUpload =
                      isPc08 &&
                      !completed &&
                      (!delivery ||
                        delivery.status === "pending" ||
                        delivery.status === "rejected");

                    const mayReview =
                      isAdmin &&
                      !completed &&
                      details.confirmationValid &&
                      delivery?.status === "pending";

                    return (
                      <TableRow key={school.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {school.name}
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            {school.code}
                          </Typography>
                        </TableCell>

                        <TableCell>{school.candidateCount}</TableCell>

                        <TableCell>
                          {delivery ? (
                            <Stack spacing={0.5}>
                              <Typography
                                variant="body2"
                                sx={{
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {delivery.originalName}
                              </Typography>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Phiên bản {delivery.currentVersion}
                                {" · "}
                                {formatPc08ResultSize(delivery.sizeBytes)}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Chưa có file
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          {delivery ? (
                            <Stack spacing={0.5}>
                              <Chip
                                size="small"
                                color={deliveryColor(delivery.status)}
                                label={deliveryLabel(delivery.status)}
                              />

                              {delivery.rejectionReason && (
                                <Typography variant="caption" color="error">
                                  {delivery.rejectionReason}
                                </Typography>
                              )}
                            </Stack>
                          ) : (
                            <Chip
                              size="small"
                              variant="outlined"
                              label="Chưa gửi"
                            />
                          )}
                        </TableCell>

                        <TableCell align="right">
                          <Stack
                            direction="row"
                            sx={{ spacing: 0.5, justifyContent: "flex-end" }}
                          >
                            {delivery && (
                              <Button
                                size="small"
                                startIcon={<DownloadOutlined />}
                                disabled={saving}
                                onClick={() => void download(delivery)}
                              >
                                Tải
                              </Button>
                            )}

                            {mayUpload && (
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<UploadFileOutlined />}
                                disabled={saving}
                                onClick={() => {
                                  setUploadSchoolId(school.id);
                                  setUploadFile(null);
                                }}
                              >
                                {delivery ? "Thay file" : "Upload"}
                              </Button>
                            )}

                            {mayReview && delivery && (
                              <>
                                <Button
                                  size="small"
                                  color="success"
                                  startIcon={<CheckCircleOutlineOutlined />}
                                  disabled={saving}
                                  onClick={() =>
                                    void review(delivery, "approve")
                                  }
                                >
                                  Duyệt
                                </Button>

                                <Button
                                  size="small"
                                  color="error"
                                  disabled={saving}
                                  onClick={() => {
                                    setRejectTarget({ delivery });
                                    setRejectionReason("");
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

                  {details.schools.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        Chưa có CSĐT nào được xác định trong kỳ này.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          {isPc08 && !completed && (
            <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Xác nhận đã gửi đầy đủ KQSH
                </Typography>

                {summary.missing > 0 && (
                  <Alert severity="warning">
                    Còn thiếu file cho {summary.missing} CSĐT. Vui lòng upload
                    đầy đủ trước khi xác nhận.
                  </Alert>
                )}

                {summary.rejected > 0 && (
                  <Alert severity="error">
                    Có file đã bị SUPER_ADMIN từ chối. Vui lòng thay các file đó
                    trước khi xác nhận lại.
                  </Alert>
                )}

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      disabled={saving || !details.canConfirm || completed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                  }
                  label={
                    "Tôi xác nhận đã gửi đầy đủ file KQSH " +
                    "cuối cùng cho tất cả CSĐT thuộc kỳ sát hạch này."
                  }
                />

                <TextField
                  label="Ghi chú xác nhận"
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  value={confirmationNote}
                  disabled={saving}
                  onChange={(event) => setConfirmationNote(event.target.value)}
                  slotProps={{
                    htmlInput: { maxLength: 2000 },
                  }}
                />

                <Box>
                  <Button
                    variant="contained"
                    startIcon={<CheckCircleOutlineOutlined />}
                    disabled={saving || !confirmed || !details.canConfirm}
                    onClick={() => void confirmCompleteSet()}
                  >
                    {saving ? "Đang xử lý..." : "Xác nhận đã gửi đầy đủ"}
                  </Button>
                </Box>

                <Typography variant="caption" color="text.secondary">
                  Khi một file bị từ chối hoặc thay phiên bản, xác nhận trước đó
                  sẽ không còn hiệu lực. Kỳ chỉ kết thúc khi SUPER_ADMIN duyệt
                  toàn bộ.
                </Typography>
              </Stack>
            </Card>
          )}

          {isAdmin && !completed && !details.confirmationValid && (
            <Alert severity="warning">
              SUPER_ADMIN chưa thể duyệt KQSH cuối cùng vì IT PC08 chưa có xác
              nhận đầy đủ hợp lệ đối với bộ file hiện tại.
            </Alert>
          )}
        </>
      )}

      <Dialog
        open={uploadSchoolId !== null}
        onClose={() => {
          if (!saving) {
            setUploadSchoolId(null);
            setUploadFile(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Gửi KQSH cuối cùng
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2">
              CSĐT:{" "}
              <strong>
                {details?.schools.find((item) => item.id === uploadSchoolId)
                  ?.name ?? "—"}
              </strong>
            </Typography>

            <Alert severity="info">
              File XML phải đúng MAKYSH và chứa toàn bộ thí sinh thuộc CSĐT này,
              không được chứa thí sinh của CSĐT khác.
            </Alert>

            <Button
              component="label"
              variant="outlined"
              startIcon={<CloudUploadOutlined />}
              disabled={saving}
            >
              {uploadFile ? uploadFile.name : "Chọn file KQSH XML"}

              <input
                hidden
                type="file"
                accept=".xml"
                onChange={(event) => {
                  setUploadFile(event.target.files?.[0] ?? null);
                }}
              />
            </Button>

            {uploadFile && (
              <Typography variant="caption" color="text.secondary">
                {formatPc08ResultSize(uploadFile.size)}
              </Typography>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            disabled={saving}
            onClick={() => {
              setUploadSchoolId(null);
              setUploadFile(null);
            }}
          >
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={saving || !uploadFile}
            onClick={() => void upload()}
          >
            {saving ? "Đang gửi..." : "Gửi file"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={rejectTarget !== null}
        onClose={() => {
          if (!saving) setRejectTarget(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Từ chối KQSH cuối cùng
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2">
              CSĐT: <strong>{rejectTarget?.delivery.schoolName}</strong>
            </Typography>

            <Typography variant="body2" color="text.secondary">
              {rejectTarget?.delivery.originalName}
            </Typography>

            <TextField
              label="Lý do từ chối"
              required
              multiline
              minRows={3}
              fullWidth
              value={rejectionReason}
              disabled={saving}
              onChange={(event) => setRejectionReason(event.target.value)}
              slotProps={{
                htmlInput: { maxLength: 2000 },
              }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={saving} onClick={() => setRejectTarget(null)}>
            Hủy
          </Button>

          <Button
            variant="contained"
            color="error"
            disabled={saving || !rejectionReason.trim()}
            onClick={() => {
              if (!rejectTarget) return;

              void review(rejectTarget.delivery, "reject", rejectionReason);
            }}
          >
            Xác nhận từ chối
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
