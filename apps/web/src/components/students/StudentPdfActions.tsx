"use client";

import { useState } from "react";

import {
  Alert,
  Button,
  CircularProgress,
  Menu,
  MenuItem,
  Snackbar,
  Tooltip,
} from "@mui/material";

import {
  PictureAsPdfOutlined,
  KeyboardArrowDownOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  exportStudentPdf,
  type StudentPdfType,
} from "@/lib/student-pdf-export";

type Props = {
  studentId: number;
  intakeUserId?: number;
  disabled?: boolean;
};

export function StudentPdfActions({
  studentId,
  intakeUserId,
  disabled = false,
}: Props) {
  const { accessToken, user } = useAuth();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const [exporting, setExporting] = useState<StudentPdfType | null>(null);

  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "system_admin";

  async function handleExport(type: StudentPdfType) {
    setAnchorEl(null);

    if (!accessToken || !allowed || exporting) {
      return;
    }

    setExporting(type);
    setError("");

    try {
      await exportStudentPdf(accessToken, studentId, type, intakeUserId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo file PDF.");
    } finally {
      setExporting(null);
    }
  }

  if (!allowed) return null;

  return (
    <>
      <Tooltip title="Xuất biểu mẫu hồ sơ thí sinh tự do">
        <span>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={
              exporting ? (
                <CircularProgress size={15} />
              ) : (
                <PictureAsPdfOutlined />
              )
            }
            endIcon={<KeyboardArrowDownOutlined />}
            disabled={disabled || Boolean(exporting)}
            onClick={(event) => setAnchorEl(event.currentTarget)}
            sx={{
              whiteSpace: "nowrap",
              textTransform: "none",
            }}
          >
            {exporting ? "Đang xuất..." : "Xuất PDF"}
          </Button>
        </span>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => void handleExport("tracking")}>
          Phiếu theo dõi hồ sơ
        </MenuItem>

        <MenuItem onClick={() => void handleExport("inspection")}>
          Biên bản kiểm tra hồ sơ
        </MenuItem>
      </Menu>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={7000}
        onClose={() => setError("")}
      >
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
