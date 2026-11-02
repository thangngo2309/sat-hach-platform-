"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Pagination,
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

import {
  DescriptionOutlined,
  RefreshOutlined,
  SearchOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  getRelatedReviewFiles,
  getReviewCandidates,
  getReviewOverview,
  listReviewFiles,
  getReviewOrganizationOptions,
  type ReviewOrganizationOptions,
  type MatchStatus,
  type RelatedFile,
  type ReviewCandidate,
  type ReviewFile,
  type ReviewOverview,
} from "@/lib/file-review";

const FILE_LABELS: Record<string, string> = {
  bc1: "BC1",
  bc2: "BC2",
  bc2_result: "Kết quả BC2 PC08",
  exam_48: "Danh sách 48_",
  exam_result: "KQSH",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  processing: "Đang xử lý",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};

const MATCH_LABELS: Record<MatchStatus, string> = {
  new: "Chưa có",
  matched: "Đã khớp",
  conflict: "Khác dữ liệu",
  possible_match: "Trùng CCCD",
};

function MatchChip({ status }: { status: MatchStatus }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      label={MATCH_LABELS[status]}
      color={
        status === "matched"
          ? "success"
          : status === "conflict"
          ? "error"
          : status === "possible_match"
          ? "warning"
          : "default"
      }
    />
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function formatSize(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function FileReviewWorkspace() {
  const { accessToken, user } = useAuth();

  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState("");
  const [status, setStatus] = useState("");
  const [trainingSchoolId, setTrainingSchoolId] = useState("");
  const [examinationCenterId, setExaminationCenterId] = useState("");

  const [organizations, setOrganizations] = useState<ReviewOrganizationOptions>(
    {
      trainingSchools: [],
      examinationCenters: [],
    }
  );

  const [reload, setReload] = useState(0);

  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [version, setVersion] = useState<number | undefined>();

  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("");

  const [selectedCandidate, setSelectedCandidate] =
    useState<ReviewCandidate | null>(null);
  const [related, setRelated] = useState<RelatedFile[]>([]);
  const [relatedMessage, setRelatedMessage] = useState("");
  const [loadingRelated, setLoadingRelated] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  const authorized = [
    "super_admin",
    "training_school",
    "pc08_staff",
    "exam_center",
  ].includes(user?.role ?? "");

  useEffect(() => {
    if (!accessToken || !authorized) return;

    let active = true;

    void getReviewOrganizationOptions(accessToken)
      .then((result) => {
        if (active) setOrganizations(result);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Không tải được danh mục đơn vị."
          );
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken, authorized]);

  const loadFiles = useCallback(async () => {
    if (!accessToken || !authorized) return;

    setLoading(true);
    setError("");

    try {
      const response = await listReviewFiles(accessToken, {
        page,
        limit: 20,
        search,
        fileType,
        status,
        trainingSchoolId: trainingSchoolId
          ? Number(trainingSchoolId)
          : undefined,
        examinationCenterId: examinationCenterId
          ? Number(examinationCenterId)
          : undefined,
      });

      setFiles(response.data);
      setTotal(response.pagination.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể tải danh sách file."
      );
    } finally {
      setLoading(false);
    }
  }, [
    accessToken,
    authorized,
    page,
    search,
    fileType,
    status,
    trainingSchoolId,
    examinationCenterId,
    reload,
  ]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const loadReview = useCallback(async () => {
    if (!accessToken || reviewId === null) return;

    setLoadingReview(true);
    setDetailError("");

    try {
      const [info, people] = await Promise.all([
        getReviewOverview(accessToken, reviewId, version),
        getReviewCandidates(accessToken, reviewId, {
          version,
          page: candidatePage,
          limit: 20,
          search: candidateSearch,
          matchStatus: matchFilter,
        }),
      ]);

      setOverview(info);
      setCandidates(people.data);
      setCandidateTotal(people.pagination.total);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : "Không thể phân tích file."
      );
    } finally {
      setLoadingReview(false);
    }
  }, [
    accessToken,
    reviewId,
    version,
    candidatePage,
    candidateSearch,
    matchFilter,
  ]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  function searchCandidates() {
    const keyword = candidateSearchText.trim();

    setCandidatePage(1);
    setCandidateSearch(keyword);
  }

  function openReview(id: number) {
    setOverview(null);
    setCandidates([]);
    setReviewId(id);
    setVersion(undefined);
    setCandidatePage(1);
    setCandidateSearch("");
    setCandidateSearchText("");
    setMatchFilter("");
    setDetailError("");
    setSelectedCandidate(null);
  }

  function closeReview() {
    setReviewId(null);
    setOverview(null);
    setCandidates([]);
    setSelectedCandidate(null);
  }

  async function openCandidate(candidate: ReviewCandidate) {
    setSelectedCandidate(candidate);
    setRelated([]);
    setRelatedMessage("");
    setLoadingRelated(true);

    if (!accessToken || reviewId === null) {
      setLoadingRelated(false);
      return;
    }

    try {
      const response = await getRelatedReviewFiles(
        accessToken,
        reviewId,
        candidate.registrationCode
      );

      setRelated(response.related);
      setRelatedMessage(response.message);
    } catch (err) {
      setRelatedMessage(
        err instanceof Error
          ? err.message
          : "Không thể kiểm tra file liên quan."
      );
    } finally {
      setLoadingRelated(false);
    }
  }

  function searchFiles() {
    setPage(1);
    setSearch(searchText.trim());
  }

  if (!authorized) {
    return (
      <Alert severity="error">
        Tài khoản không có quyền xem danh sách file.
      </Alert>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Quản lý và Review File
        </Typography>
        <Typography color="text.secondary">
          Kiểm tra nội dung học viên, đối chiếu database và tra cứu những file
          được phép xem.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1}
            sx={{ alignItems: { md: "flex-start" } }}
          >
            <TextField
              size="small"
              fullWidth
              label="Tìm kiếm thí sinh"
              placeholder="Họ tên, CCCD, mã đăng ký, số báo danh..."
              value={candidateSearchText}
              onChange={(event) => setCandidateSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchCandidates();
                }
              }}
            />

            <TextField
              select
              size="small"
              label="Đối chiếu"
              value={matchFilter}
              onChange={(event) => {
                setMatchFilter(event.target.value);
                setCandidatePage(1);
              }}
              sx={{ minWidth: { md: 190 } }}
            >
              <MenuItem value="">Tất cả</MenuItem>

              {Object.entries(MATCH_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>

            <Button
              variant="contained"
              startIcon={<SearchOutlined />}
              disabled={loadingReview}
              onClick={searchCandidates}
              sx={{ minHeight: 40, whiteSpace: "nowrap" }}
            >
              Tìm kiếm
            </Button>
          </Stack>

          <Stack
            direction="row"
            useFlexGap
            sx={{ flexWrap: "wrap", spacing: 1 }}
          >
            <TextField
              select
              size="small"
              label="Loại file"
              value={fileType}
              onChange={(event) => {
                setFileType(event.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 190 }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(FILE_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Trạng thái"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Cơ sở đào tạo"
              value={trainingSchoolId}
              onChange={(event) => {
                setTrainingSchoolId(event.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Tất cả CSĐT</MenuItem>

              {organizations.trainingSchools.map((school) => (
                <MenuItem key={school.id} value={String(school.id)}>
                  {school.code} — {school.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Trung tâm sát hạch"
              value={examinationCenterId}
              onChange={(event) => {
                setExaminationCenterId(event.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="">Tất cả TTSH</MenuItem>

              {organizations.examinationCenters.map((center) => (
                <MenuItem key={center.id} value={String(center.id)}>
                  {center.code} — {center.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 1000 }}>
            <TableHead>
              <TableRow>
                <TableCell>File</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell>Người gửi</TableCell>
                <TableCell>Đơn vị</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Ngày gửi</TableCell>
                <TableCell align="right">Thao tác</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id} hover>
                  <TableCell>
                    <Stack
                      direction="row"
                      sx={{ spacing: 1, alignItems: "center" }}
                    >
                      <DescriptionOutlined color="action" fontSize="small" />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 700,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {file.originalName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          #{file.id} · {formatSize(file.sizeBytes)} · Bản{" "}
                          {file.currentVersion}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>

                  <TableCell>{FILE_LABELS[file.fileType]}</TableCell>

                  <TableCell>{file.uploaderName}</TableCell>

                  <TableCell>
                    {file.trainingSchoolName ||
                      file.examinationCenterName ||
                      "—"}
                  </TableCell>

                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={
                        file.status === "approved"
                          ? "success"
                          : file.status === "rejected"
                          ? "error"
                          : "warning"
                      }
                      label={STATUS_LABELS[file.status] ?? file.status}
                    />
                  </TableCell>

                  <TableCell>{formatDate(file.createdAt)}</TableCell>

                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<VisibilityOutlined />}
                      onClick={() => openReview(file.id)}
                      sx={{
                        textTransform: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Xem nội dung
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    Không có file phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack
          direction="row"
          sx={{ p: 2, justifyContent: "space-between", alignItems: "center" }}
        >
          <Typography variant="body2" color="text.secondary">
            {total.toLocaleString("vi-VN")} file
          </Typography>

          <Pagination
            size="small"
            page={page}
            count={Math.max(1, Math.ceil(total / 20))}
            onChange={(_, value) => setPage(value)}
          />
        </Stack>
      </Card>

      <Dialog
        open={reviewId !== null}
        onClose={closeReview}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Review: {overview?.file.originalName ?? `#${reviewId}`}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2.5}>
            {detailError && <Alert severity="error">{detailError}</Alert>}

            {loadingReview && (
              <Stack direction="row" sx={{ alignItems: "center", spacing: 1 }}>
                <CircularProgress size={20} />
                <Typography>Đang đọc file và đối chiếu DB...</Typography>
              </Stack>
            )}

            {overview && (
              <>
                <Stack
                  direction="row"
                  useFlexGap
                  sx={{ flexWrap: "wrap", spacing: 1 }}
                >
                  <Chip
                    label={
                      FILE_LABELS[overview.file.fileType] ??
                      overview.file.fileType
                    }
                  />
                  <Chip
                    label={
                      STATUS_LABELS[overview.file.status] ??
                      overview.file.status
                    }
                    variant="outlined"
                  />
                  <Chip
                    label={`Phiên bản ${overview.file.version}`}
                    variant="outlined"
                  />
                  <Chip
                    label={`Người gửi: ${overview.file.uploaderName}`}
                    variant="outlined"
                  />
                </Stack>

                <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1 }}
                  >
                    Thông tin trong file
                  </Typography>

                  <Box
                    component="pre"
                    sx={{
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      m: 0,
                    }}
                  >
                    {JSON.stringify(overview.metadata, null, 2)}
                  </Box>
                </Card>

                {!overview.supported && (
                  <Alert severity="info">
                    {overview.message ||
                      "File này chưa hỗ trợ trích xuất học viên."}
                  </Alert>
                )}

                {overview.summary && (
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{ flexWrap: "wrap", spacing: 1 }}
                  >
                    <Chip label={`Tổng: ${overview.summary.totalCandidates}`} />
                    <Chip
                      color="success"
                      label={`Đã khớp: ${overview.summary.matched}`}
                    />
                    <Chip label={`Chưa có: ${overview.summary.new}`} />
                    <Chip
                      color="warning"
                      label={`Trùng CCCD: ${overview.summary.possibleMatch}`}
                    />
                    <Chip
                      color="error"
                      label={`Khác dữ liệu: ${overview.summary.conflict}`}
                    />
                  </Stack>
                )}

                {overview.supported && (
                  <>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Tìm họ tên, CCCD, mã đăng ký..."
                        value={candidateSearchText}
                        onChange={(event) =>
                          setCandidateSearchText(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            setCandidatePage(1);
                            setCandidateSearch(candidateSearchText.trim());
                          }
                        }}
                      />

                      <TextField
                        select
                        size="small"
                        label="Đối chiếu"
                        value={matchFilter}
                        onChange={(event) => {
                          setMatchFilter(event.target.value);
                          setCandidatePage(1);
                        }}
                        sx={{ minWidth: 190 }}
                      >
                        <MenuItem value="">Tất cả</MenuItem>
                        {Object.entries(MATCH_LABELS).map(([key, label]) => (
                          <MenuItem key={key} value={key}>
                            {label}
                          </MenuItem>
                        ))}
                      </TextField>

                      <Button
                        variant="outlined"
                        onClick={() => {
                          setCandidatePage(1);
                          setCandidateSearch(candidateSearchText.trim());
                        }}
                      >
                        Tìm
                      </Button>
                    </Stack>

                    <TableContainer>
                      <Table size="small" sx={{ minWidth: 850 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell>STT</TableCell>
                            <TableCell>Mã đăng ký</TableCell>
                            <TableCell>Họ tên</TableCell>
                            <TableCell>CCCD</TableCell>
                            <TableCell>Ngày sinh</TableCell>
                            <TableCell>Đối chiếu DB</TableCell>
                            <TableCell align="right">Chi tiết</TableCell>
                          </TableRow>
                        </TableHead>

                        <TableBody>
                          {candidates.map((item) => (
                            <TableRow
                              key={`${item.registrationCode}-${item.order}`}
                              hover
                            >
                              <TableCell>{item.order}</TableCell>
                              <TableCell>{item.registrationCode}</TableCell>
                              <TableCell>{item.fullName ?? "—"}</TableCell>
                              <TableCell>
                                {item.identityNumber ?? "—"}
                              </TableCell>
                              <TableCell>{item.dateOfBirth ?? "—"}</TableCell>
                              <TableCell>
                                <MatchChip status={item.matchStatus} />
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  onClick={() => void openCandidate(item)}
                                >
                                  Xem
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}

                          {candidates.length === 0 && !loadingReview && (
                            <TableRow>
                              <TableCell colSpan={7} align="center">
                                Không tìm thấy học viên.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {/* <Stack
                      direction="row"
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {candidateTotal} học viên
                      </Typography>
                      <Pagination
                        size="small"
                        page={candidatePage}
                        count={Math.max(1, Math.ceil(candidateTotal / 20))}
                        onChange={(_, value) => setCandidatePage(value)}
                      />
                    </Stack> */}
                  </>
                )}
              </>
            )}
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 1.5,
            gap: 2,
            flexWrap: "wrap",
            justifyContent: "space-between",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {candidateTotal.toLocaleString("vi-VN")} thí sinh
            {" · "}
            Trang {candidatePage}/{Math.max(1, Math.ceil(candidateTotal / 20))}
          </Typography>

          <Pagination
            color="primary"
            page={candidatePage}
            count={Math.max(1, Math.ceil(candidateTotal / 20))}
            disabled={loadingReview || !overview?.supported}
            onChange={(_, nextPage) => {
              setCandidatePage(nextPage);
            }}
            showFirstButton
            showLastButton
            siblingCount={1}
          />

          <Button onClick={closeReview}>Đóng</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={selectedCandidate !== null}
        onClose={() => setSelectedCandidate(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Học viên: {selectedCandidate?.fullName}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          {selectedCandidate && (
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Dữ liệu trong file
              </Typography>

              <Box
                component="pre"
                sx={{
                  bgcolor: "action.hover",
                  borderRadius: 2,
                  p: 2,
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(
                  {
                    registrationCode: selectedCandidate.registrationCode,
                    fullName: selectedCandidate.fullName,
                    identityNumber: selectedCandidate.identityNumber,
                    dateOfBirth: selectedCandidate.dateOfBirth,
                    examinationNumber: selectedCandidate.examinationNumber,
                    fileNumber: selectedCandidate.fileNumber,
                    ...selectedCandidate.details,
                  },
                  null,
                  2
                )}
              </Box>

              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Đối chiếu database
              </Typography>

              <MatchChip status={selectedCandidate.matchStatus} />

              {selectedCandidate.differences.map((difference) => (
                <Alert severity="warning" key={difference}>
                  {difference}
                </Alert>
              ))}

              {selectedCandidate.matchedStudents.map((student) => (
                <Card key={student.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={0.5}>
                    <Typography sx={{ fontWeight: 700 }}>
                      Hồ sơ DB #{student.id}
                    </Typography>
                    <Typography variant="body2">
                      {student.fullName} — {student.registrationCode}
                    </Typography>
                    <Typography variant="body2">
                      CCCD: {student.identityNumber || "—"}
                    </Typography>
                    <Typography variant="body2">
                      Ngày sinh: {student.dateOfBirth || "—"}
                    </Typography>
                  </Stack>
                </Card>
              ))}

              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                File khác có cùng mã đăng ký
              </Typography>

              {loadingRelated && <CircularProgress size={20} />}

              {related.map((file) => (
                <Card key={file.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {file.originalName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    #{file.id} · {FILE_LABELS[file.fileType]} ·{" "}
                    {STATUS_LABELS[file.status] || file.status} ·{" "}
                    {file.uploaderName}
                  </Typography>
                </Card>
              ))}

              {!loadingRelated && related.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Không tìm thấy trong phạm vi file đã kiểm tra.
                </Typography>
              )}

              {relatedMessage && (
                <Alert severity="info">{relatedMessage}</Alert>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setSelectedCandidate(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
