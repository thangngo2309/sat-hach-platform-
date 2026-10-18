"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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

import { useAuth } from "@/components/auth/AuthProvider";

import { getExamSessions, type ExamSession } from "@/lib/exam-results";

export default function ExamsPage() {
  const { accessToken } = useAuth();

  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;

    let active = true;

    void getExamSessions(accessToken)
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Không tải được các kỳ sát hạch."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{ justifyContent: "space-between", spacing: 2 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Kỳ sát hạch
          </Typography>
          <Typography color="text.secondary">
            Quản lý danh sách dự thi và kết quả sát hạch.
          </Typography>
        </Box>

        <Button
          component={Link}
          href="/imports/exam-result"
          variant="contained"
        >
          Import KQSH
        </Button>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined">
        <CardContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 5 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table sx={{ minWidth: 780 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Mã kỳ</TableCell>
                    <TableCell>Ngày thi</TableCell>
                    <TableCell>Trung tâm sát hạch</TableCell>
                    <TableCell align="right">Thí sinh</TableCell>
                    <TableCell align="right">Đạt</TableCell>
                    <TableCell align="right">Không đạt</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700 }}>
                          {session.code}
                        </Typography>
                      </TableCell>
                      <TableCell>{session.examDate ?? "—"}</TableCell>
                      <TableCell>
                        {session.centerName || `TTSH ${session.centerCode}`}
                      </TableCell>
                      <TableCell align="right">
                        {session.totalCandidates}
                      </TableCell>
                      <TableCell align="right">{session.passed}</TableCell>
                      <TableCell align="right">{session.failed}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            session.withResults === session.totalCandidates &&
                            session.totalCandidates > 0
                              ? "success"
                              : session.withResults > 0
                              ? "warning"
                              : "default"
                          }
                          label={
                            session.withResults === 0
                              ? "Chưa có kết quả"
                              : `${session.withResults}/${session.totalCandidates} đã có kết quả`
                          }
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          component={Link}
                          size="small"
                          href={`/exams/${encodeURIComponent(session.code)}`}
                        >
                          Chi tiết
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!sessions.length && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                        Chưa có kỳ sát hạch nào.
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
