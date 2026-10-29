"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  IconButton,
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
  AddOutlined,
  CloseOutlined,
  EditOutlined,
  GroupsOutlined,
  OpenInNewOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import type { UserStatus } from "@/lib/auth";
import {
  createManagedUser,
  getManagedUsersStudents,
  listManagedUsers,
  updateManagedUser,
  type ManagedUser,
  type ManagedStudentsResult,
} from "@/lib/user-management";
import { ExportAdminStudentsButton } from "@/components/users/ExportAdminStudentsButton";
import { StudentPdfActions } from "@/components/students/StudentPdfActions";

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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const text = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

export default function UsersPage() {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // Danh sách tài khoản áp dụng cho dialog.
  // Khi mở dialog, danh sách này được chốt để tránh
  // việc checkbox bên dưới thay đổi truy vấn đang xem.
  const [dialogUserIds, setDialogUserIds] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [filterUserId, setFilterUserId] = useState<number | null>(null);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentReload, setStudentReload] = useState(0);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [studentResult, setStudentResult] =
    useState<ManagedStudentsResult | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allVisibleSelected =
    users.length > 0 && users.every((item) => selectedSet.has(item.id));

  const someVisibleSelected = users.some((item) => selectedSet.has(item.id));

  const dialogUsers = useMemo(
    () =>
      dialogUserIds.map((id) => {
        return (
          users.find((item) => item.id === id) ?? {
            id,
            username: String(id),
            fullName: `Tài khoản #${id}`,
          }
        );
      }),
    [dialogUserIds, users]
  );

  const load = useCallback(async () => {
    if (!accessToken || user?.role !== "super_admin") return;

    setLoading(true);
    setError("");

    try {
      const rows = await listManagedUsers(accessToken, search);
      setUsers(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải tài khoản.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.role, search, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  // Khi dialog đóng sẽ không phát sinh request danh sách.
  useEffect(() => {
    if (
      !dialogOpen ||
      dialogUserIds.length === 0 ||
      !accessToken ||
      user?.role !== "super_admin"
    ) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setStudentLoading(true);
      setStudentError("");

      try {
        const result = await getManagedUsersStudents(accessToken, {
          userIds: dialogUserIds,
          filterUserId,
          search: studentSearch,
          page: studentPage,
          limit: 20,
        });

        if (!cancelled) {
          setStudentResult(result);
        }
      } catch (err) {
        if (!cancelled) {
          setStudentResult(null);
          setStudentError(
            err instanceof Error
              ? err.message
              : "Không thể tải danh sách học viên."
          );
        }
      } finally {
        if (!cancelled) {
          setStudentLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    user?.role,
    dialogOpen,
    dialogUserIds,
    filterUserId,
    studentSearch,
    studentPage,
    studentReload,
  ]);

  function toggleUser(id: number, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id)
    );
  }

  function toggleAllVisible(checked: boolean) {
    const ids = users.map((item) => item.id);
    const visibleSet = new Set(ids);

    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...ids])]
        : current.filter((id) => !visibleSet.has(id))
    );
  }

  function openStudents(ids: number[]) {
    const unique = [...new Set(ids)];

    if (!unique.length) return;

    setDialogUserIds(unique);
    setFilterUserId(null);
    setStudentSearchInput("");
    setStudentSearch("");
    setStudentPage(1);
    setStudentResult(null);
    setStudentError("");
    setDialogOpen(true);
  }

  function closeStudents() {
    setDialogOpen(false);
    setStudentResult(null);
    setStudentError("");
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setFormOpen(true);
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
    setFormOpen(true);
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

      setFormOpen(false);
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
          alignItems: { xs: "flex-start", sm: "center" },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Quản lý tài khoản
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Chọn một hoặc nhiều nhân viên để theo dõi hồ sơ đã tiếp nhận.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => setReload((v) => v + 1)}
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

      <Card variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
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
        sx={{ borderRadius: 3, overflow: "hidden", minWidth: 0 }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            p: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", sm: "center" },
            spacing: 1.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Đã chọn <strong>{selectedIds.length}</strong> tài khoản
          </Typography>

          <Stack
            direction="row"
            useFlexGap
            sx={{
              spacing: 1,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Button
              variant="text"
              disabled={selectedIds.length === 0}
              onClick={() => setSelectedIds([])}
            >
              Bỏ chọn
            </Button>

            <ExportAdminStudentsButton
              selectedIds={selectedIds}
              users={users}
              disabled={loading}
            />

            <Button
              variant="contained"
              disabled={selectedIds.length === 0}
              startIcon={<GroupsOutlined />}
              onClick={() => openStudents(selectedIds)}
            >
              Xem học viên đã chọn ({selectedIds.length})
            </Button>
          </Stack>
        </Stack>

        {loading && (
          <Box sx={{ px: 2, pt: 1 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <TableContainer>
          <Table
            size="small"
            sx={{
              minWidth: 1000,
              "& .MuiTableCell-head": {
                fontWeight: 700,
                whiteSpace: "nowrap",
              },
              "& .MuiTableCell-body": { py: 1.5 },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                    slotProps={{
                      input: {
                        "aria-label": "Chọn tất cả tài khoản đang hiển thị",
                      },
                    }}
                  />
                </TableCell>
                <TableCell>Nhân viên</TableCell>
                <TableCell>Tài khoản</TableCell>
                <TableCell>Vai trò</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="center">Đã tiếp nhận</TableCell>
                <TableCell>Đăng nhập gần nhất</TableCell>
                <TableCell>Ngày tạo</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {users.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  selected={selectedSet.has(item.id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedSet.has(item.id)}
                      onChange={(event) =>
                        toggleUser(item.id, event.target.checked)
                      }
                      slotProps={{
                        input: {
                          "aria-label": `Chọn tài khoản ${item.username}`,
                        },
                      }}
                    />
                  </TableCell>

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

                  <TableCell align="center">
                    <Button
                      size="small"
                      startIcon={<GroupsOutlined />}
                      onClick={() => openStudents([item.id])}
                    >
                      {Number(item.studentCount ?? 0).toLocaleString("vi-VN")}
                    </Button>
                  </TableCell>

                  <TableCell>{formatDateTime(item.lastLoginAt)}</TableCell>

                  <TableCell>{formatDateTime(item.createdAt)}</TableCell>

                  <TableCell align="right">
                    <Stack
                      direction="row"
                      sx={{ spacing: 0.5, justifyContent: "flex-end" }}
                    >
                      <Button
                        size="small"
                        onClick={() => openStudents([item.id])}
                      >
                        Xem học viên
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<EditOutlined />}
                        onClick={() => openEdit(item)}
                      >
                        Chỉnh sửa
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    Chưa có tài khoản phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Dialog tạo / sửa tài khoản */}
      <Dialog
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle component="div">
          <Stack
            direction="row"
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              {editing ? "Chỉnh sửa nhân viên" : "Thêm nhân viên tiếp nhận"}
            </Typography>
            <IconButton disabled={saving} onClick={() => setFormOpen(false)}>
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
              SYSTEM_ADMIN chỉ quản lý hồ sơ thuộc phạm vi tiếp nhận của mình.
              SUPER_ADMIN có thể theo dõi nhiều tài khoản.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button disabled={saving} onClick={() => setFormOpen(false)}>
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

      {/* Dialog học viên của một hoặc nhiều tài khoản */}
      <Dialog
        open={dialogOpen}
        onClose={closeStudents}
        maxWidth="lg"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              borderRadius: 3,
              maxHeight: "92vh",
            },
          },
        }}
      >
        <DialogTitle component="div">
          <Stack
            direction="row"
            sx={{
              alignItems: "flex-start",
              justifyContent: "space-between",
              spacing: 1,
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Học viên theo nhân viên tiếp nhận
              </Typography>

              <Typography variant="body2" color="text.secondary">
                {dialogUserIds.length === 1
                  ? `${dialogUsers[0]?.fullName} (@${dialogUsers[0]?.username})`
                  : `${dialogUserIds.length} tài khoản được chọn`}
              </Typography>
            </Box>

            <IconButton onClick={closeStudents}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            {dialogUserIds.length > 1 && (
              <TextField
                select
                size="small"
                fullWidth
                label="Lọc theo tài khoản tiếp nhận"
                value={filterUserId === null ? "all" : String(filterUserId)}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilterUserId(value === "all" ? null : Number(value));
                  setStudentPage(1);
                  setStudentResult(null);
                }}
              >
                <MenuItem value="all">Tất cả tài khoản đã chọn</MenuItem>

                {dialogUsers.map((employee) => (
                  <MenuItem key={employee.id} value={String(employee.id)}>
                    {employee.fullName} (@{employee.username})
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Stack
              component="form"
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              onSubmit={(event) => {
                event.preventDefault();
                setStudentSearch(studentSearchInput.trim());
                setStudentPage(1);
              }}
            >
              <TextField
                fullWidth
                size="small"
                label="Tìm họ tên, CCCD hoặc mã hồ sơ"
                value={studentSearchInput}
                onChange={(event) => setStudentSearchInput(event.target.value)}
              />

              <Button
                type="submit"
                variant="outlined"
                startIcon={<SearchOutlined />}
              >
                Tìm kiếm
              </Button>

              <Button
                variant="outlined"
                disabled={studentLoading}
                startIcon={<RefreshOutlined />}
                onClick={() => setStudentReload((value) => value + 1)}
              >
                Tải lại
              </Button>
            </Stack>

            {studentError && <Alert severity="error">{studentError}</Alert>}

            <Stack
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="body2" color="text.secondary">
                Tổng cộng{" "}
                <strong>
                  {(studentResult?.pagination.total ?? 0).toLocaleString(
                    "vi-VN"
                  )}
                </strong>{" "}
                học viên
              </Typography>

              {studentLoading && <CircularProgress size={18} />}
            </Stack>

            <TableContainer
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Học viên</TableCell>
                    <TableCell>CCCD</TableCell>
                    <TableCell>Hạng sát hạch</TableCell>
                    {dialogUserIds.length > 1 && (
                      <TableCell>Nhân viên tiếp nhận</TableCell>
                    )}
                    <TableCell>Ngày tiếp nhận</TableCell>
                    <TableCell>BC2</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {(studentResult?.data ?? []).map((student) => (
                    <TableRow key={student.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {student.fullName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {student.registrationCode} ·{" "}
                          {formatDate(student.dateOfBirth)}
                        </Typography>
                      </TableCell>

                      <TableCell>{student.identityNumber ?? "—"}</TableCell>

                      <TableCell>
                        {student.requestedLicenseClass ?? "—"}
                      </TableCell>

                      {dialogUserIds.length > 1 && (
                        <TableCell>
                          <Stack
                            sx={{ spacing: 0.5, alignItems: "flex-start" }}
                          >
                            {(student.intakeUsers ?? []).map((employee) => (
                              <Chip
                                key={employee.intakeId ?? employee.id}
                                size="small"
                                variant="outlined"
                                label={employee.fullName}
                              />
                            ))}
                          </Stack>
                        </TableCell>
                      )}

                      <TableCell>
                        {formatDateTime(student.intakeCreatedAt)}
                      </TableCell>

                      <TableCell>
                        <Chip
                          size="small"
                          color={student.hasBc2 ? "success" : "default"}
                          variant="outlined"
                          label={student.hasBc2 ? "Đã có BC2" : "Chưa có BC2"}
                        />
                      </TableCell>

                      <TableCell align="right">
                        <StudentPdfActions
                          studentId={student.id}
                          intakeUserId={
                            filterUserId ?? student.intakeUsers?.[0]?.id
                          }
                        />
                        <Button
                          size="small"
                          startIcon={<OpenInNewOutlined />}
                          onClick={() => {
                            closeStudents();
                            router.push(`/students?studentId=${student.id}`);
                          }}
                        >
                          Mở học viên
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!studentLoading &&
                    (studentResult?.data.length ?? 0) === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={dialogUserIds.length > 1 ? 7 : 6}
                          align="center"
                          sx={{ py: 5 }}
                        >
                          Chưa có học viên phù hợp.
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
              </Table>
            </TableContainer>

            {(studentResult?.pagination.totalPages ?? 0) > 1 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  pt: 1,
                }}
              >
                <Pagination
                  color="primary"
                  page={studentPage}
                  count={studentResult?.pagination.totalPages ?? 1}
                  onChange={(_, value) => setStudentPage(value)}
                />
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeStudents}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
