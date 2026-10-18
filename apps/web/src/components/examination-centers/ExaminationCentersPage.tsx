"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AddOutlined,
  EditOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  createExaminationCenter,
  getExaminationCenters,
  updateExaminationCenter,
  type ExaminationCenter,
  type ExaminationCenterInput,
} from "@/lib/examination-centers";

import type { PageResult } from "@/lib/catalog";

const PAGE_SIZE = 20;

const EMPTY_FORM: ExaminationCenterInput = {
  code: "",
  name: "",
  address: "",
  phone: "",
  note: "",
  isActive: true,
};

export function ExaminationCentersPage() {
  const { user, accessToken, loading: authLoading } = useAuth();

  const canEdit = user?.role === "super_admin" || user?.role === "admin";

  const [result, setResult] = useState<PageResult<ExaminationCenter> | null>(
    null
  );

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "true" | "false">("all");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExaminationCenter | null>(null);
  const [form, setForm] = useState<ExaminationCenterInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;

    setLoading(true);
    setError("");

    try {
      const data = await getExaminationCenters(accessToken, {
        page,
        limit: PAGE_SIZE,
        search,
        isActive: status === "all" ? null : status === "true",
      });

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách trung tâm sát hạch."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, search, status, reloadKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (center: ExaminationCenter) => {
    setEditing(center);
    setForm({
      code: center.code,
      name: center.name ?? "",
      address: center.address ?? "",
      phone: center.phone ?? "",
      note: center.note ?? "",
      isActive: center.isActive,
    });
    setFormError("");
    setDialogOpen(true);
  };

  const updateField = (
    field: keyof ExaminationCenterInput,
    value: string | boolean
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!accessToken || !canEdit || saving) return;

    const data: ExaminationCenterInput = {
      code: form.code.trim(),
      name: form.name.trim(),
      address: form.address?.trim() || null,
      phone: form.phone?.trim() || null,
      note: form.note?.trim() || null,
      isActive: form.isActive,
    };

    if (!data.code || !data.name) {
      setFormError("Vui lòng nhập mã và tên trung tâm sát hạch.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      if (editing) {
        await updateExaminationCenter(accessToken, editing.id, data);
        setSuccess("Đã cập nhật trung tâm sát hạch.");
      } else {
        await createExaminationCenter(accessToken, data);
        setSuccess("Đã tạo trung tâm sát hạch.");
      }

      setDialogOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Không thể lưu trung tâm sát hạch."
      );
    } finally {
      setSaving(false);
    }
  };

  const submitSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { sm: "center" },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Trung tâm sát hạch
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Quản lý danh mục trung tâm tổ chức sát hạch lái xe.
          </Typography>
        </Box>

        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={openCreate}
          >
            Thêm trung tâm
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {success && (
        <Alert severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ alignItems: { md: "center" } }}
          >
            <TextField
              size="small"
              label="Tìm theo mã, tên, địa chỉ"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
              sx={{ flex: 1 }}
            />

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Trạng thái</InputLabel>
              <Select
                label="Trạng thái"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as "all" | "true" | "false");
                  setPage(1);
                }}
              >
                <MenuItem value="all">Tất cả</MenuItem>
                <MenuItem value="true">Đang hoạt động</MenuItem>
                <MenuItem value="false">Ngừng hoạt động</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<SearchOutlined />}
              onClick={submitSearch}
            >
              Tìm kiếm
            </Button>

            <Tooltip title="Tải lại">
              <span>
                <IconButton
                  disabled={loading}
                  onClick={() => setReloadKey((value) => value + 1)}
                >
                  <RefreshOutlined />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent sx={{ pb: "16px !important" }}>
          <Stack
            direction="row"
            sx={{
              mb: 2,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography sx={{ fontWeight: 700 }}>
              Danh sách trung tâm
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tổng: {result?.pagination.total ?? 0}
            </Typography>
          </Stack>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          )}

          <TableContainer>
            <Table sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Mã TTSH</TableCell>
                  <TableCell>Tên trung tâm</TableCell>
                  <TableCell>Địa chỉ</TableCell>
                  <TableCell>Số điện thoại</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  {canEdit && <TableCell align="right">Thao tác</TableCell>}
                </TableRow>
              </TableHead>

              <TableBody>
                {!loading && result?.data.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canEdit ? 6 : 5}
                      align="center"
                      sx={{ py: 5 }}
                    >
                      Chưa có trung tâm sát hạch nào.
                    </TableCell>
                  </TableRow>
                )}

                {result?.data.map((center) => (
                  <TableRow hover key={center.id}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>
                        {center.code}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>
                        {center.name || "Chưa xác định tên"}
                      </Typography>
                      {center.nameSource === "xml" && (
                        <Typography variant="caption" color="text.secondary">
                          Tên từ dữ liệu XML
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>{center.address || "—"}</TableCell>
                    <TableCell>{center.phone || "—"}</TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        color={center.isActive ? "success" : "default"}
                        label={
                          center.isActive ? "Đang hoạt động" : "Ngừng hoạt động"
                        }
                      />
                    </TableCell>

                    {canEdit && (
                      <TableCell align="right">
                        <Tooltip title="Chỉnh sửa">
                          <IconButton
                            size="small"
                            onClick={() => openEdit(center)}
                          >
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {(result?.pagination.totalPages ?? 0) > 1 && (
            <Box
              sx={{
                mt: 3,
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <Pagination
                count={result?.pagination.totalPages ?? 1}
                page={page}
                onChange={(_, value) => setPage(value)}
                color="primary"
              />
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={saving ? undefined : () => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editing ? "Chỉnh sửa trung tâm sát hạch" : "Thêm trung tâm sát hạch"}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Mã trung tâm sát hạch"
              required
              fullWidth
              value={form.code}
              onChange={(event) => updateField("code", event.target.value)}
              slotProps={{ htmlInput: { maxLength: 50 } }}
              helperText="Ví dụ: 49501"
            />

            <TextField
              label="Tên trung tâm sát hạch"
              required
              fullWidth
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              slotProps={{ htmlInput: { maxLength: 255 } }}
              helperText="Ví dụ: Trung tâm sát hạch Minh Sơn"
            />

            <TextField
              label="Địa chỉ"
              fullWidth
              value={form.address ?? ""}
              onChange={(event) => updateField("address", event.target.value)}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <TextField
              label="Số điện thoại"
              fullWidth
              value={form.phone ?? ""}
              onChange={(event) => updateField("phone", event.target.value)}
              slotProps={{ htmlInput: { maxLength: 30 } }}
            />

            <TextField
              label="Ghi chú"
              fullWidth
              multiline
              minRows={3}
              value={form.note ?? ""}
              onChange={(event) => updateField("note", event.target.value)}
            />

            <FormControl fullWidth>
              <InputLabel>Trạng thái</InputLabel>
              <Select
                label="Trạng thái"
                value={form.isActive ? "active" : "inactive"}
                onChange={(event) =>
                  updateField("isActive", event.target.value === "active")
                }
              >
                <MenuItem value="active">Đang hoạt động</MenuItem>
                <MenuItem value="inactive">Ngừng hoạt động</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            color="inherit"
            disabled={saving}
            onClick={() => setDialogOpen(false)}
          >
            Hủy
          </Button>

          <Button
            variant="contained"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving
              ? "Đang lưu..."
              : editing
              ? "Lưu thay đổi"
              : "Tạo trung tâm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
