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
  IconButton,
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
  CloseOutlined,
  EditOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  createManagedUser,
  listManagedUsers,
  updateManagedUser,
  type ManagedUser,
} from "@/lib/user-management";

import type { UserStatus } from "@/lib/auth";

type UserForm = {
  username: string;
  fullName: string;
  password: string;
  status: UserStatus;
};

const EMPTY_FORM: UserForm = {
  username: "",
  fullName: "",
  password: "",
  status: "active",
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export default function UsersPage() {
  const { user, accessToken, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState(false);

  const [editing, setEditing] = useState<ManagedUser | null>(null);

  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken || user?.role !== "super_admin") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await listManagedUsers(accessToken, search);

      setUsers(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách tài khoản."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.role, search, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setOpen(true);
  }

  function openEdit(item: ManagedUser) {
    setEditing(item);
    setForm({
      username: item.username,
      fullName: item.fullName,
      password: "",
      status: item.status,
    });
    setFormError("");
    setOpen(true);
  }

  async function save() {
    if (!accessToken || saving) return;

    setSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateManagedUser(accessToken, editing.id, {
          fullName: form.fullName.trim(),
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });

        setSuccess("Đã cập nhật tài khoản.");
      } else {
        await createManagedUser(accessToken, {
          username: form.username.trim(),
          fullName: form.fullName.trim(),
          password: form.password,
        });

        setSuccess("Đã tạo tài khoản SYSTEM_ADMIN.");
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

  if (authLoading) {
    return (
      <Box sx={{ py: 8, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (user?.role !== "super_admin") {
    return (
      <Alert severity="error">Bạn không có quyền quản lý tài khoản.</Alert>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: {
            xs: "flex-start",
            sm: "center",
          },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Quản lý tài khoản
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Tạo và quản lý nhân viên tiếp nhận hồ sơ thí sinh tự do.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => setReload((v) => v + 1)}
            disabled={loading}
          >
            Tải lại
          </Button>

          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={openCreate}
          >
            Thêm nhân viên
          </Button>
        </Stack>
      </Stack>

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
          p: 2,
        }}
      >
        <Stack
          component="form"
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <TextField
            size="small"
            fullWidth
            label="Tìm tên hoặc tài khoản"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />

          <Button
            type="submit"
            variant="outlined"
            startIcon={<SearchOutlined />}
          >
            Tìm kiếm
          </Button>
        </Stack>
      </Card>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {loading && (
          <Box sx={{ p: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <TableContainer>
          <Table
            size="small"
            sx={{
              minWidth: 780,
              "& .MuiTableCell-head": {
                fontWeight: 700,
                whiteSpace: "nowrap",
              },
              "& .MuiTableCell-body": {
                py: 1.75,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>Nhân viên</TableCell>
                <TableCell>Tài khoản</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Đăng nhập gần nhất</TableCell>
                <TableCell>Ngày tạo</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {users.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {item.fullName}
                    </Typography>
                  </TableCell>

                  <TableCell>@{item.username}</TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label="SYSTEM_ADMIN"
                    />
                  </TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      color={item.status === "active" ? "success" : "default"}
                      label={
                        item.status === "active"
                          ? "Hoạt động"
                          : item.status === "suspended"
                          ? "Tạm khóa"
                          : "Vô hiệu hóa"
                      }
                    />
                  </TableCell>

                  <TableCell>{formatDateTime(item.lastLoginAt)}</TableCell>

                  <TableCell>{formatDateTime(item.createdAt)}</TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditOutlined />}
                      onClick={() => openEdit(item)}
                    >
                      Chỉnh sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    Chưa có tài khoản phù hợp.
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
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {editing ? "Chỉnh sửa nhân viên" : "Thêm nhân viên tiếp nhận"}
            </Typography>

            <IconButton disabled={saving} onClick={() => setOpen(false)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Tên đăng nhập"
              fullWidth
              required
              disabled={Boolean(editing) || saving}
              value={form.username}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  username: event.target.value,
                }))
              }
              helperText="Chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới."
            />

            <TextField
              label="Họ và tên nhân viên"
              fullWidth
              required
              disabled={saving}
              value={form.fullName}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  fullName: event.target.value,
                }))
              }
            />

            <TextField
              type="password"
              label={
                editing ? "Mật khẩu mới (để trống nếu giữ nguyên)" : "Mật khẩu"
              }
              fullWidth
              required={!editing}
              disabled={saving}
              value={form.password}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
              helperText="Tối thiểu 8 ký tự."
            />

            {editing && (
              <TextField
                select
                label="Trạng thái"
                fullWidth
                disabled={saving}
                value={form.status}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    status: event.target.value as UserStatus,
                  }))
                }
              >
                <MenuItem value="active">Hoạt động</MenuItem>
                <MenuItem value="suspended">Tạm khóa</MenuItem>
                <MenuItem value="inactive">Vô hiệu hóa</MenuItem>
              </TextField>
            )}

            <Alert severity="info">
              Nhân viên được tạo với vai trò SYSTEM_ADMIN. Quyền nghiệp vụ của
              nhân viên chỉ áp dụng cho thí sinh tự do do tài khoản tiếp nhận.
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
