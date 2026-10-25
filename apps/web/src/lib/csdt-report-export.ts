import { exportExcel, type ExcelSheet } from "@/lib/excel-export";

import type { CsdtReport, CsdtSchoolMode, CsdtPart } from "@/lib/csdt-reports";

const pct = (num: number, den: number) =>
  den > 0 ? Math.round((10000 * num) / den) / 100 : null;

const asN = (value: number | null) => (value === null ? "" : value);

const schoolKey = (id: number | null) =>
  id === null ? "unassigned" : String(id);

export type CsdtRollup = {
  schoolId: number | null;
  schoolName: string;
  schoolCode: string;
  mode: "first" | "retake" | "total";
  sessions: number;
  motoSessions: number;
  carSessions: number;
  scheduled: number;
  motorcycle: number;
  car: number;
  absent: number;
  absent_motorcycle: number;
  absent_car: number;
  attended: number;
  passed: number;
  passed_motorcycle: number;
  passed_car: number;
  failed: number;
  pending: number;
};

function blank(
  schoolId: number | null,
  schoolName: string,
  schoolCode: string,
  mode: CsdtRollup["mode"]
): CsdtRollup {
  return {
    schoolId,
    schoolName,
    schoolCode,
    mode,
    sessions: 0,
    motoSessions: 0,
    carSessions: 0,
    scheduled: 0,
    motorcycle: 0,
    car: 0,
    absent: 0,
    absent_motorcycle: 0,
    absent_car: 0,
    attended: 0,
    passed: 0,
    passed_motorcycle: 0,
    passed_car: 0,
    failed: 0,
    pending: 0,
  };
}

export function rollupCsdtRows(report: CsdtReport): CsdtRollup[] {
  const groups = new Map<string, CsdtSchoolMode[]>();

  for (const row of report.schools) {
    const key = schoolKey(row.school_id);

    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const output: CsdtRollup[] = [];

  for (const rows of groups.values()) {
    const first = rows[0];

    const total = blank(
      first.school_id,
      first.schoolName ?? "Chưa xác định CSDT",
      first.schoolCode ?? "",
      "total"
    );

    for (const mode of ["first", "retake"] as const) {
      const raw = rows.find((row) => row.exam_mode === mode);

      const value = blank(
        total.schoolId,
        total.schoolName,
        total.schoolCode,
        mode
      );

      if (raw) {
        for (const key of [
          "scheduled",
          "motorcycle",
          "car",
          "absent",
          "absent_motorcycle",
          "absent_car",
          "attended",
          "passed",
          "passed_motorcycle",
          "passed_car",
          "failed",
          "pending",
        ] as const) {
          value[key] = Number(raw[key] ?? 0);
          total[key] += value[key];
        }

        value.sessions = Number(raw.sessions ?? 0);
      }

      output.push(value);
    }

    // Tổng số kỳ phải đếm DISTINCT, không cộng hai nhóm.
    const distinct = report.distinctSessions.find(
      (item) => item.school_id === total.schoolId
    );

    total.sessions = distinct?.sessions ?? 0;
    total.motoSessions = distinct?.moto_sessions ?? 0;
    total.carSessions = distinct?.car_sessions ?? 0;

    output.push(total);
  }

  return output;
}

const partLabels: Record<string, string> = {
  LT: "Lý thuyết",
  L: "Lý thuyết",
  MP: "Mô phỏng",
  M: "Mô phỏng",
  H: "Trong hình",
  SH: "Trong hình",
  D: "Trên đường",
  DD: "Trên đường",
};

export function findPart(
  parts: CsdtPart[],
  schoolId: number | null,
  mode: CsdtRollup["mode"],
  vehicle: string,
  codes: string[]
) {
  const filtered = parts.filter(
    (part) =>
      part.school_id === schoolId &&
      (mode === "total" || part.exam_mode === mode) &&
      part.vehicle === vehicle &&
      codes.includes(part.exam_type)
  );

  return {
    passed: filtered.reduce((sum, part) => sum + Number(part.passed), 0),
    failed: filtered.reduce((sum, part) => sum + Number(part.failed), 0),
    absent: filtered.reduce((sum, part) => sum + Number(part.absent), 0),
  };
}

export async function exportCsdtReportExcel(report: CsdtReport, title: string) {
  const rows = rollupCsdtRows(report);

  const detailedRows = rows.map((row) => {
    const ltMoto = findPart(
      report.parts,
      row.schoolId,
      row.mode,
      "motorcycle",
      ["LT", "L"]
    );

    const ltCar = findPart(report.parts, row.schoolId, row.mode, "car", [
      "LT",
      "L",
    ]);

    const simulation = findPart(report.parts, row.schoolId, row.mode, "car", [
      "MP",
      "M",
    ]);

    const figureMoto = findPart(
      report.parts,
      row.schoolId,
      row.mode,
      "motorcycle",
      ["H", "SH"]
    );

    const figureCar = findPart(report.parts, row.schoolId, row.mode, "car", [
      "H",
      "SH",
    ]);

    const road = findPart(report.parts, row.schoolId, row.mode, "car", [
      "D",
      "DD",
    ]);

    const resultCell = (passed: number, failed: number) =>
      passed + failed > 0 ? `${passed}/${passed + failed}` : "";

    return {
      schoolName: row.schoolName,

      examMode:
        row.mode === "first"
          ? "SH lần đầu"
          : row.mode === "retake"
          ? "SH lại"
          : "Tổng",

      sessions: row.sessions || "",
      motorcycle: row.motorcycle,
      car: row.car,
      scheduled: row.scheduled,
      absent: row.absent,
      absentRate: asN(pct(row.absent, row.scheduled)),
      attended: row.attended,
      attendedRate: asN(pct(row.attended, row.scheduled)),
      motoPassed: row.passed_motorcycle,
      motoRate: asN(
        pct(row.passed_motorcycle, row.motorcycle - row.absent_motorcycle)
      ),
      carPassed: row.passed_car,
      carRate: asN(pct(row.passed_car, row.car - row.absent_car)),

      ltMoto: resultCell(ltMoto.passed, ltMoto.failed),
      ltMotoRate: asN(pct(ltMoto.passed, ltMoto.passed + ltMoto.failed)),

      ltCar: resultCell(ltCar.passed, ltCar.failed),
      ltCarRate: asN(pct(ltCar.passed, ltCar.passed + ltCar.failed)),

      simulation: resultCell(simulation.passed, simulation.failed),
      simulationRate: asN(
        pct(simulation.passed, simulation.passed + simulation.failed)
      ),

      figureMoto: resultCell(figureMoto.passed, figureMoto.failed),
      figureMotoRate: asN(
        pct(figureMoto.passed, figureMoto.passed + figureMoto.failed)
      ),

      figureCar: resultCell(figureCar.passed, figureCar.failed),
      figureCarRate: asN(
        pct(figureCar.passed, figureCar.passed + figureCar.failed)
      ),

      road: resultCell(road.passed, road.failed),
      roadRate: asN(pct(road.passed, road.passed + road.failed)),
    };
  });

  const partRows = report.parts.map((part) => ({
    schoolName: part.schoolName ?? "Chưa xác định CSDT",

    mode: part.exam_mode === "first" ? "SH lần đầu" : "SH lại",

    vehicle: part.vehicle === "car" ? "Ô tô" : "Mô tô",

    examType: partLabels[part.exam_type] ?? part.exam_type,
    code: part.exam_type,
    passed: part.passed,
    failed: part.failed,
    absent: part.absent,
    total: part.total,

    rate: asN(pct(part.passed, Number(part.passed) + Number(part.failed))),
  }));

  const sheet1: ExcelSheet = {
    name: "Tong hop CSDT",
    title: "BẢNG TỔNG HỢP KẾT QUẢ SÁT HẠCH THEO CƠ SỞ ĐÀO TẠO",
    subtitle: title,
    columns: [
      { header: "Cơ sở đào tạo", key: "schoolName", width: 38 },
      { header: "Hình thức", key: "examMode", width: 17 },
      { header: "Số kỳ (theo nhóm)", key: "sessions", width: 18 },
      { header: "Lượt mô tô", key: "motorcycle", width: 17 },
      { header: "Lượt ô tô", key: "car", width: 17 },
      { header: "Lượt xếp kỳ", key: "scheduled", width: 18 },
      { header: "Vắng", key: "absent", width: 14 },
      { header: "Tỷ lệ vắng (%)", key: "absentRate", width: 17 },
      { header: "Dự thi thực tế*", key: "attended", width: 20 },
      { header: "Tỷ lệ dự thi (%)", key: "attendedRate", width: 20 },
      { header: "Mô tô đạt", key: "motoPassed", width: 18 },
      { header: "Mô tô đạt (%)**", key: "motoRate", width: 18 },
      { header: "Ô tô đạt", key: "carPassed", width: 18 },
      { header: "Ô tô đạt (%)**", key: "carRate", width: 18 },
      { header: "LT mô tô (đạt/dự)", key: "ltMoto", width: 22 },
      { header: "LT mô tô (%)", key: "ltMotoRate", width: 16 },
      { header: "LT ô tô (đạt/dự)", key: "ltCar", width: 22 },
      { header: "LT ô tô (%)", key: "ltCarRate", width: 16 },
      { header: "Mô phỏng (đạt/dự)", key: "simulation", width: 22 },
      { header: "Mô phỏng (%)", key: "simulationRate", width: 17 },
      { header: "Hình mô tô (đạt/dự)", key: "figureMoto", width: 22 },
      { header: "Hình mô tô (%)", key: "figureMotoRate", width: 17 },
      { header: "Hình ô tô (đạt/dự)", key: "figureCar", width: 22 },
      { header: "Hình ô tô (%)", key: "figureCarRate", width: 17 },
      { header: "Đường (đạt/dự)", key: "road", width: 22 },
      { header: "Đường (%)", key: "roadRate", width: 17 },
    ],
    rows: detailedRows,
  };

  const sheet2: ExcelSheet = {
    name: "Ket qua tung phan",
    title: "THỐNG KÊ KẾT QUẢ TỪNG PHẦN THI THEO CSDT",
    subtitle: title,
    columns: [
      { header: "CSDT", key: "schoolName", width: 38 },
      { header: "Hình thức", key: "mode", width: 17 },
      { header: "Loại", key: "vehicle", width: 13 },
      { header: "Phần thi", key: "examType", width: 22 },
      { header: "Mã nguồn", key: "code", width: 15 },
      { header: "Đạt", key: "passed", width: 14 },
      { header: "Rớt", key: "failed", width: 14 },
      { header: "Vắng", key: "absent", width: 14 },
      { header: "Tổng bản ghi", key: "total", width: 18 },
      { header: "Tỷ lệ đạt (%)", key: "rate", width: 20 },
    ],
    rows: partRows,
  };

  const sheet3: ExcelSheet = {
    name: "Danh gia chat luong",
    title: "ĐÁNH GIÁ CHẤT LƯỢNG DỊCH VỤ THEO CSDT " + "(CÁC CHỈ TIÊU HIỆN CÓ)",
    subtitle: title,
    columns: [
      { header: "CSDT", key: "schoolName", width: 40 },
      { header: "Lượt xếp kỳ", key: "scheduled", width: 20 },
      { header: "Lượt tham dự*", key: "attended", width: 20 },
      { header: "Lượt đạt", key: "passed", width: 17 },
      { header: "Tỷ lệ đạt trên KQ (%)", key: "passRate", width: 27 },
      { header: "Lỗi thiết bị", key: "deviceErrors", width: 20 },
      { header: "Lỗi đường truyền", key: "networkErrors", width: 22 },
      { header: "Loại trung tâm", key: "centerType", width: 22 },
    ],
    rows: rows
      .filter((row) => row.mode === "total")
      .map((row) => ({
        schoolName: row.schoolName,
        scheduled: row.scheduled,
        attended: row.attended,
        passed: row.passed,
        passRate: asN(pct(row.passed, row.passed + row.failed)),
        deviceErrors: "Chưa có dữ liệu",
        networkErrors: "Chưa có dữ liệu",
        centerType: "Không áp dụng cho CSDT",
      })),
  };

  const sheet4: ExcelSheet = {
    name: "Phuong phap",
    title: "QUY TẮC VÀ GIỚI HẠN SỐ LIỆU",
    subtitle: title,
    columns: [
      { header: "Nội dung", key: "item", width: 37 },
      { header: "Diễn giải", key: "description", width: 90 },
    ],
    rows: [
      {
        item: "Đơn vị đếm",
        description: report.methodology.unit,
      },
      {
        item: "Lần đầu / thi lại",
        description: report.methodology.mode,
      },
      {
        item: "Vắng / có mặt",
        description: report.methodology.attendance,
      },
      {
        item: "Tỷ lệ từng phần",
        description: report.methodology.ratio,
      },
      {
        item: "Cảnh báo",
        description: report.methodology.caution,
      },
      {
        item: "* Dự thi thực tế",
        description:
          "Ước tính theo số lượt không có VA; " +
          "cần đối chiếu quy tắc vắng toàn kỳ trong mẫu nghiệp vụ.",
      },
      {
        item: "** Tỷ lệ đạt theo loại",
        description: "Đạt theo loại xe / lượt không có VA thuộc loại xe.",
      },
      {
        item: "Số kỳ nhóm Tổng",
        description:
          "Số kỳ duy nhất không cộng hai nhóm " +
          "lần đầu và thi lại khi cùng có mặt trong một kỳ.",
      },
      {
        item: "Sự cố kỹ thuật",
        description: report.quality.note,
      },
      {
        item: "Toàn hệ thống",
        description:
          `${report.total.sessions} kỳ duy nhất; ` +
          `${report.total.scheduled} lượt xếp; ` +
          `${report.total.attended} lượt không có VA; ` +
          `${report.total.passed} lượt đạt.`,
      },
    ],
  };

  await exportExcel(
    `Bao-cao-CSDT_${report.filters.fromDate}_${report.filters.toDate}.xlsx`,
    [sheet1, sheet2, sheet3, sheet4]
  );
}
