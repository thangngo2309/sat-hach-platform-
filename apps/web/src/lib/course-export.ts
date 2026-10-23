import {
  listCourseSummaries,
  type CourseSummary,
  type ViewParams,
} from "@/lib/bc2-view";

import { exportExcel } from "@/lib/excel-export";

function dateText(value: string | null | undefined) {
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export async function exportCoursesExcel(
  token: string,
  params: ViewParams
): Promise<void> {
  const pageSize = 100;
  const courses: CourseSummary[] = [];

  const first = await listCourseSummaries(token, {
    ...params,
    page: 1,
    limit: pageSize,
  });

  courses.push(...first.data);

  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const response = await listCourseSummaries(token, {
      ...params,
      page,
      limit: pageSize,
    });

    courses.push(...response.data);
  }

  const totalStudents = courses.reduce(
    (sum, course) => sum + Number(course.studentCount ?? 0),
    0
  );

  const totalBc2 = courses.reduce(
    (sum, course) => sum + Number(course.bc2MatchedCount ?? 0),
    0
  );

  const totalNoBc2 = courses.reduce(
    (sum, course) => sum + Number(course.noBc2Count ?? 0),
    0
  );

  const subtitle = [
    params.search?.trim() ? `Tìm kiếm: ${params.search.trim()}` : "Tất cả khóa",
    params.schoolId
      ? `Cơ sở đào tạo ID: ${params.schoolId}`
      : "Tất cả cơ sở đào tạo",
  ].join(" | ");

  await exportExcel("Danh-sach-khoa-hoc.xlsx", [
    {
      name: "Tong hop",
      title: "TỔNG HỢP KHÓA ĐÀO TẠO",
      subtitle,
      columns: [
        { header: "Chỉ tiêu", key: "name", width: 38 },
        { header: "Số lượng", key: "value", width: 18 },
      ],
      rows: [
        { name: "Tổng số khóa học", value: courses.length },
        { name: "Tổng lượt ghi danh", value: totalStudents },
        { name: "Lượt ghi danh có BC2 đối chiếu", value: totalBc2 },
        { name: "Lượt ghi danh chưa có BC2 đối chiếu", value: totalNoBc2 },
      ],
    },
    {
      name: "Danh sach khoa",
      title: "DANH SÁCH KHÓA ĐÀO TẠO",
      subtitle,
      columns: [
        { header: "STT", key: "order", width: 10 },
        { header: "Mã khóa", key: "code", width: 24 },
        { header: "Tên khóa", key: "name", width: 35 },
        { header: "Cơ sở đào tạo", key: "schoolName", width: 38 },
        { header: "Hạng GPLX", key: "licenseClass", width: 15 },
        { header: "Mã BC1", key: "bc1Code", width: 24 },
        { header: "Ngày khai giảng", key: "openingDate", width: 20 },
        { header: "Tổng học viên", key: "studentCount", width: 18 },
        { header: "Có BC2", key: "bc2MatchedCount", width: 18 },
        { header: "Chưa có BC2", key: "noBc2Count", width: 20 },
      ],
      rows: courses.map((course, index) => ({
        order: index + 1,
        code: course.code,
        name: course.name,
        schoolName: course.schoolName,
        licenseClass: course.licenseClass ?? "",
        bc1Code: course.bc1Code ?? "",
        openingDate: dateText(course.openingDate),
        studentCount: course.studentCount,
        bc2MatchedCount: course.bc2MatchedCount,
        noBc2Count: course.noBc2Count,
      })),
    },
  ]);
}
