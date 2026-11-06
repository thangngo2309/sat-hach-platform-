"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  CheckCircleOutlineOutlined,
  RefreshOutlined,
} from "@mui/icons-material";

import {
  getExam48ApprovalOptions,
  type Exam48ApprovalOptions,
  type Exam48LinkOption,
  type FileSubmission,
} from "@/lib/file-submissions";

type FileFilter = "all" | "bc1" | "bc2";

type Props = {
  open: boolean;
  file: FileSubmission | null;
  accessToken: string | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (selectedFileIds: number[]) => Promise<void>;
};

function formatDate(value: string | null): string {
  if (!value) return "—";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return value;
}

function fileLabel(file: Exam48LinkOption): string {
  return file.fileType === "bc1" ? "BC1" : "BC2";
}

export function Exam48ApprovalDialog({
  open,
  file,
  accessToken,
  saving,
  onClose,
  onConfirm,
}: Props) {
  const [data, setData] = useState<Exam48ApprovalOptions | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");

  const [onlySuggested, setOnlySuggested] = useState(false);

  useEffect(() => {
    if (!open || !file || !accessToken) {
      setData(null);
      setSelectedIds([]);
      setError("");
      return;
    }

    let active = true;

    setData(null);
    setSelectedIds([]);
    setLoading(true);
    setError("");
    setSearch("");
    setFilter("all");
    setOnlySuggested(false);

    void getExam48ApprovalOptions(accessToken, file.id)
      .then((result) => {
        if (!active) return;

        setData(result);

        // Gợi ý tự động nhưng Admin vẫn
        // được quyền bỏ hoặc bổ sung file.
        setSelectedIds(
          result.files.filter((item) => item.suggested).map((item) => item.id)
        );
      })
      .catch((err: unknown) => {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Không thể đọc thông tin file 48_."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, file?.id, accessToken]);

  const visibleFiles = useMemo(() => {
    if (!data) return [];

    const keyword = search.trim().toLocaleLowerCase("vi-VN");

    return data.files.filter((item) => {
      if (filter !== "all" && item.fileType !== filter) {
        return false;
      }

      if (onlySuggested && !item.suggested) {
        return false;
      }

      if (!keyword) return true;

      const content = [
        item.fileName,
        item.fileType,
        item.schoolCode,
        item.schoolName,
        item.reportCode,
        item.importBatchId,
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLocaleLowerCase("vi-VN");

      return content.includes(keyword);
    });
  }, [data, search, filter, onlySuggested]);

  const selection = useMemo(() => {
    const ids = new Set(selectedIds);

    const selected = data?.files.filter((item) => ids.has(item.id)) ?? [];

    return {
      total: selected.length,
      bc1: selected.filter((item) => item.fileType === "bc1").length,
      bc2: selected.filter((item) => item.fileType === "bc2").length,
    };
  }, [data, selectedIds]);

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((item) => selectedIds.includes(item.id));

  function toggleFile(id: number, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((value) => value !== id);
    });
  }

  function toggleAllVisible(checked: boolean) {
    const visibleIds = new Set(visibleFiles.map((item) => item.id));

    setSelectedIds((current) => {
      if (checked) {
        return [...new Set([...current, ...visibleIds])];
      }

      return current.filter((id) => !visibleIds.has(id));
    });
  }

  async function submit() {
    if (saving || loading || !data) return;

    try {
      setError("");

      // Không yêu cầu bắt buộc phải chọn
      // ít nhất một BC1 hoặc BC2.
      // Một kỳ có thể thiếu hồ sơ và bổ sung sau.
      await onConfirm([...new Set(selectedIds)]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể phê duyệt file 48_."
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      maxWidth="lg"
      fullWidth
      scroll="paper"
    >
      <DialogTitle component="div">
        <Stack
          direction="row"
          sx={{
            spacing: 1,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Phê duyệt file 48_ và tạo kỳ sát hạch
            </Typography>

            <Typography variant="caption" color="text.secondary">
              File #{file?.id} — {file?.originalName}
            </Typography>
          </Box>

          <Chip size="small" label="Chờ duyệt" color="warning" />
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {loading && (
            <Stack sx={{ py: 5, alignItems: "center", spacing: 1.5 }}>
              <CircularProgress />

              <Typography color="text.secondary">
                Đang đọc thông tin XML và tìm BC1, BC2...
              </Typography>
            </Stack>
          )}

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {data && (
            <>
              <Alert severity="info">
                Khi xác nhận, hệ thống sẽ tạo kỳ sát hạch chính thức từ file
                48_, import danh sách thí sinh và liên kết các BC1, BC2 được
                chọn. Không tạo kỳ tạm.
              </Alert>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(4, minmax(0, 1fr))",
                  },
                  gap: 2,
                  p: 2,
                  bgcolor: "action.hover",
                  borderRadius: 2,
                }}
              >
                {[
                  ["Mã kỳ chính thức", data.session.code],
                  ["Ngày sát hạch", formatDate(data.session.examDate)],
                  ["Mã trung tâm sát hạch", data.session.examinationCenterCode],
                  ["Tổng thí sinh", String(data.session.totalCandidates)],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" color="text.secondary">
                      {label}
                    </Typography>

                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {value || "—"}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {data.session.decisionNumber && (
                <Typography variant="body2">
                  <strong>Số quyết định:</strong> {data.session.decisionNumber}
                </Typography>
              )}

              <Divider />

              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                  Lựa chọn BC1 và BC2 liên kết
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Có thể chọn nhiều file của nhiều CSĐT. Danh sách lấy từ hồ sơ
                  đã duyệt và import thành công.
                </Typography>
              </Box>

              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <TextField
                  fullWidth
                  size="small"
                  label="Tìm mã hồ sơ, tên file, mã CSĐT..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  disabled={saving}
                />

                <TextField
                  select
                  size="small"
                  label="Loại hồ sơ"
                  value={filter}
                  onChange={(event) =>
                    setFilter(event.target.value as FileFilter)
                  }
                  sx={{ minWidth: 150 }}
                  disabled={saving}
                >
                  <MenuItem value="all">Tất cả</MenuItem>
                  <MenuItem value="bc1">BC1</MenuItem>
                  <MenuItem value="bc2">BC2</MenuItem>
                </TextField>
              </Stack>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={onlySuggested}
                    onChange={(event) => setOnlySuggested(event.target.checked)}
                    disabled={saving}
                  />
                }
                label="Chỉ hiển thị file thuộc CSĐT có thí sinh trong 48_"
              />

              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{
                  spacing: 1,
                  justifyContent: "space-between",
                  alignItems: {
                    xs: "flex-start",
                    sm: "center",
                  },
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={
                        visibleFiles.some((item) =>
                          selectedIds.includes(item.id)
                        ) && !allVisibleSelected
                      }
                      onChange={(event) =>
                        toggleAllVisible(event.target.checked)
                      }
                      disabled={saving || !visibleFiles.length}
                    />
                  }
                  label="Chọn tất cả trong danh sách đang lọc"
                />

                <Stack direction="row" spacing={1}>
                  <Chip
                    label={`${selection.bc1} BC1`}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                  <Chip
                    label={`${selection.bc2} BC2`}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                </Stack>
              </Stack>

              <Box
                sx={{
                  maxHeight: 390,
                  overflowY: "auto",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                {visibleFiles.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.5,
                      borderBottom: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onChange={(event) =>
                        toggleFile(item.id, event.target.checked)
                      }
                      disabled={saving}
                    />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.fileName}
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {item.schoolCode || "Chưa có mã CSĐT"}
                        {" — "}
                        {item.schoolName || "Chưa có tên CSĐT"}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        Mã báo cáo: {item.reportCode || "—"}
                        {" · "}
                        Batch #{item.importBatchId || "—"}
                      </Typography>
                    </Box>

                    <Stack sx={{ spacing: 0.5, alignItems: "flex-end" }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={fileLabel(item)}
                      />

                      {item.suggested && (
                        <Chip
                          size="small"
                          label="Gợi ý"
                          color="success"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Box>
                ))}

                {!visibleFiles.length && (
                  <Box sx={{ p: 4, textAlign: "center" }}>
                    <Typography color="text.secondary">
                      Không tìm thấy BC1 hoặc BC2 phù hợp với bộ lọc.
                    </Typography>
                  </Box>
                )}
              </Box>

              <Alert severity="warning" variant="outlined">
                Các file được gợi ý theo mã CSĐT, không có nghĩa toàn bộ thí
                sinh đã đối chiếu chính xác. Backend sẽ kiểm tra lại liên kết
                trước khi phê duyệt.
              </Alert>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button disabled={saving} onClick={onClose}>
          Hủy
        </Button>

        <Button
          variant="contained"
          color="success"
          startIcon={
            saving ? (
              <CircularProgress size={16} />
            ) : (
              <CheckCircleOutlineOutlined />
            )
          }
          disabled={saving || loading || !data}
          onClick={() => void submit()}
        >
          {saving ? "Đang phê duyệt..." : "Duyệt và tạo kỳ sát hạch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
