"use client";

import { useState } from "react";

import { Button, CircularProgress, Snackbar, Alert } from "@mui/material";

import { FileDownloadOutlined } from "@mui/icons-material";

type Props = {
  onExport: () => Promise<void>;
  disabled?: boolean;
};

export function ExportExcelButton({ onExport, disabled = false }: Props) {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"success" | "error">("success");

  const handleExport = async () => {
    if (exporting) return;

    setExporting(true);

    try {
      await onExport();
      setSeverity("success");
      setMessage("Đã tạo và tải xuống file Excel.");
    } catch (error) {
      setSeverity("error");
      setMessage(
        error instanceof Error ? error.message : "Không thể xuất file Excel."
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="success"
        disabled={disabled || exporting}
        startIcon={
          exporting ? (
            <CircularProgress size={17} color="inherit" />
          ) : (
            <FileDownloadOutlined />
          )
        }
        onClick={() => void handleExport()}
        sx={{
          textTransform: "none",
          whiteSpace: "nowrap",
        }}
      >
        {exporting ? "Đang xuất..." : "Xuất Excel"}
      </Button>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={4000}
        onClose={() => setMessage("")}
      >
        <Alert
          severity={severity}
          onClose={() => setMessage("")}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {message}
        </Alert>
      </Snackbar>
    </>
  );
}
