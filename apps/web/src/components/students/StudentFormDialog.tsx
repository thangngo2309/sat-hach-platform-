"use client";

import { useEffect, useRef, useState } from "react";

import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  AddOutlined,
  CameraAltOutlined,
  DeleteOutlineOutlined,
  SaveOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import { StudentAvatar } from "@/components/students/StudentAvatar";

import {
  createStudent,
  updateStudent,
  EMPTY_STUDENT_FORM,
  type StudentFormData,
  type ExistingLicense,
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

const LICENSE_CLASSES = [
  "A1",
  "A",
  "B1",
  "B",
  "C1",
  "C",
  "D1",
  "D2",
  "D",
  "BE",
  "C1E",
  "CE",
  "D1E",
  "D2E",
  "DE",
];

const DOCUMENTS = [
  {
    type: "health_certificate",
    label: "Giấy chứng nhận sức khỏe",
  },
  {
    type: "driving_experience",
    label: "Giấy xác nhận quá trình lái xe",
  },
  {
    type: "diploma",
    label: "Bản sao văn bằng (nếu cần)",
  },
  {
    type: "current_license_copy",
    label: "Bản sao GPLX hiện có (nếu cần)",
  },
];

function initialValues(student: StudentEditData | null): StudentFormData {
  if (!student) {
    return structuredClone(EMPTY_STUDENT_FORM);
  }

  return {
    ...structuredClone(EMPTY_STUDENT_FORM),
    ...student,
    registrationCode: student.registrationCode ?? "",
    fullName: student.fullName ?? "",
    familyName: student.familyName ?? "",
    givenName: student.givenName ?? "",
    dateOfBirth: student.dateOfBirth?.slice(0, 10) ?? "",
    gender: student.gender ?? "M",
    identityNumber: student.identityNumber ?? "",
    nationalityCode: student.nationalityCode ?? "VN",
    nationalityName: student.nationalityName ?? "Việt Nam",
    permanentAddress: student.permanentAddress ?? "",
    currentAddress: student.currentAddress ?? "",
    documents:
      student.documents ?? structuredClone(EMPTY_STUDENT_FORM.documents),
    existingLicenses: student.existingLicenses ?? [],
  };
}

const emptyLicense = (): ExistingLicense => ({
  number: "",
  licenseClass: "",
  issuedDate: "",
  issuedBy: "",
});

export function StudentFormDialog({ open, student, onClose, onSaved }: Props) {
  const { accessToken, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<StudentFormData>(initialValues(student));

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editing = Boolean(student);
  const isSystemAdmin = user?.role === "system_admin";

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

    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
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
      setError("Ảnh không được vượt quá 5 MB.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (!ext || !["jpg", "jpeg", "png", "jp2"].includes(ext)) {
      setError("Chỉ hỗ trợ JPG, PNG hoặc JP2.");
      return;
    }

    setPhoto(file);
    setError("");
  };

  function changeLicense(
    index: number,
    key: keyof ExistingLicense,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      existingLicenses: current.existingLicenses.map((license, i) =>
        i === index ? { ...license, [key]: value } : license
      ),
    }));
  }

  function changeDocument(type: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((item) =>
        item.type === type ? { ...item, checked } : item
      ),
    }));
  }

  const save = async () => {
    if (!accessToken || saving) return;

    if (!form.fullName.trim()) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }

    if (!form.identityNumber.trim()) {
      setError("Vui lòng nhập CCCD.");
      return;
    }

    if (!form.dateOfBirth) {
      setError("Vui lòng chọn ngày sinh.");
      return;
    }

    if (!editing && !form.requestedLicenseClass) {
      setError("Vui lòng chọn hạng đề nghị sát hạch.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const values: StudentFormData = {
        ...form,
        existingLicenses: form.existingLicenses.filter(
          (item) => item.number.trim() || item.licenseClass.trim()
        ),
      };

      if (student) {
        await updateStudent(accessToken, student.id, values, photo);
      } else {
        await createStudent(accessToken, values, photo);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu hồ sơ.");
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    key: keyof StudentFormData,
    required = false
  ) => (
    <TextField
      fullWidth
      size="small"
      label={label}
      required={required}
      value={String(form[key] ?? "")}
      disabled={saving}
      onChange={(event) => change(key, event.target.value)}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 3,
            maxHeight: "95vh",
          },
        },
      }}
    >
      <DialogTitle component="div">
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {editing
            ? "Chỉnh sửa hồ sơ thí sinh"
            : "Tiếp nhận hồ sơ thí sinh tự do"}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {isSystemAdmin
            ? "Hồ sơ được ghi nhận theo tài khoản tiếp nhận của bạn."
            : "Nhập thông tin cá nhân và hồ sơ sát hạch."}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "1fr 1fr",
              },
              gap: 3,
            }}
          >
            {/* Cột thông tin cá nhân */}
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                1. Thông tin thí sinh
              </Typography>

              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ spacing: 2, alignItems: "center" }}
              >
                {previewUrl ? (
                  <Avatar
                    src={previewUrl}
                    variant="rounded"
                    sx={{
                      width: 110,
                      height: 138,
                    }}
                  />
                ) : student?.id ? (
                  <StudentAvatar
                    studentId={student.id}
                    fullName={student.fullName ?? ""}
                    size={110}
                  />
                ) : (
                  <Avatar
                    variant="rounded"
                    sx={{
                      width: 110,
                      height: 138,
                      bgcolor: "#e2e8f0",
                      color: "#64748b",
                    }}
                  >
                    <CameraAltOutlined sx={{ fontSize: 42 }} />
                  </Avatar>
                )}

                <Box>
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    accept=".jpg,.jpeg,.png,.jp2"
                    onChange={(event) => selectPhoto(event.target.files?.[0])}
                  />

                  <Button
                    variant="outlined"
                    startIcon={<CameraAltOutlined />}
                    disabled={saving}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {editing ? "Thay ảnh" : "Chọn ảnh"}
                  </Button>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1 }}
                  >
                    JPG, PNG, JP2 — tối đa 5 MB
                  </Typography>
                </Box>
              </Stack>

              <TextField
                label="Mã đăng ký"
                size="small"
                fullWidth
                value={form.registrationCode}
                disabled={editing || saving}
                placeholder="Để trống để tự sinh mã TD"
                helperText={
                  editing
                    ? "Không được thay đổi mã đăng ký."
                    : "Hệ thống tự sinh mã nếu để trống."
                }
                onChange={(event) =>
                  change("registrationCode", event.target.value)
                }
              />

              {field("Họ và tên", "fullName", true)}

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "1fr 1fr",
                  },
                  gap: 2,
                }}
              >
                {field("Họ và tên đệm", "familyName")}
                {field("Tên", "givenName")}
              </Box>

              <TextField
                label="Ngày sinh"
                type="date"
                size="small"
                required
                value={form.dateOfBirth}
                onChange={(event) => change("dateOfBirth", event.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />

              <TextField
                label="Giới tính"
                select
                size="small"
                value={form.gender}
                onChange={(event) => change("gender", event.target.value)}
              >
                <MenuItem value="M">Nam</MenuItem>
                <MenuItem value="F">Nữ</MenuItem>
              </TextField>

              {field("Số CCCD", "identityNumber", true)}

              <TextField
                label="Ngày cấp CCCD"
                size="small"
                type="date"
                value={form.identityIssuedDate}
                onChange={(event) =>
                  change("identityIssuedDate", event.target.value)
                }
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />

              {field("Mã quốc tịch", "nationalityCode")}
              {field("Quốc tịch", "nationalityName")}

              <TextField
                label="Địa chỉ thường trú"
                size="small"
                multiline
                minRows={2}
                value={form.permanentAddress}
                onChange={(event) =>
                  change("permanentAddress", event.target.value)
                }
              />

              <TextField
                label="Địa chỉ cư trú"
                size="small"
                multiline
                minRows={2}
                value={form.currentAddress}
                onChange={(event) =>
                  change("currentAddress", event.target.value)
                }
              />
            </Stack>

            {/* Cột thông tin sát hạch */}
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                2. Thông tin sát hạch
              </Typography>

              <TextField
                select
                size="small"
                label="Loại hồ sơ"
                value={form.applicationType}
                onChange={(event) =>
                  change("applicationType", event.target.value)
                }
              >
                <MenuItem value="new">Cấp mới</MenuItem>
                <MenuItem value="upgrade">Nâng hạng</MenuItem>
                <MenuItem value="reissue">Cấp lại</MenuItem>
              </TextField>

              <TextField
                select
                size="small"
                label="Hạng đề nghị sát hạch"
                required={!editing}
                value={form.requestedLicenseClass}
                onChange={(event) =>
                  change("requestedLicenseClass", event.target.value)
                }
              >
                <MenuItem value="">Chọn hạng</MenuItem>
                {LICENSE_CLASSES.map((licenseClass) => (
                  <MenuItem key={licenseClass} value={licenseClass}>
                    {licenseClass}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Hạng đào tạo"
                value={form.trainingLicenseClass}
                onChange={(event) =>
                  change("trainingLicenseClass", event.target.value)
                }
              >
                <MenuItem value="">Không có</MenuItem>
                {LICENSE_CLASSES.map((licenseClass) => (
                  <MenuItem key={licenseClass} value={licenseClass}>
                    {licenseClass}
                  </MenuItem>
                ))}
              </TextField>

              {field("Nội dung sát hạch", "examinationContent")}

              {field("Cơ quan cấp giấy tờ", "certificateIssuer")}

              <Divider />

              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                3. Giấy tờ kèm theo
              </Typography>

              <Stack spacing={0.5}>
                {DOCUMENTS.map((document) => {
                  const checked =
                    form.documents.find((item) => item.type === document.type)
                      ?.checked ?? false;

                  return (
                    <FormControlLabel
                      key={document.type}
                      control={
                        <Checkbox
                          checked={checked}
                          onChange={(event) =>
                            changeDocument(document.type, event.target.checked)
                          }
                        />
                      }
                      label={document.label}
                    />
                  );
                })}
              </Stack>

              <Divider />

              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  4. GPLX hiện có
                </Typography>

                <Button
                  size="small"
                  startIcon={<AddOutlined />}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      existingLicenses: [
                        ...current.existingLicenses,
                        emptyLicense(),
                      ],
                    }))
                  }
                >
                  Thêm GPLX
                </Button>
              </Stack>

              {form.existingLicenses.map((license, index) => (
                <Box
                  key={index}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    p: 1.5,
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        GPLX {index + 1}
                      </Typography>

                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            existingLicenses: current.existingLicenses.filter(
                              (_, i) => i !== index
                            ),
                          }))
                        }
                      >
                        <DeleteOutlineOutlined />
                      </IconButton>
                    </Stack>

                    <TextField
                      label="Số GPLX"
                      size="small"
                      value={license.number}
                      onChange={(event) =>
                        changeLicense(index, "number", event.target.value)
                      }
                    />

                    <TextField
                      select
                      label="Hạng GPLX"
                      size="small"
                      value={license.licenseClass}
                      onChange={(event) =>
                        changeLicense(index, "licenseClass", event.target.value)
                      }
                    >
                      <MenuItem value="">Chọn hạng</MenuItem>

                      {LICENSE_CLASSES.map((code) => (
                        <MenuItem key={code} value={code}>
                          {code}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      type="date"
                      label="Ngày cấp GPLX"
                      size="small"
                      value={license.issuedDate}
                      onChange={(event) =>
                        changeLicense(index, "issuedDate", event.target.value)
                      }
                      slotProps={{
                        inputLabel: { shrink: true },
                      }}
                    />

                    <TextField
                      label="Nơi cấp GPLX"
                      size="small"
                      value={license.issuedBy}
                      onChange={(event) =>
                        changeLicense(index, "issuedBy", event.target.value)
                      }
                    />
                  </Stack>
                </Box>
              ))}

              {form.existingLicenses.length === 0 && (
                <Alert severity="info">Chưa khai báo GPLX hiện có.</Alert>
              )}

              <TextField
                label="Ghi chú tiếp nhận"
                size="small"
                multiline
                minRows={3}
                value={form.note}
                onChange={(event) => change("note", event.target.value)}
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button color="inherit" disabled={saving} onClick={onClose}>
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
          {saving
            ? "Đang lưu..."
            : editing
            ? "Lưu thay đổi"
            : "Tiếp nhận hồ sơ"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
