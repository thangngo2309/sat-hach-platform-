"use client";

import { useCallback, useEffect, useState } from "react";

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
  FormControlLabel,
  MenuItem,
  Pagination,
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
  AssignmentOutlined,
  CalendarMonthOutlined,
  CancelOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  assignIndependentStudents,
  cancelIndependentAssignment,
  getIndependentAssignmentDetail,
  getIndependentSecretaries,
  listIndependentAssignments,
  searchIndependentCandidates,
  type IndependentAssignment,
  type IndependentAssignmentDetail,
  type IndependentCandidate,
  type SecretaryOption,
} from "@/lib/independent-exam-assignments";

function showValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function shortDate(date: string) {
  if (!date) return "—";

  const parts = date.split("-");

  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
}

const DOCUMENT_LABELS: Record<string, string> = {
  health_certificate: "Giấy chứng nhận sức khỏe",
  driving_experience: "Bản khai thời gian và số km lái xe an toàn",
  diploma: "Bản sao văn bằng, chứng chỉ",
  current_license_copy: "Bản sao GPLX hiện có",
  training_completion_certificate: "Giấy xác nhận hoàn thành khóa đào tạo",
  exam_result_summary: "Biên bản tổng hợp kết quả sát hạch",
  photo_3x4: "Ảnh thẻ 3x4",
  other: "Giấy tờ khác",
};

type IntakeDocument = {
  type: string;
  checked: boolean;
  note?: string;
};

function parseIntakeDocuments(value: unknown): IntakeDocument[] {
  let parsed: unknown = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (item): item is IntakeDocument =>
      typeof item === "object" &&
      item !== null &&
      typeof item.type === "string" &&
      typeof item.checked === "boolean"
  );
}

function IntakeDocuments({ documents }: { documents: unknown }) {
  const items = parseIntakeDocuments(documents);

  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Chưa khai báo thành phần giấy tờ.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      {items.map((item, index) => (
        <Stack
          key={`${item.type}-${index}`}
          direction={{ xs: "column", sm: "row" }}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1.5,
            px: 1.5,
            py: 1,
            spacing: 1,
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {DOCUMENT_LABELS[item.type] ?? item.type}
            </Typography>

            {item.note?.trim() && (
              <Typography variant="caption" color="text.secondary">
                Ghi chú: {item.note}
              </Typography>
            )}
          </Box>

          <Chip
            size="small"
            variant="outlined"
            color={item.checked ? "success" : "default"}
            label={item.checked ? "Đã có" : "Chưa có"}
          />
        </Stack>
      ))}
    </Stack>
  );
}

type ExistingLicense = {
  number: string;
  licenseClass: string;
  issuedDate: string;
  issuedBy: string;
};

function parseExistingLicenses(value: unknown): ExistingLicense[] {
  let parsed: unknown = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (item): item is ExistingLicense =>
      typeof item === "object" &&
      item !== null &&
      typeof item.number === "string"
  );
}

function formatLicenseDate(value: string): string {
  if (!value) return "—";

  const date = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

function IntakeExistingLicenses({ licenses }: { licenses: unknown }) {
  const items = parseExistingLicenses(licenses);

  if (!items.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Chưa có thông tin giấy phép lái xe.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {items.map((license, index) => (
        <Card
          key={`${license.number}-${index}`}
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Giấy phép lái xe {index + 1}
          </Typography>

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
              ["Số GPLX", license.number],
              ["Hạng GPLX", license.licenseClass],
              ["Ngày cấp", formatLicenseDate(license.issuedDate)],
              ["Nơi cấp", license.issuedBy],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.25 }}
                >
                  {label}
                </Typography>

                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    overflowWrap: "anywhere",
                  }}
                >
                  {value || "—"}
                </Typography>
              </Box>
            ))}
          </Box>
        </Card>
      ))}
    </Stack>
  );
}

export function IndependentExamWorkspace() {
  const { user, accessToken } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";
  const isSecretary = user?.role === "exam_secretary";
  const allowed = isSuperAdmin || isSecretary;

  const [secretaries, setSecretaries] = useState<SecretaryOption[]>([]);

  const [candidates, setCandidates] = useState<IndependentCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [appliedCandidateSearch, setAppliedCandidateSearch] = useState("");

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [secretaryId, setSecretaryId] = useState("");
  const [examDate, setExamDate] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [note, setNote] = useState("");

  const [rows, setRows] = useState<IndependentAssignment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterSecretary, setFilterSecretary] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const [cancelTarget, setCancelTarget] =
    useState<IndependentAssignment | null>(null);

  const [cancelReason, setCancelReason] = useState("");

  const [detail, setDetail] = useState<IndependentAssignmentDetail | null>(
    null
  );

  const [loading, setLoading] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!accessToken || !isSuperAdmin) return;

    void getIndependentSecretaries(accessToken)
      .then(setSecretaries)
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : "Không tải được danh sách thư ký."
        )
      );
  }, [accessToken, isSuperAdmin]);

  const loadCandidates = useCallback(async () => {
    if (!accessToken || !isSuperAdmin) return;

    setLoadingCandidates(true);

    try {
      const result = await searchIndependentCandidates(accessToken, {
        page: candidatePage,
        limit: 20,
        search: appliedCandidateSearch,
      });

      setCandidates(result.data);
      setCandidateTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được danh sách thí sinh."
      );
    } finally {
      setLoadingCandidates(false);
    }
  }, [
    accessToken,
    isSuperAdmin,
    candidatePage,
    appliedCandidateSearch,
    reload,
  ]);

  const loadAssignments = useCallback(async () => {
    if (!accessToken || !allowed) return;

    setLoading(true);

    try {
      const result = await listIndependentAssignments(accessToken, {
        page,
        limit: 20,
        search: appliedSearch,
        examDate: filterDate || undefined,
        secretaryUserId:
          isSuperAdmin && filterSecretary ? Number(filterSecretary) : undefined,
        status: isSuperAdmin && showCancelled ? "cancelled" : "assigned",
      });

      setRows(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được lịch phân công."
      );
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    allowed,
    page,
    appliedSearch,
    filterDate,
    filterSecretary,
    isSuperAdmin,
    showCancelled,
    reload,
  ]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  function toggleStudent(id: number) {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );
  }

  async function assign() {
    if (
      !accessToken ||
      !isSuperAdmin ||
      saving ||
      !selectedIds.length ||
      !secretaryId ||
      !examDate
    ) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await assignIndependentStudents(accessToken, {
        studentIds: selectedIds,
        secretaryUserId: Number(secretaryId),
        examDate,
        examSessionCode: sessionCode,
        note,
      });

      setSuccess(
        `Đã phân công ${result.total} thí sinh vào ngày ` +
          `${shortDate(result.examDate)}.`
      );

      setSelectedIds([]);
      setReload((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể phân công thí sinh."
      );
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: number) {
    if (!accessToken) return;

    setLoadingDetail(true);
    setError("");

    try {
      setDetail(await getIndependentAssignmentDetail(accessToken, id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được chi tiết hồ sơ."
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  async function confirmCancel() {
    if (!accessToken || !isSuperAdmin || !cancelTarget || saving) {
      return;
    }

    const reason = cancelReason.trim();

    if (!reason) {
      setError("Vui lòng nhập lý do hủy phân công.");
      return;
    }

    if (reason.length > 2000) {
      setError("Lý do hủy không được vượt quá 2000 ký tự.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await cancelIndependentAssignment(accessToken, cancelTarget.id, reason);

      setSuccess(`Đã hủy phân công của ${cancelTarget.fullName}.`);

      setCancelTarget(null);
      setCancelReason("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể hủy phân công.");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <Alert severity="error">
        Tài khoản không có quyền truy cập chức năng này.
      </Alert>
    );
  }

  const pages = Math.max(1, Math.ceil(total / 20));
  const candidatePages = Math.max(1, Math.ceil(candidateTotal / 20));

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {isSuperAdmin
            ? "Phân công thí sinh tự do"
            : "Thí sinh tự do được phụ trách"}
        </Typography>
        <Typography color="text.secondary">
          {isSuperAdmin
            ? "Sắp xếp ngày sát hạch và thư ký phụ trách hồ sơ."
            : "Xem lịch thi và tra cứu thông tin thí sinh được phân công."}
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

      {isSuperAdmin && (
        <Card variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              <AssignmentOutlined sx={{ mr: 1, verticalAlign: "middle" }} />
              Chọn thí sinh để phân công
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Tìm tên, CCCD, mã hồ sơ"
                value={candidateSearch}
                onChange={(event) => setCandidateSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setCandidatePage(1);
                    setAppliedCandidateSearch(candidateSearch);
                  }
                }}
              />
              <Button
                variant="outlined"
                startIcon={<SearchOutlined />}
                onClick={() => {
                  setCandidatePage(1);
                  setAppliedCandidateSearch(candidateSearch);
                }}
              >
                Tìm
              </Button>
            </Stack>

            <TableContainer sx={{ maxHeight: 340 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={
                          candidates.length > 0 &&
                          candidates.every((item) =>
                            selectedIds.includes(item.id)
                          )
                        }
                        indeterminate={
                          candidates.some((item) =>
                            selectedIds.includes(item.id)
                          ) &&
                          !candidates.every((item) =>
                            selectedIds.includes(item.id)
                          )
                        }
                        onChange={(_, checked) => {
                          setSelectedIds((previous) => {
                            const ids = candidates.map((item) => item.id);
                            return checked
                              ? [...new Set([...previous, ...ids])]
                              : previous.filter((id) => !ids.includes(id));
                          });
                        }}
                        slotProps={{
                          input: { "aria-label": "Chọn tất cả trang" },
                        }}
                      />
                    </TableCell>
                    <TableCell>Thí sinh</TableCell>
                    <TableCell>CCCD</TableCell>
                    <TableCell>Mã hồ sơ</TableCell>
                    <TableCell align="right">Lịch đã gán</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {candidates.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleStudent(item.id)}
                          slotProps={{
                            input: {
                              "aria-label": `Chọn ${item.fullName}`,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>{item.fullName}</TableCell>
                      <TableCell>{item.identityNumber || "—"}</TableCell>
                      <TableCell>
                        {item.registrationCode || `#${item.id}`}
                      </TableCell>
                      <TableCell align="right">
                        {item.activeAssignmentCount}
                      </TableCell>
                    </TableRow>
                  ))}

                  {!loadingCandidates && !candidates.length && (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        Không tìm thấy thí sinh.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Chip label={`Đã chọn ${selectedIds.length} thí sinh`} />
              <Pagination
                size="small"
                page={candidatePage}
                count={candidatePages}
                onChange={(_, next) => setCandidatePage(next)}
              />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                select
                fullWidth
                required
                size="small"
                label="Thư ký phụ trách"
                value={secretaryId}
                onChange={(event) => setSecretaryId(event.target.value)}
              >
                <MenuItem value="">Chọn thư ký</MenuItem>
                {secretaries
                  .filter((item) => item.status === "active")
                  .map((item) => (
                    <MenuItem key={item.id} value={String(item.id)}>
                      {item.fullName} (@{item.username})
                    </MenuItem>
                  ))}
              </TextField>

              <TextField
                fullWidth
                required
                size="small"
                type="date"
                label="Ngày sát hạch"
                value={examDate}
                onChange={(event) => setExamDate(event.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: {
                    min: new Date(
                      Date.now() - new Date().getTimezoneOffset() * 60000
                    )
                      .toISOString()
                      .slice(0, 10),
                  },
                }}
              />
            </Stack>

            <TextField
              size="small"
              fullWidth
              label="Mã kỳ sát hạch (không bắt buộc)"
              value={sessionCode}
              onChange={(event) => setSessionCode(event.target.value)}
            />

            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              label="Ghi chú phân công"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

            <Alert severity="info">
              Nếu thí sinh đã được phân vào đúng ngày này, hệ thống sẽ cập nhật
              thư ký phụ trách và lưu lịch sử thay đổi. Những ngày thi khác được
              giữ nguyên.
            </Alert>

            <Box>
              <Button
                variant="contained"
                startIcon={<CalendarMonthOutlined />}
                disabled={
                  saving || !selectedIds.length || !secretaryId || !examDate
                }
                onClick={() => void assign()}
              >
                {saving ? "Đang phân công..." : "Xác nhận phân công"}
              </Button>
            </Box>
          </Stack>
        </Card>
      )}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between", spacing: 1 }}
          >
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {isSuperAdmin ? "Danh sách phân công" : "Lịch và hồ sơ phụ trách"}
            </Typography>

            <Button
              startIcon={
                loading ? <CircularProgress size={16} /> : <RefreshOutlined />
              }
              onClick={() => setReload((value) => value + 1)}
              disabled={loading}
            >
              Tải lại
            </Button>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Tìm thí sinh"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setPage(1);
                  setAppliedSearch(search);
                }
              }}
              sx={{ flex: 2 }}
            />

            <TextField
              size="small"
              type="date"
              label="Lọc ngày thi"
              value={filterDate}
              onChange={(event) => {
                setFilterDate(event.target.value);
                setPage(1);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1 }}
            />

            {isSuperAdmin && (
              <TextField
                select
                size="small"
                label="Lọc thư ký"
                value={filterSecretary}
                onChange={(event) => {
                  setFilterSecretary(event.target.value);
                  setPage(1);
                }}
                sx={{ flex: 1 }}
              >
                <MenuItem value="">Tất cả thư ký</MenuItem>
                {secretaries.map((secretary) => (
                  <MenuItem key={secretary.id} value={String(secretary.id)}>
                    {secretary.fullName}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Button
              variant="outlined"
              startIcon={<SearchOutlined />}
              onClick={() => {
                setPage(1);
                setAppliedSearch(search);
              }}
            >
              Tìm kiếm
            </Button>
          </Stack>

          {isSuperAdmin && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={showCancelled}
                  onChange={(_, checked) => {
                    setShowCancelled(checked);
                    setPage(1);
                  }}
                />
              }
              label="Xem các phân công đã hủy"
            />
          )}
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Thí sinh</TableCell>
                <TableCell>CCCD</TableCell>
                <TableCell>Ngày thi</TableCell>
                <TableCell>Mã kỳ</TableCell>
                <TableCell>Thư ký</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Lý do hủy</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }} variant="body2">
                      {item.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.registrationCode || `#${item.studentId}`}
                    </Typography>
                  </TableCell>
                  <TableCell>{item.identityNumber || "—"}</TableCell>
                  <TableCell>{shortDate(item.examDate)}</TableCell>
                  <TableCell>{item.examSessionCode || "—"}</TableCell>
                  <TableCell>{item.secretaryName}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={item.status === "assigned" ? "success" : "default"}
                      label={
                        item.status === "assigned" ? "Đã phân công" : "Đã hủy"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {item.status === "cancelled" ? (
                      <Stack spacing={0.5}>
                        <Typography
                          variant="body2"
                          sx={{ overflowWrap: "anywhere" }}
                        >
                          {item.cancellationReason || "Không có lý do"}
                        </Typography>

                        {item.cancelledByName && (
                          <Typography variant="caption" color="text.secondary">
                            Người hủy: {item.cancelledByName}
                          </Typography>
                        )}

                        {item.cancelledAt && (
                          <Typography variant="caption" color="text.secondary">
                            {new Date(item.cancelledAt).toLocaleString("vi-VN")}
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack
                      direction="row"
                      sx={{ spacing: 0.5, justifyContent: "flex-end" }}
                    >
                      <Button
                        size="small"
                        startIcon={<VisibilityOutlined />}
                        disabled={loadingDetail}
                        onClick={() => void openDetail(item.id)}
                      >
                        Hồ sơ
                      </Button>

                      {isSuperAdmin && item.status === "assigned" && (
                        <Button
                          size="small"
                          color="error"
                          startIcon={<CancelOutlined />}
                          disabled={saving}
                          onClick={() => {
                            setCancelTarget(item);
                            setCancelReason("");
                            setError("");
                          }}
                        >
                          Hủy
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && !rows.length && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    Không có phân công phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack
          direction="row"
          sx={{ p: 2, justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="body2" color="text.secondary">
            Tổng cộng {total} phân công
          </Typography>
          <Pagination
            page={page}
            count={pages}
            onChange={(_, next) => setPage(next)}
            size="small"
          />
        </Stack>
      </Card>

      <Dialog
        open={detail !== null}
        onClose={() => setDetail(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Hồ sơ thí sinh: {detail?.fullName}
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
                  ["Họ và tên", detail.fullName],
                  ["CCCD", detail.identityNumber],
                  ["Mã hồ sơ", detail.registrationCode],
                  ["Ngày sinh", detail.dateOfBirth],
                  ["Ngày thi", shortDate(detail.examDate)],
                  ["Mã kỳ", detail.examSessionCode],
                  ["Thường trú", detail.permanentAddress],
                  ["Chỗ ở hiện tại", detail.currentAddress],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography variant="body2">{showValue(value)}</Typography>
                  </Box>
                ))}
              </Box>

              {detail.note && (
                <Alert severity="info">Ghi chú phân công: {detail.note}</Alert>
              )}

              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Thông tin tiếp nhận hồ sơ
              </Typography>

              {detail.intakes.map((intake) => (
                <Card
                  key={intake.id}
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 2 }}
                >
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Nhân viên tiếp nhận:{" "}
                      <strong>{intake.intakeEmployeeName || "—"}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Loại hồ sơ: {showValue(intake.applicationType)}
                    </Typography>
                    <Typography variant="body2">
                      Hạng sát hạch: {showValue(intake.requestedLicenseClass)}
                    </Typography>
                    <Typography variant="body2">
                      Hạng đào tạo: {showValue(intake.trainingLicenseClass)}
                    </Typography>
                    <Typography variant="body2">
                      Nội dung sát hạch: {showValue(intake.examinationContent)}
                    </Typography>
                    <Typography variant="body2">
                      Đơn vị cấp giấy xác nhận:{" "}
                      {showValue(intake.certificateIssuer)}
                    </Typography>
                    <Typography variant="body2">
                      Ngày cấp CCCD: {showValue(intake.identityIssuedDate)}
                    </Typography>
                    <Typography variant="body2">
                      Ghi chú: {showValue(intake.note)}
                    </Typography>

                    <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                      Thành phần giấy tờ
                    </Typography>

                    <IntakeDocuments documents={intake.documents} />

                    <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
                      Giấy phép lái xe đã có
                    </Typography>

                    <IntakeExistingLicenses
                      licenses={intake.existingLicenses}
                    />
                  </Stack>
                </Card>
              ))}

              {!detail.intakes.length && (
                <Alert severity="warning">
                  Không tìm thấy bản ghi tiếp nhận hồ sơ.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setDetail(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onClose={() => {
          if (!saving) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Hủy phân công thí sinh
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Việc hủy phân công sẽ được ghi nhận vào lịch sử hệ thống.
            </Alert>

            {cancelTarget && (
              <Box>
                <Typography variant="body2">
                  Thí sinh: <strong>{cancelTarget.fullName}</strong>
                </Typography>

                <Typography variant="body2">
                  Ngày thi: {shortDate(cancelTarget.examDate)}
                </Typography>

                <Typography variant="body2">
                  Thư ký: {cancelTarget.secretaryName}
                </Typography>
              </Box>
            )}

            <TextField
              autoFocus
              required
              fullWidth
              multiline
              minRows={3}
              maxRows={6}
              label="Lý do hủy phân công"
              placeholder="Nhập lý do hủy..."
              value={cancelReason}
              disabled={saving}
              onChange={(event) => setCancelReason(event.target.value)}
              error={cancelReason.length > 2000}
              helperText={`${cancelReason.length}/2000 ký tự`}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            disabled={saving}
            onClick={() => {
              setCancelTarget(null);
              setCancelReason("");
            }}
          >
            Đóng
          </Button>

          <Button
            variant="contained"
            color="error"
            disabled={
              saving ||
              !cancelReason.trim() ||
              cancelReason.trim().length > 2000
            }
            onClick={() => void confirmCancel()}
          >
            {saving ? "Đang hủy..." : "Xác nhận hủy"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
