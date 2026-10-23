import {
  getExamStatisticsReport,
  type ExamStatisticsParams,
  type ExamStatisticsReport,
  type ExamStatisticsStudent,
} from "@/lib/exam-statistics";

import { exportExcel, type ExcelSheet } from "@/lib/excel-export";

function dateText(value: string | null | undefined) {
  if (!value) return "";

  const date = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
}

function statusText(value: string) {
  if (value === "passed") return "Đã đậu";
  if (value === "failed") return "Chưa đậu";
  if (value === "pending") return "Chờ kết quả";

  return value;
}

async function fetchAllStudents(
  token: string,
  params: ExamStatisticsParams,
  first: ExamStatisticsReport
): Promise<ExamStatisticsStudent[]> {
  const students = [...first.students];
  const pageSize = 100;
  const total = first.pagination.total;

  // Trang đầu của báo cáo hiện tại có thể chỉ có 20 dòng;
  // tải lại từ trang 1 với limit=100 để không bỏ sót.
  if (total <= 0) return [];

  students.length = 0;

  const totalPages = Math.ceil(total / pageSize);

  for (let page = 1; page <= totalPages; page++) {
    const response = await getExamStatisticsReport(token, {
      ...params,
      page,
      limit: pageSize,
    });

    students.push(...response.students);
  }

  return students;
}

export async function exportExamStatisticsExcel(
  token: string,
  params: ExamStatisticsParams,
  labels: {
    courseName: string;
    sessionName: string;
  }
): Promise<void> {
  const initial = await getExamStatisticsReport(token, {
    ...params,
    page: 1,
    limit: 20,
  });

  const students = await fetchAllStudents(token, params, initial);

  const summary = initial.summary;
  const parts = initial.parts;

  const subtitle = [
    `Năm: ${params.year}`,
    `Khóa: ${labels.courseName}`,
    `Kỳ sát hạch: ${labels.sessionName}`,
    params.search?.trim() ? `Tìm kiếm: ${params.search.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const summaryRows = [
    ["Tổng học viên", summary.totalStudents],
    ["Đã đậu", summary.passed],
    ["Chưa đậu", summary.failed],
    ["Chờ kết quả", summary.pending],
    ["Có lần vắng", summary.absent],
    ["Thi từ 2 kỳ trong phạm vi lọc", summary.retakeStudents],
    ["Tổng lượt dự kỳ", summary.totalStudentSessions],
    ["Lượt kỳ có kết quả", summary.totalResultSessions],
  ].map(([name, value]) => ({
    name: String(name),
    value: Number(value),
  }));

  const sheets: ExcelSheet[] = [
    {
      name: "Tong hop",
      title: "BÁO CÁO TỔNG HỢP SÁT HẠCH",
      subtitle,
      columns: [
        { header: "Chỉ tiêu", key: "name", width: 40 },
        { header: "Số lượng", key: "value", width: 18 },
      ],
      rows: summaryRows,
    },
    {
      name: "Ket qua tung phan",
      title: "THỐNG KÊ KẾT QUẢ TỪNG PHẦN THI",
      subtitle,
      columns: [
        { header: "Mã phần thi", key: "code", width: 18 },
        { header: "Học viên", key: "students", width: 15 },
        { header: "Tổng lượt ghi", key: "total", width: 18 },
        { header: "Đạt", key: "passed", width: 15 },
        { header: "Rớt", key: "failed", width: 15 },
        { header: "Vắng", key: "absent", width: 15 },
        { header: "Khác", key: "other", width: 15 },
        { header: "Tỷ lệ đạt (%)", key: "rate", width: 18 },
      ],
      rows: parts.map((part) => {
        const examined = part.passed + part.failed;

        return {
          code: part.examType,
          students: part.studentCount,
          total: part.totalRecords,
          passed: part.passed,
          failed: part.failed,
          absent: part.absent,
          other: Math.max(
            0,
            part.totalRecords - part.passed - part.failed - part.absent
          ),
          rate:
            examined > 0
              ? Math.round((part.passed / examined) * 10000) / 100
              : 0,
        };
      }),
    },
    {
      name: "Chi tiet hoc vien",
      title: "DANH SÁCH HỌC VIÊN SÁT HẠCH",
      subtitle,
      columns: [
        { header: "STT", key: "order", width: 10 },
        { header: "Mã đăng ký", key: "registrationCode", width: 30 },
        { header: "Họ và tên", key: "fullName", width: 28 },
        { header: "CCCD", key: "identityNumber", width: 23 },
        { header: "Số kỳ trong bộ lọc", key: "sessionCount", width: 18 },
        { header: "Kỳ có kết quả", key: "resultCount", width: 18 },
        {
          header: "Tổng số kỳ toàn lịch sử",
          key: "allTimeSessionCount",
          width: 23,
        },
        {
          header: "Tổng kỳ có KQ toàn lịch sử",
          key: "allTimeResultCount",
          width: 24,
        },
        {
          header: "Kỳ gần nhất trong bộ lọc",
          key: "latestSessionCode",
          width: 24,
        },
        { header: "Ngày sát hạch", key: "latestExamDate", width: 18 },
        { header: "Kết quả", key: "status", width: 18 },
        { header: "Có lần vắng", key: "hasAbsent", width: 18 },
        { header: "Chi tiết từng phần", key: "parts", width: 45 },
      ],
      rows: students.map((student, index) => ({
        order: index + 1,
        registrationCode: student.registrationCode,
        fullName: student.fullName,
        identityNumber: student.identityNumber ?? "",
        sessionCount: student.sessionCount,
        resultCount: student.resultCount,
        allTimeSessionCount: student.allTimeSessionCount,
        allTimeResultCount: student.allTimeResultCount,
        latestSessionCode: student.latestSessionCode ?? "",
        latestExamDate: dateText(student.latestExamDate),
        status: statusText(student.status),
        hasAbsent: student.hasAbsent ? "Có" : "Không",
        parts: student.parts
          .map(
            (part) =>
              `${part.examType}: ${part.totalRecords} lượt, ` +
              `${part.passed} đạt, ${part.failed} rớt, ` +
              `${part.absent} vắng`
          )
          .join("; "),
      })),
    },
  ];

  const suffix = [
    params.year,
    params.courseId ? `khoa-${params.courseId}` : "tat-ca-khoa",
    params.sessionId ? `ky-${params.sessionId}` : "tat-ca-ky",
  ].join("_");

  await exportExcel(`Thong-ke-sat-hach_${suffix}.xlsx`, sheets);
}
