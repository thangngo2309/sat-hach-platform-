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
  getFileImportStates,
  listFileSubmissions,
  IMPORT_STATUS_LABELS,
  type FileImportState,
  type FileSubmission,
} from "@/lib/file-submissions";

export function ExamImportStatusPanel() {
  const { user, accessToken } = useAuth();

  const [files, setFiles] = useState<FileSubmission[]>([]);

  const [states, setStates] = useState<Record<number, FileImportState>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const isPc08 = user?.role === "pc08_staff";
  const isCenter = user?.role === "exam_center";

  const authorized = isPc08 || isCenter;

  const load = useCallback(async () => {
    if (!accessToken || !authorized) return;

    setLoading(true);
    setError("");

    try {
      const all = await listFileSubmissions(accessToken);

      const selected = all.filter((item) =>
        isPc08 ? item.fileType === "exam_48" : item.fileType === "exam_result"
      );

      const allStates: FileImportState[] = [];

      for (let i = 0; i < selected.length; i += 100) {
        const ids = selected.slice(i, i + 100).map((item) => item.id);

        allStates.push(...(await getFileImportStates(accessToken, ids)));
      }

      setFiles(selected);
      setStates(
        Object.fromEntries(allStates.map((state) => [state.id, state]))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không tải được trạng thái import."
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, authorized, isPc08, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!authorized) return null;

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
          direction={{ xs: "column", sm: "row" }}
          sx={{
            alignItems: {
              xs: "flex-start",
              sm: "center",
            },
            justifyContent: "space-between",
            spacing: 2,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {isPc08
                ? "Kết quả xử lý file dự sát hạch 48_"
                : "Kết quả xử lý file KQSH"}
            </Typography>

            <Typography variant="body2" color="text.secondary">
              Theo dõi việc nhập dữ liệu sau phê duyệt.
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            disabled={loading}
            startIcon={
              loading ? <CircularProgress size={16} /> : <RefreshOutlined />
            }
            onClick={() => setReload((value) => value + 1)}
          >
            Tải lại
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && files.length === 0 && (
          <Typography color="text.secondary">
            Chưa có file sát hạch được gửi.
          </Typography>
        )}

        {files.map((file) => {
          const state = states[file.id];

          const status = state?.importStatus ?? file.importStatus;

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
                    alignItems: {
                      xs: "flex-start",
                      sm: "center",
                    },
                    spacing: 1,
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
                    label={IMPORT_STATUS_LABELS[status]}
                    color={
                      status === "completed"
                        ? "success"
                        : status === "failed"
                        ? "error"
                        : status === "processing"
                        ? "warning"
                        : "default"
                    }
                    variant="outlined"
                  />
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  Hồ sơ #{file.id} · Phiên bản {file.currentVersion}
                  {state?.importBatchId
                    ? ` · Import batch #${state.importBatchId}`
                    : ""}
                </Typography>

                {state?.importError && (
                  <Alert severity="error">{state.importError}</Alert>
                )}

                {state?.importResult && (
                  <Alert severity="success">
                    Đã import thành công.
                    {state.importResult.sessionCode
                      ? ` Kỳ sát hạch: ${String(
                          state.importResult.sessionCode
                        )}.`
                      : ""}
                    {typeof state.importResult.totalCandidates === "number"
                      ? ` Tổng thí sinh: ${state.importResult.totalCandidates.toLocaleString(
                          "vi-VN"
                        )}.`
                      : ""}
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
