"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import { RefreshOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import { getBc1History, type Bc1HistoryItem } from "@/lib/imports";

export default function ImportHistoryPage() {
  const { accessToken, user, loading } = useAuth();

  const [items, setItems] = useState<Bc1HistoryItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const loadHistory = useCallback(async () => {
    if (!accessToken || !allowed) return;

    setFetching(true);
    setError("");

    try {
      setItems(await getBc1History(accessToken));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải lịch sử import."
      );
    } finally {
      setFetching(false);
    }
  }, [accessToken, allowed]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!allowed) {
    return (
      <Alert severity="error">Bạn không có quyền xem lịch sử import.</Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack
        sx={{
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Lịch sử import XML
          </Typography>

          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Danh sách các lần import BC1 thành công.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={<RefreshOutlined />}
          disabled={fetching}
          onClick={() => void loadHistory()}
          sx={{ textTransform: "none" }}
        >
          Tải lại
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
          {fetching && items.length === 0 ? (
            <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 950 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Mã</TableCell>
                    <TableCell>File</TableCell>
                    <TableCell>Trường</TableCell>
                    <TableCell>Khóa học</TableCell>
                    <TableCell align="right">Tổng HV</TableCell>
                    <TableCell align="right">HV mới</TableCell>
                    <TableCell align="right">Ghi danh mới</TableCell>
                    <TableCell>Người import</TableCell>
                    <TableCell>Thời gian</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>{item.fileName}</TableCell>
                      <TableCell>{item.schoolCode}</TableCell>
                      <TableCell>{item.courseCode}</TableCell>
                      <TableCell align="right">{item.totalStudents}</TableCell>
                      <TableCell align="right">{item.newStudents}</TableCell>
                      <TableCell align="right">{item.newEnrollments}</TableCell>
                      <TableCell>{item.importedBy ?? "—"}</TableCell>
                      <TableCell>
                        {new Date(item.importedAt).toLocaleString("vi-VN")}
                      </TableCell>
                    </TableRow>
                  ))}

                  {!items.length && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <Typography color="text.secondary" sx={{ py: 5 }}>
                          Chưa có lượt import BC1 nào.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
