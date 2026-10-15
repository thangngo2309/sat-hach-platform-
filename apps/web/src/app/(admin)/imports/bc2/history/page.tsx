"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CloseOutlined, RefreshOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  getBc2Candidates,
  getBc2History,
  type Bc2CandidatePage,
  type Bc2History,
} from "@/lib/bc2-imports";

export default function Bc2HistoryPage() {
  const { accessToken, user } = useAuth();

  const [reports, setReports] = useState<Bc2History[]>([]);
  const [selected, setSelected] = useState<Bc2History | null>(null);
  const [candidates, setCandidates] = useState<Bc2CandidatePage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const allowed = user?.role === "super_admin" || user?.role === "admin";

  const load = useCallback(async () => {
    if (!accessToken || !allowed) return;

    setLoading(true);
    setError("");

    try {
      setReports(await getBc2History(accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || !accessToken) return;

    let active = true;
    setDetailLoading(true);

    void getBc2Candidates(selected.id, page, accessToken)
      .then((data) => {
        if (active) setCandidates(data);
      })
      .catch((e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : "Lỗi tải thí sinh.");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selected, page, accessToken]);

  if (!allowed) {
    return <Alert severity="error">Không có quyền xem dữ liệu BC2.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Lịch sử báo cáo BC2
          </Typography>
          <Typography color="text.secondary">
            Theo dõi file đã import và danh sách thí sinh.
          </Typography>
        </Box>

        <Stack direction="row" sx={{ gap: 1 }}>
          <Button
            component={Link}
            href="/imports/bc2"
            variant="contained"
            sx={{ textTransform: "none" }}
          >
            Import BC2
          </Button>
          <Button
            onClick={() => void load()}
            startIcon={<RefreshOutlined />}
            disabled={loading}
            variant="outlined"
            sx={{ textTransform: "none" }}
          >
            Tải lại
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        {loading && !reports.length ? (
          <Box sx={{ p: 6, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Mã BC2</TableCell>
                  <TableCell>Tham chiếu BC1</TableCell>
                  <TableCell>Trường đào tạo</TableCell>
                  <TableCell>Tên file</TableCell>
                  <TableCell align="right">Thí sinh</TableCell>
                  <TableCell align="right">Hồ sơ mới</TableCell>
                  <TableCell>Người import</TableCell>
                  <TableCell>Ngày import</TableCell>
                  <TableCell>Thao tác</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {report.bc2Code}
                    </TableCell>
                    <TableCell>{report.bc1Code ?? "—"}</TableCell>
                    <TableCell>{report.schoolName}</TableCell>
                    <TableCell>{report.fileName}</TableCell>
                    <TableCell align="right">
                      {report.totalCandidates}
                    </TableCell>
                    <TableCell align="right">{report.newStudents}</TableCell>
                    <TableCell>{report.importedBy ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(report.importedAt).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => {
                          setSelected(report);
                          setCandidates(null);
                          setPage(1);
                        }}
                      >
                        Xem thí sinh
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!reports.length && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                      Chưa có báo cáo BC2.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        fullWidth
        maxWidth="lg"
        fullScreen={false}
      >
        <DialogTitle component="div">
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Thí sinh BC2 – {selected?.bc2Code}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {selected?.schoolName}
              </Typography>
            </Box>
            <IconButton onClick={() => setSelected(null)}>
              <CloseOutlined />
            </IconButton>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {detailLoading ? (
            <Box sx={{ display: "grid", placeItems: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2}>
              <TableContainer>
                <Table size="small" sx={{ minWidth: 750 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>STT</TableCell>
                      <TableCell>Mã đăng ký</TableCell>
                      <TableCell>Họ và tên</TableCell>
                      <TableCell>Ngày sinh</TableCell>
                      <TableCell>CCCD</TableCell>
                      <TableCell>Số hồ sơ</TableCell>
                      <TableCell>Hạng đề nghị</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(candidates?.data ?? []).map((candidate) => (
                      <TableRow key={candidate.id}>
                        <TableCell>{candidate.sourceOrder}</TableCell>
                        <TableCell>{candidate.registrationCode}</TableCell>
                        <TableCell>{candidate.fullName}</TableCell>
                        <TableCell>{candidate.dateOfBirth ?? "—"}</TableCell>
                        <TableCell>{candidate.identityNumber ?? "—"}</TableCell>
                        <TableCell>{candidate.fileNumber ?? "—"}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={candidate.requestedLicenseClass ?? "—"}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {(candidates?.pagination.totalPages ?? 0) > 1 && (
                <Stack sx={{ alignItems: "center" }}>
                  <Pagination
                    page={page}
                    count={candidates!.pagination.totalPages}
                    onChange={(_, value) => setPage(value)}
                  />
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
