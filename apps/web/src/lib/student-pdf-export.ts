import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import {
  getStudentDetail,
  type StudentDetail,
  type StudentIntake,
} from "@/lib/bc2-view";

export type StudentPdfType = "tracking" | "inspection";

const TEMPLATES: Record<StudentPdfType, string> = {
  tracking: "/pdf-templates/phieu-theo-doi-thi-sinh-tu-do.pdf",
  inspection: "/pdf-templates/bien-ban-kiem-tra-ho-so.pdf",
};

const FONT_PATH = "/fonts/NotoSans-Regular.ttf";

type Field = {
  x: number;
  top: number;
  width: number;
  value: unknown;
  size?: number;
  uppercase?: boolean;
  align?: "left" | "center";
};

/**
 * Tất cả tọa độ sử dụng đơn vị point,
 * gốc tính từ góc trên bên trái trang PDF.
 *
 * Các vùng này được xác định theo hai
 * mẫu PDF A4 đã cung cấp.
 */

const BLACK = rgb(0.08, 0.08, 0.08);
const WHITE = rgb(1, 1, 1);

function clean(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .normalize("NFC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateVN(value: unknown): string {
  const text = clean(value);

  if (!text) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);

  if (!match) return text;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function applicationLabel(value: string | null): string {
  switch (value) {
    case "new":
      return "Sát hạch mới";
    case "upgrade":
      return "Nâng hạng";
    case "reissue":
      return "Cấp lại";
    default:
      return "";
  }
}

function safeFileName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 65);
}

async function loadResource(path: string): Promise<Uint8Array> {
  const response = await fetch(path, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Không tải được tài nguyên: ${path}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Điền chữ trong một vùng cố định.
 *
 * Chỉ che vùng dấu chấm của trường hiện tại.
 * Không che nhãn ở bên trái.
 * Không đè lên trường bên cạnh.
 */
function fillField(page: PDFPage, font: PDFFont, field: Field): void {
  let value = clean(field.value);

  if (!value) return;

  if (field.uppercase) {
    value = value.toLocaleUpperCase("vi-VN");
  }

  let fontSize = field.size ?? 9;

  // Trừ lề hai bên vùng điền.
  const usableWidth = field.width - 6;

  while (
    fontSize > 6.2 &&
    font.widthOfTextAtSize(value, fontSize) > usableWidth
  ) {
    fontSize -= 0.2;
  }

  // Không được viết tràn sang nhãn bên cạnh.
  if (font.widthOfTextAtSize(value, fontSize) > usableWidth) {
    const suffix = "...";

    while (
      value.length > 0 &&
      font.widthOfTextAtSize(value + suffix, fontSize) > usableWidth
    ) {
      value = value.slice(0, -1);
    }

    value += suffix;
  }

  const fieldHeight = 13.2;

  const rectY = page.getHeight() - field.top - fieldHeight;

  // Che đúng phần dấu chấm, không dựa trên
  // độ dài của text như phiên bản cũ.
  page.drawRectangle({
    x: field.x,
    y: rectY,
    width: field.width,
    height: fieldHeight,
    color: WHITE,
    borderWidth: 0,
  });

  const textWidth = font.widthOfTextAtSize(value, fontSize);

  const drawX =
    field.align === "center"
      ? field.x + (field.width - textWidth) / 2
      : field.x + 3;

  page.drawText(value, {
    x: drawX,
    y: rectY + (fieldHeight - fontSize) / 2 + 1,
    font,
    size: fontSize,
    color: BLACK,
  });
}

function markCell(page: PDFPage, x: number, top: number, checked: boolean) {
  if (!checked) return;

  // Dấu tick dạng hai nét vẽ,
  // không phụ thuộc font ký tự.
  const y = page.getHeight() - top;

  page.drawLine({
    start: { x, y: y - 6 },
    end: { x: x + 3, y: y - 9 },
    thickness: 1.4,
    color: BLACK,
  });

  page.drawLine({
    start: { x: x + 3, y: y - 9 },
    end: { x: x + 9, y: y - 1 },
    thickness: 1.4,
    color: BLACK,
  });
}

function getIntake(
  detail: StudentDetail,
  intakeUserId?: number
): StudentIntake {
  const intakes = Array.isArray(detail.intakes) ? detail.intakes : [];

  const intake =
    intakeUserId !== undefined
      ? intakes.find((item) => item.createdByUserId === intakeUserId)
      : intakes[0];

  if (!intake) {
    throw new Error("Không tìm thấy hồ sơ tiếp nhận của học viên.");
  }

  return intake;
}

function hasDocument(intake: StudentIntake, ...types: string[]): boolean {
  return (
    intake.documents?.some(
      (item) => types.includes(item.type) && item.checked === true
    ) ?? false
  );
}

function fillTracking(
  page: PDFPage,
  font: PDFFont,
  student: StudentDetail,
  intake: StudentIntake
) {
  const license = intake.existingLicenses?.[0];

  const examText = [
    applicationLabel(intake.applicationType),
    clean(intake.examinationContent),
  ]
    .filter(Boolean)
    .join(" - ");

  const fields: Field[] = [
    // Hạng sát hạch tại ô phía trên.
    {
      x: 508,
      top: 50,
      width: 35,
      value: intake.requestedLicenseClass,
      size: 10,
      align: "center",
    },

    // 1. Họ tên, chỉ điền trước nhãn SĐT.
    {
      x: 170,
      top: 87,
      width: 244,
      value: student.fullName,
      size: 10,
      uppercase: true,
    },

    // 2. Ngày tháng năm sinh.
    {
      x: 199,
      top: 106,
      width: 365,
      value: dateVN(student.dateOfBirth),
      size: 10,
    },

    // 3. CCCD và ngày cấp: hai vùng riêng.
    {
      x: 116,
      top: 125,
      width: 235,
      value: student.identityNumber,
      size: 10,
    },
    {
      x: 413,
      top: 125,
      width: 149,
      value: dateVN(intake.identityIssuedDate),
      size: 9.5,
    },

    // 4. Thường trú.
    {
      x: 176,
      top: 144,
      width: 388,
      value: student.permanentAddress,
      size: 9,
    },

    // 5-6. Đơn vị đào tạo và số giấy xác nhận:
    // chưa lưu trong hồ sơ, để trống.

    // 7. GPLX hiện có.
    {
      x: 166,
      top: 201,
      width: 49,
      value: license?.licenseClass,
      size: 9,
    },
    {
      x: 337,
      top: 201,
      width: 228,
      value: license?.number,
      size: 9,
    },

    // Ngày nhận hồ sơ:
    // chỉ điền vào phần chấm phía sau nhãn.
    {
      x: 517,
      top: 229,
      width: 57,
      value: dateVN(intake.createdAt),
      size: 7.3,
    },

    // 8. Nội dung đăng ký sát hạch.
    {
      x: 407,
      top: 248,
      width: 166,
      value: examText,
      size: 8.3,
    },
  ];

  for (const field of fields) {
    fillField(page, font, field);
  }

  // Thành phần hồ sơ trên mẫu gốc,
  // đánh dấu ở giữa cột "Đảm bảo".
  const checks = [
    hasDocument(intake, "health_certificate", "medical_exam_certificate"),
    hasDocument(intake, "training_completion_certificate"),
    hasDocument(intake, "identity_copy"),
    hasDocument(intake, "current_license_copy"),
    hasDocument(intake, "student_verification"),
    hasDocument(intake, "dat_verification"),
    hasDocument(intake, "exam_result_summary"),
    hasDocument(intake, "absent_failed_verification"),
  ];

  // Hàng 1 đến 8 trong bảng.
  const firstRowTop = 325;
  const rowHeight = 14.3;

  checks.forEach((checked, index) => {
    markCell(page, 255, firstRowTop + index * rowHeight, checked);
  });

  // Không tự điền kết quả, duyệt hồ sơ, chữ ký.
}

function fillInspection(
  page: PDFPage,
  font: PDFFont,
  student: StudentDetail,
  intake: StudentIntake
) {
  /**
   * Chỉ điền khối "Danh sách thông tin
   * hồ sơ thí sinh dự thi sát hạch".
   *
   * Các nhãn "Sinh ngày", "được cấp ngày",
   * "tại" phải được giữ nguyên.
   */
  const fields: Field[] = [
    {
      x: 181,
      top: 564,
      width: 226,
      value: student.fullName,
      size: 9.5,
      uppercase: true,
    },
    {
      x: 474,
      top: 564,
      width: 69,
      value: dateVN(student.dateOfBirth),
      size: 8,
    },
    {
      x: 173,
      top: 586,
      width: 178,
      value: student.identityNumber,
      size: 9,
    },
    {
      x: 454,
      top: 586,
      width: 88,
      value: dateVN(intake.identityIssuedDate),
      size: 8,
    },
    {
      x: 345,
      top: 607,
      width: 45,
      value: intake.trainingLicenseClass,
      size: 9,
    },
  ];

  for (const field of fields) {
    fillField(page, font, field);
  }

  // Không điền danh sách hợp lệ, tổng số,
  // kết luận kiểm tra hoặc chữ ký cán bộ.
}

function download(pdfBytes: Uint8Array, filename: string) {
  const bytes = new Uint8Array(pdfBytes.length);
  bytes.set(pdfBytes);

  const blob = new Blob([bytes.buffer], {
    type: "application/pdf",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

export async function exportStudentPdf(
  token: string,
  studentId: number,
  type: StudentPdfType,
  intakeUserId?: number
): Promise<void> {
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    throw new Error("ID học viên không hợp lệ.");
  }

  const student = await getStudentDetail(token, studentId);

  const intake = getIntake(student, intakeUserId);

  const [templateBytes, fontBytes] = await Promise.all([
    loadResource(TEMPLATES[type]),
    loadResource(FONT_PATH),
  ]);

  const document = await PDFDocument.load(templateBytes);

  document.registerFontkit(fontkit);

  /**
   * Không subset font.
   *
   * Cách này làm file PDF lớn hơn một chút,
   * nhưng giảm rủi ro ký tự Unicode bị
   * tách rời hoặc hiển thị sai khi render.
   */
  const font = await document.embedFont(fontBytes, {
    subset: false,
  });

  const page = document.getPage(0);

  if (type === "tracking") {
    fillTracking(page, font, student, intake);
  } else {
    fillInspection(page, font, student, intake);
  }

  document.setTitle(
    type === "tracking"
      ? `Phiếu theo dõi - ${student.fullName}`
      : `Biên bản kiểm tra - ${student.fullName}`
  );

  const output = await document.save();

  const prefix = type === "tracking" ? "Phieu_theo_doi" : "Bien_ban_kiem_tra";

  const code = safeFileName(student.registrationCode || String(studentId));

  download(output, `${prefix}_${code}.pdf`);
}
