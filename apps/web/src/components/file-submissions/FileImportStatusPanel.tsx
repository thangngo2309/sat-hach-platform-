"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";

import { RefreshOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  FILE_TYPE_LABELS,
  getFileImportStates,
  IMPORT_STATUS_LABELS,
  listFileSubmissions,
  type FileImportState,
  type FileSubmission,
} from "@/lib/file-submissions";

export function FileImportStatusPanel() {
  const { accessToken, user } = useAuth();

  const [files, setFiles] = useState<FileSubmission[]>([]);

  const [states, setStates] = useState<Record<number, FileImportState>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const load = useCallback(async () => {
    if (!accessToken || user?.role !== "training_school") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const submissions = (await listFileSubmissions(accessToken)).filter(
        (item) => item.fileType === "bc1" || item.fileType === "bc2"
      );

      const allStates: FileImportState[] = [];

      for (let index = 0; index < submissions.length; index += 100) {
        const ids = submissions
          .slice(index, index + 100)
          .map((item) => item.id);

        if (ids.length) {
          allStates.push(...(await getFileImportStates(accessToken, ids)));
        }
      }

      setFiles(submissions);
      setStates(Object.fromEntries(allStates.map((item) => [item.id, item])));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải kết quả import."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, user?.role, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  if (user?.role !== "training_school") {
    return null;
  }

  return (
    <Card
      variant="outlined"
      sx={{
        p: { xs: 2, md: 3 },
        borderRadius: 3,
      }}
    >
      <Stack spacing={2}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Kết quả xử lý BC1 / BC2
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Trạng thái nhập dữ liệu sau khi SUPER_ADMIN phê duyệt.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            size="small"
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshOutlined />
            }
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            Tải lại
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {files.length === 0 && !loading && (
          <Typography color="text.secondary">
            Chưa có hồ sơ BC1 hoặc BC2.
          </Typography>
        )}

        {files.map((file) => {
          const state = states[file.id];

          const importStatus = state?.importStatus ?? file.importStatus;

          return (
            <Box
              key={file.id}
              sx={{
                p: 2,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Stack spacing={1}>
                <Stack
                  direction={{
                    xs: "column",
                    sm: "row",
                  }}
                  sx={{
                    spacing: 1,
                    alignItems: {
                      xs: "flex-start",
                      sm: "center",
                    },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      flex: 1,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {file.originalName}
                  </Typography>

                  <Chip
                    size="small"
                    variant="outlined"
                    label={FILE_TYPE_LABELS[file.fileType]}
                  />

                  <Chip
                    size="small"
                    color={
                      importStatus === "completed"
                        ? "success"
                        : importStatus === "failed"
                        ? "error"
                        : "default"
                    }
                    label={IMPORT_STATUS_LABELS[importStatus]}
                  />
                </Stack>

                {state?.importBatchId && (
                  <Typography variant="caption" color="text.secondary">
                    Import batch #{state.importBatchId}
                  </Typography>
                )}

                {state?.importError && (
                  <Alert severity="error">
                    {state.importError} Bạn có thể thay file khi hồ sơ vẫn ở
                    trạng thái chờ duyệt.
                  </Alert>
                )}

                {state?.importResult && (
                  <Alert severity="success">
                    Đã import thành công dữ liệu
                    {state.importResult.totalStudents
                      ? ` của ${state.importResult.totalStudents} học viên`
                      : state.importResult.totalCandidates
                      ? ` của ${state.importResult.totalCandidates} thí sinh`
                      : ""}
                    .
                  </Alert>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Card>
  );
}
