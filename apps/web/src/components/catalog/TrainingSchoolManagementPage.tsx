"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AddOutlined,
  ArrowForwardOutlined,
  EditOutlined,
  FileDownloadOutlined,
  FileUploadOutlined,
  HistoryOutlined,
  RefreshOutlined,
  SearchOutlined,
} from "@mui/icons-material";

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
  Tooltip,
  Typography,
} from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  confirmSchoolExcel,
  createManagedSchool,
  getSchoolImportHistory,
  listManagedSchools,
  previewSchoolExcel,
  updateManagedSchool,
  type ManagedTrainingSchool,
  type SchoolForm,
  type SchoolImportHistory,
  type SchoolImportPreview,
} from "@/lib/training-school-management";
import { exportPagedExcel } from "@/lib/export-excel";

const EMPTY_FORM: SchoolForm = {
  code: "",
  name: "",
  provinceCode: "",
  provinceName: "",
  address: "",
  isActive: true,
};

const actionButtonSx = {
  textTransform: "none",
  fontWeight: 600,
  whiteSpace: "nowrap",
  flexShrink: 0,
  minHeight: 38,
  borderRadius: 2,
  boxShadow: "none",
};

const tableHeadSx = {
  fontWeight: 700,
  whiteSpace: "nowrap",
  bgcolor: "action.hover",
};

function formFromSchool(item: ManagedTrainingSchool): SchoolForm {
  return {
    code: item.code,
    name: item.name,
    provinceCode: item.provinceCode ?? "",
    provinceName: item.provinceName ?? "",
    address: item.address ?? "",
    isActive: item.isActive,
  };
}

function sourceLabel(source: string) {
  switch (source) {
    case "manual":
      return "Quản trị nhập";
    case "excel":
      return "Danh mục Excel";
    default:
      return "Dữ liệu BC1";
  }
}

function statusText(active: boolean) {
  return active ? "Đang hiệu lực" : "Ngừng hiệu lực";
}

export function TrainingSchoolManagementPage() {
  const router = useRouter();
  const { accessToken, user } = useAuth();

  const canManage = user?.role === "super_admin" || user?.role === "admin";

  const canImport = user?.role === "super_admin";

  const [rows, setRows] = useState<ManagedTrainingSchool[]>([]);

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editItem, setEditItem] = useState<ManagedTrainingSchool | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SchoolForm>({
    ...EMPTY_FORM,
  });
  const [formError, setFormError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<SchoolImportPreview | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<SchoolImportHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken || !canManage) return;

    setLoading(true);
    setError("");

    try {
      const result = await listManagedSchools(accessToken, {
        page,
        limit: 20,
        search,
      });

      setRows(result.data);
      setTotal(result.pagination.total);
      setTotalPages(Math.max(1, result.pagination.totalPages));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải cơ sở đào tạo."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, canManage, page, search, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  function submitSearch() {
    setPage(1);
    setSearch(searchText.trim());
  }

  function openCreate() {
    setEditItem(null);
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(item: ManagedTrainingSchool) {
    setEditItem(item);
    setForm(formFromSchool(item));
    setFormError("");
    setFormOpen(true);
  }

  function changeForm<K extends keyof SchoolForm>(
    key: K,
    value: SchoolForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function saveSchool() {
    if (!accessToken || !canManage || saving) return;

    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Mã và tên CSĐT không được để trống.");
      return;
    }

    setSaving(true);
    setFormError("");
    setSuccess("");

    try {
      const payload: SchoolForm = {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        provinceCode: form.provinceCode.trim(),
        provinceName: form.provinceName.trim(),
        address: form.address.trim(),
      };

      if (editItem) {
        await updateManagedSchool(accessToken, editItem.id, payload);
        setSuccess(`Đã cập nhật CSĐT ${payload.code}.`);
      } else {
        await createManagedSchool(accessToken, payload);
        setSuccess(`Đã tạo CSĐT ${payload.code}.`);
      }

      setFormOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Không thể lưu cơ sở đào tạo."
      );
    } finally {
      setSaving(false);
    }
  }

  function openImport() {
    setExcelFile(null);
    setPreview(null);
    setImportError("");
    setImportOpen(true);
  }

  async function previewFile(file: File) {
    if (!accessToken || importBusy) return;

    setExcelFile(file);
    setPreview(null);
    setImportError("");
    setImportBusy(true);

    try {
      const result = await previewSchoolExcel(accessToken, file);
      setPreview(result);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Không thể xem trước Excel."
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!accessToken || !excelFile || !preview || !canImport || importBusy) {
      return;
    }

    setImportBusy(true);
    setImportError("");
    setSuccess("");

    try {
      const result = await confirmSchoolExcel(
        accessToken,
        excelFile,
        preview.sha256
      );

      setSuccess(
        `Import thành công ${result.totalRows} CSĐT: ` +
          `${result.createdCount} tạo mới, ` +
          `${result.updatedCount} cập nhật, ` +
          `${result.unchangedCount} không thay đổi.`
      );

      setImportOpen(false);
      setExcelFile(null);
      setPreview(null);
      setPage(1);
      setReload((value) => value + 1);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Không thể xác nhận import."
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function openHistory() {
    if (!accessToken) return;

    setHistoryRows([]);
    setHistoryOpen(true);
    setHistoryLoading(true);

    try {
      setHistoryRows(await getSchoolImportHistory(accessToken));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được lịch sử import."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleExportExcel() {
    if (!accessToken || !canManage || exporting) return;

    setExporting(true);
    setError("");
    setSuccess("");

    try {
      const count = await exportPagedExcel<ManagedTrainingSchool>({
        filename: "Danh_sach_co_so_dao_tao.xlsx",
        sheetName: "Co so dao tao",
        columns: [
          {
            header: "Mã CSĐT",
            key: "code",
            width: 18,
            value: (row) => row.code,
          },
          {
            header: "Tên cơ sở đào tạo",
            key: "name",
            width: 48,
            value: (row) => row.name,
          },
          {
            header: "Địa điểm đào tạo",
            key: "address",
            width: 50,
            value: (row) => row.address,
          },
          {
            header: "Mã tỉnh/thành",
            key: "provinceCode",
            width: 18,
            value: (row) => row.provinceCode,
          },
          {
            header: "Tỉnh/thành phố",
            key: "provinceName",
            width: 30,
            value: (row) => row.provinceName,
          },
          {
            header: "Trạng thái",
            key: "status",
            width: 20,
            value: (row) => (row.isActive ? "Đang hiệu lực" : "Ngừng hiệu lực"),
          },
          {
            header: "Nguồn dữ liệu",
            key: "source",
            width: 20,
            value: (row) => sourceLabel(row.infoSource),
          },
          {
            header: "Số khóa học",
            key: "courseCount",
            width: 16,
            value: (row) => row.courseCount ?? 0,
          },
          {
            header: "Số ghi danh",
            key: "enrollmentCount",
            width: 16,
            value: (row) => row.enrollmentCount ?? 0,
          },
        ],
        fetchPage: (nextPage, limit) =>
          listManagedSchools(accessToken, {
            page: nextPage,
            limit,
            search,
          }),
      });

      setSuccess(`Đã xuất ${count.toLocaleString("vi-VN")} cơ sở đào tạo.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xuất Excel cơ sở đào tạo."
      );
    } finally {
      setExporting(false);
    }
  }

  if (!canManage) {
    return (
      <Alert severity="error">Tài khoản không có quyền quản lý CSĐT.</Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      {/* Header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Quản lý cơ sở đào tạo
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Quản lý danh mục, địa điểm đào tạo và trạng thái hoạt động của các cơ
          sở đào tạo.
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

      {/* Toolbar */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          p: { xs: 1.5, md: 2 },
        }}
      >
        <Stack spacing={2}>
          <Box
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              width: "100%",
            }}
          >
            <Button
              variant="outlined"
              color="success"
              startIcon={<FileDownloadOutlined />}
              disabled={exporting || loading}
              onClick={() => void handleExportExcel()}
              sx={actionButtonSx}
            >
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </Button>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm theo mã, tên hoặc địa chỉ cơ sở đào tạo..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              sx={{
                flex: 1,
                minWidth: 0,
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                },
              }}
            />

            <Button
              type="submit"
              variant="outlined"
              startIcon={<SearchOutlined />}
              sx={actionButtonSx}
            >
              Tìm kiếm
            </Button>
          </Box>

          <Divider />

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Tổng cộng{" "}
              <Box
                component="span"
                sx={{
                  fontWeight: 700,
                  color: "text.primary",
                }}
              >
                {total.toLocaleString("vi-VN")}
              </Box>{" "}
              cơ sở đào tạo
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: {
                  xs: "flex-start",
                  sm: "flex-end",
                },
                gap: 1,
              }}
            >
              <Tooltip title="Tải lại danh sách">
                <span>
                  <IconButton
                    color="default"
                    disabled={loading}
                    onClick={() => setReload((value) => value + 1)}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      width: 38,
                      height: 38,
                    }}
                  >
                    {loading ? (
                      <CircularProgress size={18} />
                    ) : (
                      <RefreshOutlined fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>

              {canImport && (
                <Button
                  variant="outlined"
                  startIcon={<HistoryOutlined />}
                  onClick={() => void openHistory()}
                  sx={actionButtonSx}
                >
                  Lịch sử
                </Button>
              )}

              {canImport && (
                <Button
                  variant="outlined"
                  startIcon={<FileUploadOutlined />}
                  onClick={openImport}
                  sx={actionButtonSx}
                >
                  Import Excel
                </Button>
              )}

              <Button
                variant="contained"
                disableElevation
                startIcon={<AddOutlined />}
                onClick={openCreate}
                sx={actionButtonSx}
              >
                Thêm cơ sở đào tạo
              </Button>
            </Box>
          </Box>
        </Stack>
      </Card>

      {/* Table */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table
            size="small"
            sx={{
              minWidth: 1050,
              "& .MuiTableCell-root": {
                px: 2,
                py: 1.7,
                verticalAlign: "middle",
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeadSx}>Mã CSĐT</TableCell>
                <TableCell sx={tableHeadSx}>Tên cơ sở đào tạo</TableCell>
                <TableCell sx={tableHeadSx}>Địa điểm đào tạo</TableCell>
                <TableCell sx={tableHeadSx}>Trạng thái</TableCell>
                <TableCell sx={tableHeadSx}>Nguồn</TableCell>
                <TableCell sx={tableHeadSx} align="right">
                  Khóa học
                </TableCell>
                <TableCell sx={tableHeadSx} align="right">
                  Ghi danh
                </TableCell>
                <TableCell sx={tableHeadSx} align="right">
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((school) => (
                <TableRow
                  key={school.id}
                  hover
                  sx={{
                    "&:last-child td": {
                      borderBottom: 0,
                    },
                  }}
                >
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {school.code}
                    </Typography>
                  </TableCell>

                  <TableCell sx={{ minWidth: 245 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}
                    >
                      {school.name}
                    </Typography>

                    {school.provinceName && (
                      <Typography variant="caption" color="text.secondary">
                        {school.provinceName}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell
                    sx={{
                      minWidth: 180,
                      maxWidth: 340,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color={school.address ? "text.primary" : "text.disabled"}
                      sx={{
                        overflowWrap: "anywhere",
                        lineHeight: 1.5,
                      }}
                    >
                      {school.address || "Chưa cập nhật"}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={school.isActive ? "success" : "default"}
                      label={statusText(school.isActive)}
                      sx={{ whiteSpace: "nowrap" }}
                    />
                  </TableCell>

                  <TableCell>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {sourceLabel(school.infoSource)}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">{school.courseCount ?? 0}</TableCell>

                  <TableCell align="right">
                    {school.enrollmentCount ?? 0}
                  </TableCell>

                  <TableCell align="right">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 0.5,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Tooltip title="Chỉnh sửa cơ sở đào tạo">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => openEdit(school)}
                          sx={{
                            borderRadius: 1.5,
                          }}
                        >
                          <EditOutlined fontSize="small" />
                        </IconButton>
                      </Tooltip>

                      <Button
                        size="small"
                        variant="text"
                        endIcon={<ArrowForwardOutlined />}
                        onClick={() =>
                          router.push(`/courses?schoolId=${school.id}`)
                        }
                        sx={{
                          textTransform: "none",
                          whiteSpace: "nowrap",
                          fontWeight: 600,
                          minWidth: 0,
                        }}
                      >
                        Khóa học
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    Không có cơ sở đào tạo phù hợp.
                  </TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: 2,
            py: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Hiển thị {rows.length} / {total} cơ sở đào tạo
          </Typography>

          <Pagination
            size="small"
            page={page}
            count={totalPages}
            onChange={(_, value) => setPage(value)}
          />
        </Box>
      </Card>

      {/* Thêm / chỉnh sửa CSĐT */}
      <Dialog
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {editItem
              ? `Chỉnh sửa CSĐT ${editItem.code}`
              : "Thêm cơ sở đào tạo"}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            {editItem && form.code !== editItem.code && (
              <Alert severity="warning">
                Thay đổi mã CSĐT có thể ảnh hưởng việc đối chiếu các file XML
                BC1 trong tương lai.
              </Alert>
            )}

            <TextField
              required
              fullWidth
              size="small"
              label="Mã CSĐT"
              value={form.code}
              disabled={saving}
              slotProps={{
                htmlInput: { maxLength: 50 },
              }}
              onChange={(event) => changeForm("code", event.target.value)}
            />

            <TextField
              required
              fullWidth
              size="small"
              label="Tên CSĐT"
              value={form.name}
              disabled={saving}
              slotProps={{
                htmlInput: { maxLength: 255 },
              }}
              onChange={(event) => changeForm("name", event.target.value)}
            />

            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              label="Địa điểm đào tạo"
              value={form.address}
              disabled={saving}
              onChange={(event) => changeForm("address", event.target.value)}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Mã tỉnh/thành phố"
                value={form.provinceCode}
                disabled={saving}
                slotProps={{
                  htmlInput: { maxLength: 30 },
                }}
                onChange={(event) =>
                  changeForm("provinceCode", event.target.value)
                }
              />

              <TextField
                fullWidth
                size="small"
                label="Tên tỉnh/thành phố"
                value={form.provinceName}
                disabled={saving}
                slotProps={{
                  htmlInput: { maxLength: 255 },
                }}
                onChange={(event) =>
                  changeForm("provinceName", event.target.value)
                }
              />
            </Stack>

            <TextField
              select
              fullWidth
              size="small"
              label="Trạng thái"
              value={form.isActive ? "active" : "inactive"}
              disabled={saving}
              onChange={(event) =>
                changeForm("isActive", event.target.value === "active")
              }
            >
              <MenuItem value="active">Đang hiệu lực</MenuItem>
              <MenuItem value="inactive">Ngừng hiệu lực</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            disabled={saving}
            onClick={() => setFormOpen(false)}
            sx={actionButtonSx}
          >
            Hủy
          </Button>

          <Button
            variant="contained"
            disableElevation
            disabled={saving || !form.code.trim() || !form.name.trim()}
            onClick={() => void saveSchool()}
            sx={actionButtonSx}
          >
            {saving ? "Đang lưu..." : "Lưu thông tin"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Excel */}
      <Dialog
        open={importOpen}
        onClose={() => {
          if (!importBusy) setImportOpen(false);
        }}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Import danh mục cơ sở đào tạo
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            {importError && <Alert severity="error">{importError}</Alert>}

            <Alert severity="info">
              File Excel cần các cột: Mã CSDT, Tên CSDT, Địa điểm đào tạo, Trạng
              thái. Hệ thống đối chiếu theo mã và không xóa CSĐT ngoài danh
              sách.
            </Alert>

            <Box>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept=".xlsx,.xlsm"
                onChange={(event) => {
                  const selected = event.target.files?.[0];

                  if (selected) {
                    void previewFile(selected);
                  }

                  event.target.value = "";
                }}
              />

              <Button
                variant="outlined"
                startIcon={<FileUploadOutlined />}
                disabled={importBusy}
                onClick={() => fileInputRef.current?.click()}
                sx={actionButtonSx}
              >
                {excelFile ? `Đã chọn: ${excelFile.name}` : "Chọn file Excel"}
              </Button>
            </Box>

            {importBusy && (
              <Stack direction="row" sx={{ spacing: 1, alignItems: "center" }}>
                <CircularProgress size={18} />
                <Typography variant="body2">
                  Đang phân tích hoặc nhập dữ liệu...
                </Typography>
              </Stack>
            )}

            {preview && (
              <>
                <Divider />

                <Typography sx={{ fontWeight: 700 }}>
                  Xem trước {preview.totalRows} CSĐT
                </Typography>

                <Stack
                  direction="row"
                  sx={{ spacing: 1, flexWrap: "wrap" }}
                  useFlexGap
                >
                  <Chip
                    color="success"
                    label={`${preview.createCount} tạo mới`}
                  />
                  <Chip
                    color="warning"
                    label={`${preview.updateCount} cập nhật`}
                  />
                  <Chip
                    variant="outlined"
                    label={`${preview.unchangedCount} không thay đổi`}
                  />
                </Stack>

                <TableContainer sx={{ maxHeight: 450 }}>
                  <Table stickyHeader size="small" sx={{ minWidth: 850 }}>
                    <TableHead>
                      <TableRow>
                        {[
                          "Dòng Excel",
                          "Mã",
                          "Tên CSĐT",
                          "Địa chỉ mới",
                          "Trạng thái",
                          "Đối chiếu",
                        ].map((label) => (
                          <TableCell key={label} sx={tableHeadSx}>
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {preview.rows.map((item) => (
                        <TableRow key={`${item.code}-${item.rowNumber}`} hover>
                          <TableCell>{item.rowNumber}</TableCell>

                          <TableCell sx={{ fontWeight: 700 }}>
                            {item.code}
                          </TableCell>

                          <TableCell>
                            <Typography variant="body2">{item.name}</Typography>

                            {item.current &&
                              item.current.name !== item.name && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  Cũ: {item.current.name}
                                </Typography>
                              )}
                          </TableCell>

                          <TableCell>
                            <Typography variant="body2">
                              {item.address || "—"}
                            </Typography>

                            {item.current &&
                              item.current.address !== item.address && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  Cũ: {item.current.address || "—"}
                                </Typography>
                              )}
                          </TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              label={statusText(item.isActive)}
                              color={item.isActive ? "success" : "default"}
                            />
                          </TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              color={
                                item.action === "create"
                                  ? "success"
                                  : item.action === "update"
                                  ? "warning"
                                  : "default"
                              }
                              label={
                                item.action === "create"
                                  ? "Tạo mới"
                                  : item.action === "update"
                                  ? "Cập nhật"
                                  : "Không đổi"
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            disabled={importBusy}
            onClick={() => setImportOpen(false)}
            sx={actionButtonSx}
          >
            Đóng
          </Button>

          <Button
            variant="contained"
            disableElevation
            disabled={!preview || !excelFile || importBusy}
            onClick={() => void confirmImport()}
            sx={actionButtonSx}
          >
            Xác nhận import
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lịch sử import */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Lịch sử import cơ sở đào tạo
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {historyLoading ? (
            <Box sx={{ p: 4, textAlign: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 650 }}>
                <TableHead>
                  <TableRow>
                    {[
                      "File",
                      "Người import",
                      "Tạo",
                      "Sửa",
                      "Không đổi",
                      "Thời gian",
                    ].map((label) => (
                      <TableCell key={label} sx={tableHeadSx}>
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {historyRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.fileName}</TableCell>
                      <TableCell>{item.importedBy ?? "—"}</TableCell>
                      <TableCell>{item.createdCount}</TableCell>
                      <TableCell>{item.updatedCount}</TableCell>
                      <TableCell>{item.unchangedCount}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {new Date(item.createdAt).toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}

                  {historyRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        Chưa có lịch sử import.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setHistoryOpen(false)} sx={actionButtonSx}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
