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
  AssignmentIndOutlined,
  CheckCircleOutlineOutlined,
  EditOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  assignExamSessionSecretary,
  completeExamSession,
  getSecretaryExamSession,
  listExamSecretaries,
  listSecretaryExamSessions,
  unassignExamSessionSecretary,
  updateExamSessionTrackingCode,
  type ExamSessionSecretary,
  type ExamSessionSecretaryDetail,
  type ExamSessionSecretaryOption,
} from "@/lib/examination-session-secretaries";
import { ExamSessionScanDialog } from "./ExamSessionScanDialog";

function dateText(value: string | null): string {
  if (!value) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export function ExamSessionSecretaryWorkspace() {
  const { user, accessToken } = useAuth();

  const isPc08 = user?.role === "pc08_staff";
  const isSecretary = user?.role === "exam_secretary";

  const allowed = isPc08 || isSecretary || user?.role === "super_admin";

  const [rows, setRows] = useState<ExamSessionSecretary[]>([]);
  const [secretaries, setSecretaries] = useState<ExamSessionSecretaryOption[]>(
    []
  );

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  const [assignTarget, setAssignTarget] = useState<ExamSessionSecretary | null>(
    null
  );

  const [trackingTarget, setTrackingTarget] =
    useState<ExamSessionSecretary | null>(null);

  const [scanTarget, setScanTarget] = useState<ExamSessionSecretary | null>(
    null
  );

  const [detail, setDetail] = useState<ExamSessionSecretaryDetail | null>(null);

  const [secretaryId, setSecretaryId] = useState("");
  const [note, setNote] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!accessToken || !allowed) {
      setRows([]);
      return;
    }

    setLoading(true);

    try {
      const data = await listSecretaryExamSessions(accessToken, search);
      setRows(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được danh sách kỳ sát hạch."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, allowed, search, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accessToken || !isPc08) return;

    let active = true;

    void listExamSecretaries(accessToken)
      .then((data) => {
        if (active) setSecretaries(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Không tải được danh sách thư ký."
          );
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, isPc08]);

  async function viewDetail(id: number) {
    if (!accessToken) return;

    setError("");

    try {
      const result = await getSecretaryExamSession(accessToken, id);
      setDetail(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được chi tiết kỳ sát hạch."
      );
    }
  }

  function openAssign(item: ExamSessionSecretary) {
    setAssignTarget(item);
    setSecretaryId(item.secretaryUserId ? String(item.secretaryUserId) : "");
    setNote(item.assignmentNote ?? "");
  }

  async function saveAssignment() {
    if (!accessToken || !isPc08 || !assignTarget || !secretaryId || saving) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await assignExamSessionSecretary(
        accessToken,
        assignTarget.id,
        Number(secretaryId),
        note
      );

      setAssignTarget(null);
      setSuccess("Đã cập nhật thư ký phụ trách kỳ sát hạch.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể phân công thư ký."
      );
    } finally {
      setSaving(false);
    }
  }

  async function revoke(item: ExamSessionSecretary) {
    if (!accessToken || !isPc08 || saving) return;

    if (!window.confirm(`Thu hồi phân công thư ký của kỳ ${item.code}?`)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await unassignExamSessionSecretary(accessToken, item.id);
      setSuccess("Đã thu hồi phân công.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thu hồi phân công."
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmComplete(item: ExamSessionSecretary) {
    if (!accessToken || !isPc08 || saving) return;

    if (!window.confirm(`Xác nhận kỳ ${item.code} đã tổ chức xong?`)) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await completeExamSession(accessToken, item.id);
      setSuccess("Đã xác nhận kỳ sát hạch hoàn tất.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xác nhận kỳ đã hoàn tất."
      );
    } finally {
      setSaving(false);
    }
  }

  function openTracking(item: ExamSessionSecretary) {
    setTrackingTarget(item);
    setTrackingCode(item.trackingCode ?? "");
  }

  async function saveTracking() {
    if (
      !accessToken ||
      !isSecretary ||
      !trackingTarget ||
      !trackingCode.trim() ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateExamSessionTrackingCode(
        accessToken,
        trackingTarget.id,
        trackingCode.trim()
      );

      setTrackingTarget(null);
      setSuccess("Đã lưu mã theo dõi kỳ sát hạch.");
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể cập nhật mã theo dõi."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {isPc08
            ? "Phân công thư ký theo kỳ sát hạch"
            : isSecretary
            ? "Kỳ sát hạch tôi phụ trách"
            : "Theo dõi phân công thư ký"}
        </Typography>

        <Typography color="text.secondary">
          {isPc08
            ? "Phân công, điều chỉnh thư ký và xác nhận kỳ sát hạch đã tổ chức xong."
            : isSecretary
            ? "Tra cứu kỳ được giao và bổ sung mã theo dõi sau kỳ thi."
            : "Theo dõi các kỳ sát hạch và lịch sử phân công."}
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

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{ p: 2 }}
        >
          <TextField
            fullWidth
            size="small"
            label="Tìm mã kỳ, mã theo dõi, TTSH, thư ký"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setSearch(searchInput);
              }
            }}
          />

          <Button
            variant="outlined"
            startIcon={<SearchOutlined />}
            onClick={() => setSearch(searchInput)}
          >
            Tìm
          </Button>

          <Button
            variant="outlined"
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
          <Table size="small" sx={{ minWidth: 1050 }}>
            <TableHead>
              <TableRow>
                <TableCell>Kỳ sát hạch</TableCell>
                <TableCell>TTSH</TableCell>
                <TableCell>Ngày tổ chức</TableCell>
                <TableCell>Thư ký</TableCell>
                <TableCell>Mã theo dõi</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {item.code}
                    </Typography>

                    <Typography variant="caption" color="text.secondary">
                      #{item.id} · {item.candidateCount} thí sinh
                      {" · "}
                      {item.fileCount} file
                    </Typography>
                  </TableCell>

                  <TableCell>{item.centerName}</TableCell>

                  <TableCell>{dateText(item.examDate)}</TableCell>

                  <TableCell>
                    {item.secretaryName ?? "Chưa phân công"}
                  </TableCell>

                  <TableCell>{item.trackingCode || "—"}</TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      color={item.completedAt ? "success" : "warning"}
                      label={
                        item.completedAt ? "Đã tổ chức xong" : "Chưa hoàn tất"
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ justifyContent: "flex-end" }}
                    >
                      <Button
                        size="small"
                        startIcon={<VisibilityOutlined />}
                        onClick={() => void viewDetail(item.id)}
                      >
                        Chi tiết
                      </Button>

                      {isPc08 && (
                        <Button
                          size="small"
                          startIcon={<AssignmentIndOutlined />}
                          onClick={() => openAssign(item)}
                        >
                          Phân công
                        </Button>
                      )}

                      {isPc08 && item.secretaryUserId !== null && (
                        <Button
                          size="small"
                          color="error"
                          disabled={saving}
                          onClick={() => void revoke(item)}
                        >
                          Thu hồi
                        </Button>
                      )}

                      {isPc08 && !item.completedAt && (
                        <Button
                          size="small"
                          color="success"
                          startIcon={<CheckCircleOutlineOutlined />}
                          disabled={saving}
                          onClick={() => void confirmComplete(item)}
                        >
                          Hoàn tất
                        </Button>
                      )}

                      {isSecretary && item.completedAt && (
                        <Button
                          size="small"
                          startIcon={<EditOutlined />}
                          onClick={() => openTracking(item)}
                        >
                          Mã theo dõi
                        </Button>
                      )}

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setScanTarget(item)}
                      >
                        Hồ sơ scan
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    Không có kỳ sát hạch phù hợp.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog
        open={assignTarget !== null}
        onClose={() => !saving && setAssignTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Phân công thư ký
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Kỳ sát hạch: {assignTarget?.code}</Alert>

            <TextField
              select
              fullWidth
              required
              size="small"
              label="Thư ký phụ trách"
              value={secretaryId}
              disabled={saving}
              onChange={(event) => setSecretaryId(event.target.value)}
            >
              <MenuItem value="">Chọn thư ký</MenuItem>

              {secretaries.map((secretary) => (
                <MenuItem key={secretary.id} value={String(secretary.id)}>
                  {secretary.fullName} (@{secretary.username})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Ghi chú phân công"
              value={note}
              disabled={saving}
              onChange={(event) => setNote(event.target.value)}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={saving} onClick={() => setAssignTarget(null)}>
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={saving || !secretaryId}
            onClick={() => void saveAssignment()}
          >
            Lưu phân công
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={trackingTarget !== null}
        onClose={() => !saving && setTrackingTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Mã theo dõi kỳ sát hạch
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">Kỳ sát hạch: {trackingTarget?.code}</Alert>

            <TextField
              fullWidth
              required
              autoFocus
              label="Mã theo dõi"
              value={trackingCode}
              disabled={saving}
              onChange={(event) => setTrackingCode(event.target.value)}
              slotProps={{
                htmlInput: { maxLength: 150 },
              }}
              helperText={`${trackingCode.length}/150 ký tự`}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={saving} onClick={() => setTrackingTarget(null)}>
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={
              saving || !trackingCode.trim() || trackingCode.trim().length > 150
            }
            onClick={() => void saveTracking()}
          >
            Lưu mã theo dõi
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detail !== null}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Chi tiết kỳ sát hạch
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {detail && (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gap: 2,
                }}
              >
                {[
                  ["Mã kỳ", detail.code],
                  ["Mã tạm", detail.tempCode],
                  ["Mã chính thức", detail.officialCode],
                  ["Mã theo dõi", detail.trackingCode],
                  ["TTSH", detail.centerName],
                  ["Ngày sát hạch", dateText(detail.examDate)],
                  ["Thư ký", detail.secretaryName],
                  ["Người phân công", detail.assignedByName],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>

                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {value || "—"}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Lịch sử phân công thư ký
              </Typography>

              {detail.assignmentHistory.length === 0 ? (
                <Alert severity="info">Kỳ chưa có lịch sử phân công.</Alert>
              ) : (
                detail.assignmentHistory.map((item) => (
                  <Card
                    key={item.id}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2 }}
                  >
                    <Typography variant="body2">
                      <strong>{item.secretaryName}</strong>
                      {" · "}
                      {dateText(item.assignedAt)}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      Người phân công: {item.assignedByName}
                    </Typography>

                    {item.revokedAt && (
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ display: "block" }}
                      >
                        Đã thu hồi: {dateText(item.revokedAt)}
                      </Typography>
                    )}

                    {item.note && (
                      <Typography variant="caption" sx={{ display: "block" }}>
                        Ghi chú: {item.note}
                      </Typography>
                    )}
                  </Card>
                ))
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDetail(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>
      
      <ExamSessionScanDialog
        open={scanTarget !== null}
        sessionId={scanTarget?.id ?? null}
        sessionCode={scanTarget?.code ?? ""}
        completed={Boolean(scanTarget?.completedAt)}
        canUpload={isSecretary}
        accessToken={accessToken}
        onClose={() => setScanTarget(null)}
      />
    </Stack>
  );
}
