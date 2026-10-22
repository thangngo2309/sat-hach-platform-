"use client";

import { useEffect, useRef, useState } from "react";

import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { CameraAltOutlined, SaveOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";

import {
  createStudent,
  updateStudent,
  EMPTY_STUDENT_FORM,
  type StudentFormData,
} from "@/lib/student-management";

type StudentEditData = Partial<StudentFormData> & {
  id: number;
  hasPhoto?: boolean;
};

type Props = {
  open: boolean;
  student: StudentEditData | null;
  onClose: () => void;
  onSaved: () => void;
};

function initialValues(student: StudentEditData | null): StudentFormData {
  if (!student) {
    return { ...EMPTY_STUDENT_FORM };
  }

  return {
    registrationCode: student.registrationCode ?? "",
    fullName: student.fullName ?? "",
    familyName: student.familyName ?? "",
    givenName: student.givenName ?? "",
    dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : "",
    gender: student.gender ?? "",
    identityNumber: student.identityNumber ?? "",
    nationalityCode: student.nationalityCode ?? "",
    nationalityName: student.nationalityName ?? "",
    permanentAddress: student.permanentAddress ?? "",
    currentAddress: student.currentAddress ?? "",
  };
}

export function StudentFormDialog({ open, student, onClose, onSaved }: Props) {
  const { accessToken } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<StudentFormData>(initialValues(student));

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editing = Boolean(student);

  useEffect(() => {
    if (!open) return;

    setForm(initialValues(student));
    setPhoto(null);
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [open, student]);

  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(photo);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const change = (field: keyof StudentFormData, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const selectPhoto = (file?: File) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Ảnh phải nhỏ hơn hoặc bằng 5 MB.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!extension || !["jpg", "jpeg", "png", "jp2"].includes(extension)) {
      setError("Chỉ hỗ trợ ảnh JPG, JPEG, PNG hoặc JP2.");
      return;
    }

    setError("");
    setPhoto(file);
  };

  const save = async () => {
    if (!accessToken || saving) return;

    if (!form.registrationCode.trim()) {
      setError("Vui lòng nhập mã đăng ký.");
      return;
    }

    if (!form.fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      if (student) {
        await updateStudent(accessToken, student.id, form, photo);
      } else {
        await createStudent(accessToken, form, photo);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu học viên.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle component="div">
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {editing ? "Chỉnh sửa học viên" : "Thêm học viên"}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {editing
            ? "Cập nhật thông tin cá nhân và ảnh chân dung."
            : "Tạo hồ sơ học viên và tải lên ảnh chân dung."}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: "center" }}
          >
            {previewUrl ? (
              <Avatar
                src={previewUrl}
                variant="rounded"
                sx={{ width: 112, height: 136 }}
              />
            ) : student ? (
              <StudentAvatar
                studentId={student.id}
                fullName={student.fullName ?? ""}
                size={112}
              />
            ) : (
              <Avatar
                variant="rounded"
                sx={{
                  width: 112,
                  height: 136,
                  bgcolor: "#e2e8f0",
                  color: "#64748b",
                }}
              >
                <CameraAltOutlined sx={{ fontSize: 42 }} />
              </Avatar>
            )}

            <Box sx={{ flex: 1 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.jp2,image/jpeg,image/png,image/jp2"
                hidden
                onChange={(event) => selectPhoto(event.target.files?.[0])}
              />

              <Stack direction="row" sx={{ spacing: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  startIcon={<CameraAltOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  sx={{ textTransform: "none" }}
                >
                  {editing ? "Thay ảnh" : "Chọn ảnh"}
                </Button>

                {photo && (
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => {
                      setPhoto(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    disabled={saving}
                  >
                    Bỏ ảnh vừa chọn
                  </Button>
                )}
              </Stack>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1 }}
              >
                JPG, PNG hoặc JP2. Tối đa 5 MB. Không chọn ảnh mới sẽ giữ nguyên
                ảnh hiện tại.
              </Typography>

              {photo && (
                <Typography variant="caption" sx={{ display: "block" }}>
                  Đã chọn: {photo.name}
                </Typography>
              )}
            </Box>
          </Stack>

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
            <TextField
              label="Mã đăng ký"
              required
              value={form.registrationCode}
              onChange={(event) =>
                change("registrationCode", event.target.value)
              }
              disabled={editing || saving}
              helperText={
                editing
                  ? "Mã đăng ký được khóa để bảo toàn liên kết dữ liệu."
                  : undefined
              }
              slotProps={{
                htmlInput: {
                  maxLength: 150,
                },
              }}
            />

            <TextField
              label="Họ và tên"
              required
              value={form.fullName}
              onChange={(event) => change("fullName", event.target.value)}
              disabled={saving}
              slotProps={{
                htmlInput: {
                  maxLength: 255,
                },
              }}
            />

            <TextField
              label="Họ và tên đệm"
              value={form.familyName}
              onChange={(event) => change("familyName", event.target.value)}
              disabled={saving}
            />

            <TextField
              label="Tên"
              value={form.givenName}
              onChange={(event) => change("givenName", event.target.value)}
              disabled={saving}
            />

            <TextField
              label="Ngày sinh"
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => change("dateOfBirth", event.target.value)}
              disabled={saving}
              slotProps={{
                inputLabel: { shrink: true },
              }}
            />

            <TextField
              select
              label="Giới tính"
              value={form.gender}
              onChange={(event) => change("gender", event.target.value)}
              disabled={saving}
              slotProps={{
                select: { native: true },
              }}
            >
              <option value="M">Nam</option>
              <option value="F">Nữ</option>
            </TextField>

            <TextField
              label="CCCD/CMND"
              value={form.identityNumber}
              onChange={(event) => change("identityNumber", event.target.value)}
              disabled={saving}
            />

            <TextField
              label="Mã quốc tịch"
              value={form.nationalityCode}
              onChange={(event) =>
                change("nationalityCode", event.target.value)
              }
              disabled={saving}
            />

            <TextField
              label="Tên quốc tịch"
              value={form.nationalityName}
              onChange={(event) =>
                change("nationalityName", event.target.value)
              }
              disabled={saving}
            />

            <TextField
              label="Địa chỉ thường trú"
              value={form.permanentAddress}
              onChange={(event) =>
                change("permanentAddress", event.target.value)
              }
              disabled={saving}
              multiline
              minRows={2}
              sx={{ gridColumn: { sm: "span 2" } }}
            />

            <TextField
              label="Địa chỉ cư trú"
              value={form.currentAddress}
              onChange={(event) => change("currentAddress", event.target.value)}
              disabled={saving}
              multiline
              minRows={2}
              sx={{ gridColumn: { sm: "span 2" } }}
            />
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Hủy
        </Button>

        <Button
          variant="contained"
          startIcon={
            saving ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SaveOutlined />
            )
          }
          disabled={saving || !accessToken}
          onClick={() => void save()}
        >
          {saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm học viên"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
