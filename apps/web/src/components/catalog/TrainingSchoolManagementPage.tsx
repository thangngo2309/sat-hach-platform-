"use client";

import { Suspense, useState } from "react";

import { AddOutlined } from "@mui/icons-material";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";
import { CatalogPage } from "@/components/catalog/CatalogPage";
import { apiRequest } from "@/lib/auth";

type CreateSchoolForm = {
  code: string;
  name: string;
  provinceCode: string;
  provinceName: string;
};

const EMPTY_FORM: CreateSchoolForm = {
  code: "",
  name: "",
  provinceCode: "",
  provinceName: "",
};

export function TrainingSchoolManagementPage() {
  const { accessToken, user } = useAuth();

  const canManage = user?.role === "super_admin" || user?.role === "admin";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateSchoolForm>({
    ...EMPTY_FORM,
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const updateField = (field: keyof CreateSchoolForm, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;

    setDialogOpen(false);
    setFormError("");
  };

  const handleCreate = async () => {
    if (!accessToken || !canManage || saving) return;

    const code = form.code.trim();
    const name = form.name.trim();

    if (!code || !name) {
      setFormError("Vui lòng nhập đầy đủ mã và tên cơ sở đào tạo.");
      return;
    }

    setSaving(true);
    setFormError("");

    try {
      await apiRequest(
        "/catalog/schools",
        {
          method: "POST",
          body: JSON.stringify({
            code,
            name,
            provinceCode: form.provinceCode.trim() || undefined,
            provinceName: form.provinceName.trim() || undefined,
          }),
        },
        accessToken
      );

      setDialogOpen(false);
      setSuccess("Đã tạo cơ sở đào tạo thành công.");
      setReloadKey((value) => value + 1);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Không thể tạo cơ sở đào tạo."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      {success && (
        <Alert severity="success" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {canManage && (
        <Box
          sx={{
            display: "flex",
            justifyContent: {
              xs: "stretch",
              sm: "flex-end",
            },
          }}
        >
          <Button
            variant="contained"
            startIcon={<AddOutlined />}
            onClick={openCreate}
            sx={{
              textTransform: "none",
              width: { xs: "100%", sm: "auto" },
            }}
          >
            Thêm cơ sở đào tạo
          </Button>
        </Box>
      )}

      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              py: 6,
            }}
          >
            <CircularProgress />
          </Box>
        }
      >
        <CatalogPage key={reloadKey} section="schools" />
      </Suspense>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Thêm cơ sở đào tạo</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Mã cơ sở đào tạo"
              value={form.code}
              onChange={(event) => updateField("code", event.target.value)}
              required
              fullWidth
              autoFocus
              slotProps={{
                htmlInput: { maxLength: 50 },
              }}
              helperText="Nhập đúng mã MA_CSDT trong XML, ví dụ: 48012"
            />

            <TextField
              label="Tên cơ sở đào tạo"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              required
              fullWidth
              slotProps={{
                htmlInput: { maxLength: 255 },
              }}
            />

            <TextField
              label="Mã tỉnh/thành phố"
              value={form.provinceCode}
              onChange={(event) =>
                updateField("provinceCode", event.target.value)
              }
              fullWidth
              slotProps={{
                htmlInput: { maxLength: 30 },
              }}
            />

            <TextField
              label="Tên tỉnh/thành phố"
              value={form.provinceName}
              onChange={(event) =>
                updateField("provinceName", event.target.value)
              }
              fullWidth
              slotProps={{
                htmlInput: { maxLength: 255 },
              }}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={closeDialog} disabled={saving}>
            Hủy
          </Button>

          <Button
            variant="contained"
            onClick={() => void handleCreate()}
            disabled={saving}
          >
            {saving ? "Đang lưu..." : "Tạo cơ sở đào tạo"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
