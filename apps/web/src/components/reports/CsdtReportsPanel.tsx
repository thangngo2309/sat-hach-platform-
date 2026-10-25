"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import { RefreshOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import { ExportExcelButton } from "@/components/common/ExportExcelButton";

import {
  getCsdtReport,
  getCsdtReportFilters,
  type CsdtReport,
  type CsdtFilters,
  type CsdtReportParams,
} from "@/lib/csdt-reports";

import {
  exportCsdtReportExcel,
  findPart,
  rollupCsdtRows,
} from "@/lib/csdt-report-export";

const nf = (value?: number | null) =>
  Number(value ?? 0).toLocaleString("vi-VN");

const percentage = (n: number, d: number) =>
  d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
}

function StatisticsCards({ report }: { report: CsdtReport | null }) {
  const total = report?.total;

  const items = [
    {
      label: "Tổng kỳ sát hạch",
      value: total?.sessions,
      color: "text.primary",
    },
    {
      label: "Tổng lượt xếp kỳ",
      value: total?.scheduled,
      color: "text.primary",
    },
    {
      label: "Lượt dự thực tế*",
      value: total?.attended,
      color: "info.main",
    },
    {
      label: "Lượt đạt",
      value: total?.passed,
      color: "success.main",
    },
    {
      label: "Lượt không đạt",
      value: total?.failed,
      color: "error.main",
    },
    {
      label: "Lượt có vắng",
      value: total?.absent,
      color: "warning.main",
    },
    {
      label: "Lượt thi lại",
      value: total?.retake,
      color: "info.main",
    },
    {
      label: "Tỷ lệ đạt / có KQ",
      value: total
        ? percentage(total.passed, total.passed + total.failed)
        : "—",
      color: "success.main",
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          md: "repeat(4, minmax(0, 1fr))",
        },
        gap: 1.5,
      }}
    >
      {items.map((item) => (
        <Card
          key={item.label}
          variant="outlined"
          sx={{ borderRadius: 2.5, minWidth: 0 }}
        >
          <CardContent>
            <Typography color="text.secondary" variant="caption">
              {item.label}
            </Typography>

            <Typography
              variant="h5"
              sx={{
                mt: 0.75,
                fontWeight: 800,
                color: item.color,
              }}
            >
              {typeof item.value === "number"
                ? nf(item.value)
                : item.value ?? "0"}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function GroupTable({ report }: { report: CsdtReport }) {
  const rows = rollupCsdtRows(report);

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 3, minWidth: 0, overflow: "hidden" }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Kết quả sát hạch theo cơ sở đào tạo
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Mỗi cơ sở gồm SH lần đầu, SH lại và Tổng. Cuộn ngang để xem đầy đủ chỉ
          tiêu.
        </Typography>
      </CardContent>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            minWidth: 1700,
            "& th": {
              whiteSpace: "nowrap",
              fontWeight: 700,
              bgcolor: "#f1f5f9",
            },
            "& td": {
              whiteSpace: "nowrap",
            },
          }}
        >
          <TableHead>
            <TableRow>
              {[
                "Cơ sở đào tạo",
                "Hình thức",
                "Số kỳ*",
                "Mô tô",
                "Ô tô",
                "Lượt xếp",
                "Vắng",
                "Vắng (%)",
                "Dự thi",
                "Dự thi (%)",
                "Mô tô đạt",
                "Ô tô đạt",
                "Tổng đạt",
                "Tỷ lệ đạt (%)",
                "Không đạt",
                "Chờ KQ",
              ].map((label) => (
                <TableCell
                  key={label}
                  align={
                    ["Cơ sở đào tạo", "Hình thức"].includes(label)
                      ? "left"
                      : "right"
                  }
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={`${row.schoolId}-${row.mode}`}
                hover
                sx={{
                  bgcolor: row.mode === "total" ? "#eaf2fa" : undefined,
                }}
              >
                <TableCell
                  sx={{
                    fontWeight: row.mode === "total" ? 800 : 500,
                  }}
                >
                  {row.schoolName}
                </TableCell>

                <TableCell>
                  <Chip
                    size="small"
                    color={row.mode === "total" ? "primary" : "default"}
                    variant={row.mode === "total" ? "filled" : "outlined"}
                    label={
                      row.mode === "first"
                        ? "SH lần đầu"
                        : row.mode === "retake"
                        ? "SH lại"
                        : "Tổng"
                    }
                  />
                </TableCell>

                <TableCell align="right">{row.sessions || "—"}</TableCell>

                <TableCell align="right">{nf(row.motorcycle)}</TableCell>

                <TableCell align="right">{nf(row.car)}</TableCell>

                <TableCell align="right">{nf(row.scheduled)}</TableCell>

                <TableCell align="right">{nf(row.absent)}</TableCell>

                <TableCell align="right">
                  {percentage(row.absent, row.scheduled)}
                </TableCell>

                <TableCell align="right">{nf(row.attended)}</TableCell>

                <TableCell align="right">
                  {percentage(row.attended, row.scheduled)}
                </TableCell>

                <TableCell align="right">{nf(row.passed_motorcycle)}</TableCell>

                <TableCell align="right">{nf(row.passed_car)}</TableCell>

                <TableCell
                  align="right"
                  sx={{
                    color: "success.main",
                    fontWeight: 700,
                  }}
                >
                  {nf(row.passed)}
                </TableCell>

                <TableCell align="right">
                  {percentage(row.passed, row.passed + row.failed)}
                </TableCell>

                <TableCell align="right">{nf(row.failed)}</TableCell>

                <TableCell align="right">{nf(row.pending)}</TableCell>
              </TableRow>
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={16} align="center">
                  Chưa có dữ liệu trong phạm vi đã chọn.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

function PartsTable({ report }: { report: CsdtReport }) {
  const rows = rollupCsdtRows(report).filter((row) => row.mode === "total");

  const specs = [
    {
      label: "Lý thuyết mô tô",
      vehicle: "motorcycle",
      codes: ["LT", "L"],
    },
    {
      label: "Lý thuyết ô tô",
      vehicle: "car",
      codes: ["LT", "L"],
    },
    {
      label: "Mô phỏng",
      vehicle: "car",
      codes: ["MP", "M"],
    },
    {
      label: "Hình mô tô",
      vehicle: "motorcycle",
      codes: ["H", "SH"],
    },
    {
      label: "Hình ô tô",
      vehicle: "car",
      codes: ["H", "SH"],
    },
    {
      label: "Đường trường",
      vehicle: "car",
      codes: ["D", "DD"],
    },
  ];

  function rank(index: number, key: string) {
    const spec = specs[index];

    const list = rows
      .map((row) => {
        const item = findPart(
          report.parts,
          row.schoolId,
          "total",
          spec.vehicle,
          spec.codes
        );

        const denominator = item.passed + item.failed;

        return {
          key: String(row.schoolId),
          value: denominator > 0 ? item.passed / denominator : null,
        };
      })
      .filter((item) => item.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const position = list.findIndex((item) => item.key === key);

    if (position < 0) return "—";

    return (
      1 +
      list.filter((item) => (item.value ?? 0) > (list[position].value ?? 0))
        .length
    );
  }

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 3, minWidth: 0, overflow: "hidden" }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Kết quả và xếp hạng theo từng phần thi
        </Typography>

        <Typography color="text.secondary" variant="caption">
          Tỷ lệ = Đạt / (Đạt + Không đạt). Các CSDT đồng tỷ lệ được đồng hạng.
          Vắng không tính vào mẫu số.
        </Typography>
      </CardContent>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            minWidth: 1520,
            "& th": {
              fontWeight: 700,
              bgcolor: "#f1f5f9",
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2} sx={{ minWidth: 210 }}>
                Cơ sở đào tạo
              </TableCell>

              {specs.map((spec) => (
                <TableCell
                  key={spec.label}
                  colSpan={2}
                  align="center"
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {spec.label}
                </TableCell>
              ))}
            </TableRow>

            <TableRow>
              {specs
                .map((spec) => (
                  <TableCell key={`${spec.label}-ratio`} align="center">
                    Đạt / Dự thi (%)
                  </TableCell>
                ))
                .flatMap((ratioCell, index) => [
                  ratioCell,
                  <TableCell key={`${specs[index].label}-rank`} align="center">
                    Hạng
                  </TableCell>,
                ])}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={String(row.schoolId)} hover>
                <TableCell sx={{ fontWeight: 600 }}>{row.schoolName}</TableCell>

                {specs.flatMap((spec, index) => {
                  const result = findPart(
                    report.parts,
                    row.schoolId,
                    "total",
                    spec.vehicle,
                    spec.codes
                  );

                  const denominator = result.passed + result.failed;

                  return [
                    <TableCell key={`${index}-ratio`} align="center">
                      {denominator > 0
                        ? `${result.passed}/${denominator} (${percentage(
                            result.passed,
                            denominator
                          )})`
                        : "—"}
                    </TableCell>,

                    <TableCell
                      key={`${index}-rank`}
                      align="center"
                      sx={{ fontWeight: 700 }}
                    >
                      {rank(index, String(row.schoolId))}
                    </TableCell>,
                  ];
                })}
              </TableRow>
            ))}

            {!rows.length && (
              <TableRow>
                <TableCell colSpan={13} align="center">
                  Chưa có dữ liệu phần thi.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

function QualityTable({ report }: { report: CsdtReport }) {
  const rows = rollupCsdtRows(report).filter((row) => row.mode === "total");

  return (
    <Card
      variant="outlined"
      sx={{ borderRadius: 3, minWidth: 0, overflow: "hidden" }}
    >
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Bảng đánh giá chất lượng — theo CSDT
        </Typography>

        <Typography variant="caption" color="text.secondary">
          Các chỉ tiêu được tính từ KQSH. Sự cố kỹ thuật chưa có nguồn dữ liệu.
        </Typography>
      </CardContent>

      <TableContainer sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          sx={{
            minWidth: 1000,
            "& th": {
              fontWeight: 700,
              bgcolor: "#f1f5f9",
            },
          }}
        >
          <TableHead>
            <TableRow>
              {[
                "Cơ sở đào tạo",
                "Số kỳ*",
                "Lượt xếp",
                "Lượt dự thi*",
                "Lượt đạt",
                "Tỷ lệ đạt (%)",
                "Lỗi thiết bị",
                "Lỗi đường truyền",
              ].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={String(row.schoolId)}>
                <TableCell sx={{ fontWeight: 700 }}>{row.schoolName}</TableCell>

                <TableCell>{row.sessions}</TableCell>
                <TableCell>{nf(row.scheduled)}</TableCell>
                <TableCell>{nf(row.attended)}</TableCell>
                <TableCell>{nf(row.passed)}</TableCell>

                <TableCell>
                  {percentage(row.passed, row.passed + row.failed)}
                </TableCell>

                <TableCell>Chưa có dữ liệu</TableCell>
                <TableCell>Chưa có dữ liệu</TableCell>
              </TableRow>
            ))}

            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  Chưa có dữ liệu đánh giá.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export function CsdtReportsPanel() {
  const { accessToken, loading: authLoading } = useAuth();

  const today = new Date();

  const [filters, setFilters] = useState<CsdtReportParams>({
    period: "month",
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    quarter: Math.floor(today.getMonth() / 3) + 1,
    vehicle: "all",
  });

  const [options, setOptions] = useState<CsdtFilters | null>(null);

  const [report, setReport] = useState<CsdtReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  function update(patch: Partial<CsdtReportParams>) {
    setFilters((previous) => ({
      ...previous,
      ...patch,
    }));
  }

  const selectionKey = JSON.stringify([
    filters.period,
    filters.year,
    filters.month,
    filters.quarter,
    filters.fromDate,
    filters.toDate,
    filters.schoolId,
  ]);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    setFiltersLoading(true);

    void getCsdtReportFilters(accessToken, filters)
      .then((result) => {
        if (!active) return;

        setOptions(result);

        if (
          filters.sessionId &&
          !result.sessions.some((item) => item.id === filters.sessionId)
        ) {
          update({ sessionId: null });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;

        setError(
          error instanceof Error ? error.message : "Không thể tải bộ lọc."
        );
      })
      .finally(() => {
        if (active) setFiltersLoading(false);
      });

    return () => {
      active = false;
    };

    // selectionKey đại diện các trường ảnh hưởng bộ lọc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, selectionKey, reload]);

  const reportKey = JSON.stringify(filters);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;

    setLoading(true);
    setError("");

    void getCsdtReport(accessToken, filters)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((error: unknown) => {
        if (!active) return;

        setReport(null);
        setError(
          error instanceof Error ? error.message : "Không thể tải báo cáo."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, reportKey, reload]);

  const title = useMemo(() => {
    const value = report?.filters ?? filters;

    if (value.period === "month") {
      return `Tháng ${value.month}/${value.year}`;
    }

    if (value.period === "quarter") {
      return `Quý ${value.quarter}/${value.year}`;
    }

    if (value.period === "year") {
      return `Năm ${value.year}`;
    }

    return (
      `Từ ${formatDate(value.fromDate)}` + ` đến ${formatDate(value.toDate)}`
    );
  }, [report, filters]);

  if (authLoading) {
    return (
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          py: 8,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0, maxWidth: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          spacing: 2,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Báo cáo tổng hợp theo cơ sở đào tạo
          </Typography>

          <Typography color="text.secondary">
            Sát hạch lần đầu, sát hạch lại, kết quả từng phần và đánh giá chất
            lượng.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <ExportExcelButton
            disabled={!report || loading}
            onExport={async () => {
              if (!report) {
                throw new Error("Chưa có dữ liệu báo cáo.");
              }

              await exportCsdtReportExcel(report, title);
            }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => setReload((value) => value + 1)}
            disabled={loading}
          >
            Tải lại
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography sx={{ fontWeight: 700, mb: 2 }}>
            Bộ lọc báo cáo
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "repeat(4, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            <TextField
              select
              label="Kỳ báo cáo"
              size="small"
              value={filters.period}
              onChange={(event) =>
                update({
                  period: event.target.value as CsdtReportParams["period"],
                  sessionId: null,
                  schoolId: null,
                })
              }
            >
              <MenuItem value="month">Theo tháng</MenuItem>

              <MenuItem value="quarter">Theo quý</MenuItem>

              <MenuItem value="year">Theo năm</MenuItem>

              <MenuItem value="custom">Từ ngày đến ngày</MenuItem>
            </TextField>

            {filters.period !== "custom" && (
              <TextField
                label="Năm"
                size="small"
                type="number"
                value={filters.year}
                onChange={(event) =>
                  update({
                    year: Number(event.target.value),
                    schoolId: null,
                    sessionId: null,
                  })
                }
                slotProps={{
                  htmlInput: {
                    min: 2000,
                    max: 2100,
                  },
                }}
              />
            )}

            {filters.period === "month" && (
              <TextField
                select
                label="Tháng"
                size="small"
                value={filters.month}
                onChange={(event) =>
                  update({
                    month: Number(event.target.value),
                    schoolId: null,
                    sessionId: null,
                  })
                }
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map(
                  (value) => (
                    <MenuItem key={value} value={value}>
                      Tháng {value}
                    </MenuItem>
                  )
                )}
              </TextField>
            )}

            {filters.period === "quarter" && (
              <TextField
                select
                label="Quý"
                size="small"
                value={filters.quarter}
                onChange={(event) =>
                  update({
                    quarter: Number(event.target.value),
                    schoolId: null,
                    sessionId: null,
                  })
                }
              >
                {[1, 2, 3, 4].map((value) => (
                  <MenuItem key={value} value={value}>
                    Quý {value}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {filters.period === "custom" && (
              <>
                <TextField
                  label="Từ ngày"
                  size="small"
                  type="date"
                  value={filters.fromDate ?? ""}
                  onChange={(event) =>
                    update({
                      fromDate: event.target.value,
                      schoolId: null,
                      sessionId: null,
                    })
                  }
                  slotProps={{
                    inputLabel: { shrink: true },
                  }}
                />

                <TextField
                  label="Đến ngày"
                  size="small"
                  type="date"
                  value={filters.toDate ?? ""}
                  onChange={(event) =>
                    update({
                      toDate: event.target.value,
                      schoolId: null,
                      sessionId: null,
                    })
                  }
                  slotProps={{
                    inputLabel: { shrink: true },
                  }}
                />
              </>
            )}

            <TextField
              select
              label="Cơ sở đào tạo"
              size="small"
              value={filters.schoolId ? String(filters.schoolId) : ""}
              disabled={filtersLoading}
              onChange={(event) =>
                update({
                  schoolId: Number(event.target.value) || null,
                  sessionId: null,
                })
              }
            >
              <MenuItem value="">Tất cả CSDT</MenuItem>

              {(options?.schools ?? []).map((school) => (
                <MenuItem key={school.id} value={String(school.id)}>
                  {school.name} ({school.code})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Loại phương tiện"
              size="small"
              value={filters.vehicle ?? "all"}
              onChange={(event) =>
                update({
                  vehicle: event.target.value as CsdtReportParams["vehicle"],
                })
              }
            >
              <MenuItem value="all">Mô tô và ô tô</MenuItem>

              <MenuItem value="motorcycle">Mô tô</MenuItem>

              <MenuItem value="car">Ô tô</MenuItem>
            </TextField>

            <TextField
              select
              label="Kỳ sát hạch"
              size="small"
              value={filters.sessionId ? String(filters.sessionId) : ""}
              disabled={filtersLoading}
              onChange={(event) =>
                update({
                  sessionId: Number(event.target.value) || null,
                })
              }
            >
              <MenuItem value="">Tất cả kỳ</MenuItem>

              {(options?.sessions ?? []).map((session) => (
                <MenuItem key={session.id} value={String(session.id)}>
                  {session.code} · {formatDate(session.examDate)}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {(loading || filtersLoading) && (
            <Stack
              direction="row"
              sx={{ mt: 2, alignItems: "center", spacing: 1 }}
            >
              <CircularProgress size={16} />

              <Typography variant="caption" color="text.secondary">
                Đang cập nhật dữ liệu...
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Kết quả báo cáo: {title}
      </Typography>

      <StatisticsCards report={report} />

      {report && (
        <>
          <GroupTable report={report} />

          <PartsTable report={report} />

          <QualityTable report={report} />

          <Alert severity="info">
            <strong>Lưu ý phương pháp thống kê:</strong>{" "}
            {report.methodology.mode} {report.methodology.attendance}{" "}
            {report.methodology.caution}
          </Alert>

          <Typography variant="caption" color="text.secondary">
            * Số kỳ “Tổng” là số kỳ duy nhất theo từng CSDT. Số kỳ của hai dòng
            lần đầu và thi lại có thể cùng thuộc một kỳ, nên không cộng chúng để
            ra tổng.
          </Typography>
        </>
      )}
    </Stack>
  );
}
