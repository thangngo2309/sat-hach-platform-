import {
  getExamResults,
  type ExamResultCandidate,
  type ExamResultsPage,
} from "@/lib/exam-results";

import { exportExcel, type ExcelSheet } from "@/lib/excel-export";

type ExportParams = {
  search?: string;
  status?: string;
  candidateType?: string;
};

function dateText(value?: string | null) {
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function resultText(status: string | null, hasResult = true): string {
  if (!hasResult) return "Chưa có kết quả";

  switch (status) {
    case "DA":
      return "Đạt";
    case "RO":
      return "Không đạt";
    case "VA":
      return "Vắng";
    default:
      return status || "Chưa rõ";
  }
}

function candidateTypeText(value: string) {
  switch (value) {
    case "independent":
      return "Thí sinh tự do";
    case "training":
      return "Học viên cơ sở đào tạo";
    default:
      return "Chưa xác định";
  }
}

function isAbsent(candidate: ExamResultCandidate) {
  return (
    candidate.hasAbsentPart === true ||
    candidate.resultStatus === "VA" ||
    (candidate.parts ?? []).some((part) => part.resultStatus === "VA")
  );
}

async function getAllCandidates(
  token: string,
  code: string,
  params: ExportParams
): Promise<{
  report: ExamResultsPage;
  candidates: ExamResultCandidate[];
}> {
  const first = await getExamResults(token, code, {
    ...params,
    page: 1,
    limit: 100,
  });

  const candidates = [...first.data];
  const pages = first.pagination.totalPages;

  for (let page = 2; page <= pages; page++) {
    const response = await getExamResults(token, code, {
      ...params,
      page,
      limit: 100,
    });

    candidates.push(...response.data);
  }

  return {
    report: first,
    candidates,
  };
}

export async function exportExamDetailExcel(
  token: string,
  code: string,
  params: ExportParams = {}
): Promise<void> {
  const { report, candidates } = await getAllCandidates(token, code, params);

  const summary = report.summary;
  const session = report.session;

  const statusLabels: Record<string, string> = {
    DA: "Đạt",
    RO: "Không đạt",
    VA: "Vắng",
    PENDING: "Chưa có kết quả",
  };

  const typeLabels: Record<string, string> = {
    training: "Học viên CSDT",
    independent: "Thí sinh tự do",
    unknown: "Chưa xác định",
  };

  const filters = [
    `Kỳ sát hạch: ${session.code}`,
    `Ngày: ${dateText(session.examDate)}`,
    `Trung tâm: ${session.centerName || session.centerCode}`,
    `Kết quả: ${statusLabels[params.status ?? ""] ?? "Tất cả"}`,
    `Loại thí sinh: ${typeLabels[params.candidateType ?? ""] ?? "Tất cả"}`,
    params.search?.trim() ? `Từ khóa: ${params.search.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const selectedPassed = candidates.filter(
    (item) => item.resultStatus === "DA"
  ).length;

  const selectedFailed = candidates.filter(
    (item) => item.resultStatus === "RO"
  ).length;

  const selectedAbsent = candidates.filter(isAbsent).length;

  const selectedPending = candidates.filter((item) => !item.hasResult).length;

  const summaryRows = [
    {
      label: "Mã kỳ sát hạch",
      value: session.code,
    },
    {
      label: "Ngày sát hạch",
      value: dateText(session.examDate),
    },
    {
      label: "Mã trung tâm sát hạch",
      value: session.centerCode,
    },
    {
      label: "Tên trung tâm sát hạch",
      value: session.centerName ?? "",
    },
    {
      label: "Tổng thí sinh toàn kỳ",
      value: summary.total,
    },
    {
      label: "Thí sinh đã có kết quả toàn kỳ",
      value: summary.withResults,
    },
    {
      label: "Đạt toàn kỳ",
      value: summary.passed,
    },
    {
      label: "Không đạt toàn kỳ",
      value: summary.failed,
    },
    {
      label: "Vắng toàn kỳ",
      value: summary.absent,
    },
    {
      label: "Thí sinh tự do toàn kỳ",
      value: summary.independent,
    },
    {
      label: "Số thí sinh phù hợp bộ lọc",
      value: candidates.length,
    },
    {
      label: "Đạt trong danh sách lọc",
      value: selectedPassed,
    },
    {
      label: "Không đạt trong danh sách lọc",
      value: selectedFailed,
    },
    {
      label: "Vắng trong danh sách lọc",
      value: selectedAbsent,
    },
    {
      label: "Chưa có kết quả trong danh sách lọc",
      value: selectedPending,
    },
  ];

  const sheets: ExcelSheet[] = [
    {
      name: "Tong hop",
      title: "BÁO CÁO KẾT QUẢ KỲ SÁT HẠCH",
      subtitle: filters,
      columns: [
        {
          header: "Chỉ tiêu",
          key: "label",
          width: 44,
        },
        {
          header: "Giá trị",
          key: "value",
          width: 32,
        },
      ],
      rows: summaryRows,
    },
    {
      name: "Danh sach thi sinh",
      title: "DANH SÁCH KẾT QUẢ THÍ SINH",
      subtitle: filters,
      columns: [
        { header: "STT", key: "order", width: 10 },
        { header: "SBD", key: "examinationNumber", width: 16 },
        { header: "Mã đăng ký", key: "registrationCode", width: 32 },
        { header: "Họ và tên", key: "fullName", width: 32 },
        { header: "CCCD/CMND", key: "identityNumber", width: 24 },
        { header: "Loại thí sinh", key: "candidateType", width: 27 },
        { header: "Mã CSDT", key: "schoolCode", width: 18 },
        { header: "Cơ sở đào tạo", key: "schoolName", width: 36 },
        { header: "Mã khóa", key: "courseCode", width: 25 },
        { header: "Hạng GPLX", key: "licenseClass", width: 16 },
        { header: "Điểm lý thuyết", key: "theoryScore", width: 20 },
        { header: "Điểm hình", key: "practicalScore", width: 17 },
        { header: "Điểm đường", key: "roadScore", width: 17 },
        { header: "Kết quả tổng", key: "resultStatus", width: 20 },
        { header: "Có phần thi vắng", key: "hasAbsentPart", width: 21 },
        { header: "Số phần thi có dữ liệu", key: "partCount", width: 24 },
      ],
      rows: candidates.map((candidate, index) => ({
        order: index + 1,
        examinationNumber: candidate.examinationNumber ?? "",
        registrationCode: candidate.registrationCode,
        fullName: candidate.fullName,
        identityNumber: candidate.identityNumber ?? "",
        candidateType: candidateTypeText(candidate.candidateType),
        schoolCode: candidate.schoolCode ?? "",
        schoolName: candidate.schoolName ?? "",
        courseCode: candidate.courseCode ?? "",
        licenseClass: candidate.licenseClass ?? "",
        theoryScore: candidate.theoryScore ?? "",
        practicalScore: candidate.practicalScore ?? "",
        roadScore: candidate.roadScore ?? "",
        resultStatus: resultText(candidate.resultStatus, candidate.hasResult),
        hasAbsentPart: isAbsent(candidate) ? "Có" : "Không",
        partCount: candidate.parts?.length ?? 0,
      })),
    },
    {
      name: "Chi tiet phan thi",
      title: "CHI TIẾT KẾT QUẢ TỪNG PHẦN THI",
      subtitle: filters,
      columns: [
        { header: "STT thí sinh", key: "candidateOrder", width: 16 },
        { header: "SBD", key: "examinationNumber", width: 16 },
        { header: "Mã đăng ký", key: "registrationCode", width: 32 },
        { header: "Họ và tên", key: "fullName", width: 32 },
        { header: "CCCD/CMND", key: "identityNumber", width: 24 },
        { header: "Mã khóa", key: "courseCode", width: 25 },
        { header: "Hạng GPLX", key: "licenseClass", width: 15 },
        { header: "Lần ghi", key: "partOrder", width: 12 },
        { header: "Mã phần thi", key: "examType", width: 18 },
        { header: "Ngày thi", key: "examDate", width: 18 },
        { header: "Điểm", key: "score", width: 16 },
        { header: "Điểm tối đa", key: "maximumScore", width: 18 },
        { header: "Kết quả phần thi", key: "partResult", width: 23 },
        { header: "Kết quả tổng", key: "overallResult", width: 20 },
      ],
      rows: candidates.flatMap((candidate, candidateIndex) =>
        (candidate.parts ?? []).map((part) => ({
          candidateOrder: candidateIndex + 1,
          examinationNumber: candidate.examinationNumber ?? "",
          registrationCode: candidate.registrationCode,
          fullName: candidate.fullName,
          identityNumber: candidate.identityNumber ?? "",
          courseCode: candidate.courseCode ?? "",
          licenseClass: candidate.licenseClass ?? "",
          partOrder: part.partOrder,
          examType: part.examType,
          examDate: dateText(part.examDate),
          score: part.score ?? "",
          maximumScore: part.maximumScore ?? "",
          partResult: resultText(part.resultStatus),
          overallResult: resultText(
            candidate.resultStatus,
            candidate.hasResult
          ),
        }))
      ),
    },
  ];

  const statusSuffix = params.status || "ALL";
  const typeSuffix = params.candidateType || "ALL";

  await exportExcel(
    `Ket-qua-sat-hach_${code}_${statusSuffix}_${typeSuffix}.xlsx`,
    sheets
  );
}
