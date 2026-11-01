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
  AddOutlined,
  EditOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import type { UserStatus } from "@/lib/auth";

import {
  createOrganizationAccount,
  getOrganizationAccountOptions,
  listOrganizationAccounts,
  updateOrganizationAccount,
  type OrganizationAccount,
  type OrganizationOptions,
  type OrganizationRole,
} from "@/lib/organization-accounts";

type FormValues = {
  username: string;
  fullName: string;
  password: string;
  role: OrganizationRole;
  status: UserStatus;
  organizationId: string;
};

const EMPTY_FORM: FormValues = {
  username: "",
  fullName: "",
  password: "",
  role: "training_school",
  status: "active",
  organizationId: "",
};

const ROLE_LABELS: Record<OrganizationRole, string> = {
  training_school: "Cơ sở đào tạo",
  pc08_staff: "IT Phòng PC08",
  exam_center: "Trung tâm sát hạch",
  exam_secretary: "Thư ký sát hạch",
};

function organizationLabel(account: OrganizationAccount) {
  if (account.role === "training_school") {
    return (
      account.trainingSchoolName ??
      account.trainingSchoolCode ??
      "Chưa gắn CSĐT"
    );
  }

  if (account.role === "exam_center") {
    return (
      account.examinationCenterName ??
      account.examinationCenterCode ??
      "Chưa gắn TTSH"
    );
  }

  return "—";
}

export function OrganizationAccountsSection() {
  const { accessToken, user } = useAuth();

  const [rows, setRows] = useState<OrganizationAccount[]>([]);

  const [options, setOptions] = useState<OrganizationOptions>({
    trainingSchools: [],
    examinationCenters: [],
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);

  const [editing, setEditing] = useState<OrganizationAccount | null>(null);

  const [form, setForm] = useState<FormValues>({ ...EMPTY_FORM });

  const [formError, setFormError] = useState("");

  const authorized = user?.role === "super_admin";

  const load = useCallback(async () => {
    if (!accessToken || !authorized) return;

    setLoading(true);
    setError("");

    try {
      const [accounts, availableOptions] = await Promise.all([
        listOrganizationAccounts(accessToken),
        getOrganizationAccountOptions(accessToken),
      ]);

      setRows(accounts);
      setOptions(availableOptions);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải tài khoản nghiệp vụ."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, authorized, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setOpen(true);
  }

  function openEdit(account: OrganizationAccount) {
    setEditing(account);

    setForm({
      username: account.username,
      fullName: account.fullName,
      password: "",
      role: account.role as OrganizationRole,
      status: account.status,
      organizationId: String(
        account.trainingSchoolId ?? account.examinationCenterId ?? ""
      ),
    });

    setFormError("");
    setOpen(true);
  }

  const needsSchool = form.role === "training_school";

  const needsCenter = form.role === "exam_center";

  const needsOrganization = needsSchool || needsCenter;

  const organizationOptions = needsSchool
    ? options.trainingSchools
    : needsCenter
    ? options.examinationCenters
    : [];

  const organizationTitle = needsSchool
    ? "Cơ sở đào tạo"
    : "Trung tâm sát hạch";

  async function save() {
    if (!accessToken || saving) return;

    if (needsOrganization && !form.organizationId) {
      setFormError(`Vui lòng chọn ${organizationTitle.toLowerCase()}.`);
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      const organizationId = form.organizationId
        ? Number(form.organizationId)
        : null;

      const assignment = {
        trainingSchoolId: needsSchool ? organizationId : null,
        examinationCenterId: needsCenter ? organizationId : null,
      };

      if (editing) {
        await updateOrganizationAccount(accessToken, editing.id, {
          fullName: form.fullName.trim(),
          status: form.status,
          ...assignment,
          ...(form.password ? { password: form.password } : {}),
        });

        setSuccess("Đã cập nhật tài khoản nghiệp vụ.");
      } else {
        await createOrganizationAccount(accessToken, {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          password: form.password,
          role: form.role,
          ...assignment,
        });

        setSuccess("Đã tạo tài khoản nghiệp vụ.");
      }

      setOpen(false);
      setEditing(null);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Không thể lưu tài khoản."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!authorized) return null;

  return (
    <Stack spacing={2}>
      <Card
        variant="outlined"
        sx={{
          p: { xs: 2, md: 2.5 },
          borderRadius: 3,
        }}
      >
        <Stack
          direction={{
            xs: "column",
            sm: "row",
          }}
          sx={{
            justifyContent: "space-between",
            alignItems: {
              xs: "stretch",
              sm: "center",
            },
            spacing: 2,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Tài khoản đơn vị nghiệp vụ
            </Typography>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Quản lý tài khoản CSĐT, IT PC08, Trung tâm sát hạch và Thư ký.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<RefreshOutlined />}
              disabled={loading}
              onClick={() => setReload((value) => value + 1)}
            >
              Tải lại
            </Button>

            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={openCreate}
            >
              Thêm tài khoản
            </Button>
          </Stack>
        </Stack>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {success && (
        <Alert severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        {loading && (
          <Box sx={{ p: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <TableContainer>
          <Table size="small" sx={{ minWidth: 850 }}>
            <TableHead>
              <TableRow>
                <TableCell>Họ tên / Đơn vị</TableCell>
                <TableCell>Tài khoản</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Đơn vị liên kết</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((account) => (
                <TableRow key={account.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {account.fullName}
                    </Typography>
                  </TableCell>

                  <TableCell>@{account.username}</TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        ROLE_LABELS[account.role as OrganizationRole] ??
                        account.role
                      }
                    />
                  </TableCell>

                  <TableCell>{organizationLabel(account)}</TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      color={
                        account.status === "active" ? "success" : "default"
                      }
                      label={
                        account.status === "active"
                          ? "Hoạt động"
                          : account.status === "suspended"
                          ? "Tạm khóa"
                          : "Vô hiệu hóa"
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditOutlined />}
                      onClick={() => openEdit(account)}
                    >
                      Chỉnh sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    Chưa có tài khoản nghiệp vụ.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: { borderRadius: 3 },
          },
        }}
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {editing
              ? "Chỉnh sửa tài khoản nghiệp vụ"
              : "Tạo tài khoản nghiệp vụ"}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              select
              size="small"
              fullWidth
              label="Loại tài khoản"
              value={form.role}
              disabled={saving || Boolean(editing)}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  role: event.target.value as OrganizationRole,
                  organizationId: "",
                }))
              }
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <MenuItem key={role} value={role}>
                  {label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              fullWidth
              required
              size="small"
              label="Tên đăng nhập"
              value={form.username}
              disabled={saving || Boolean(editing)}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  username: event.target.value,
                }))
              }
            />

            <TextField
              fullWidth
              required
              size="small"
              label="Họ tên / Người phụ trách"
              value={form.fullName}
              disabled={saving}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  fullName: event.target.value,
                }))
              }
            />

            <TextField
              fullWidth
              size="small"
              type="password"
              required={!editing}
              label={
                editing ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu"
              }
              value={form.password}
              disabled={saving}
              helperText="Tối thiểu 8 ký tự."
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
            />

            {needsOrganization && (
              <TextField
                select
                fullWidth
                required
                size="small"
                label={organizationTitle}
                value={form.organizationId}
                disabled={saving}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    organizationId: event.target.value,
                  }))
                }
                helperText={
                  organizationOptions.length === 0
                    ? "Chưa có đơn vị phù hợp trong hệ thống."
                    : "Tài khoản chỉ được gắn một đơn vị."
                }
              >
                <MenuItem value="">Chọn đơn vị</MenuItem>

                {organizationOptions.map((option) => (
                  <MenuItem key={option.id} value={String(option.id)}>
                    {option.code} — {option.name ?? "Chưa đặt tên"}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {editing && (
              <TextField
                select
                fullWidth
                size="small"
                label="Trạng thái"
                value={form.status}
                disabled={saving}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    status: event.target.value as UserStatus,
                  }))
                }
              >
                <MenuItem value="active">Hoạt động</MenuItem>
                <MenuItem value="inactive">Vô hiệu hóa</MenuItem>
                <MenuItem value="suspended">Tạm khóa</MenuItem>
              </TextField>
            )}

            <Alert severity="info">
              Việc cấp quyền gửi file BC1, BC2, 48_ và KQSH sẽ được kích hoạt
              sau khi hoàn thiện luồng upload và phê duyệt.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button disabled={saving} onClick={() => setOpen(false)}>
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={
              saving ||
              !form.fullName.trim() ||
              (needsOrganization && !form.organizationId) ||
              (!editing &&
                (!form.username.trim() || form.password.length < 8)) ||
              (Boolean(editing) &&
                form.password.length > 0 &&
                form.password.length < 8)
            }
            onClick={() => void save()}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
