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

const BLACK = rgb(0.08, 0.08, 0.08);
const WHITE = rgb(1, 1, 1);

type Field = {
  x: number;
  top: number;
  width: number;
  value: unknown;
  size?: number;
  minSize?: number;
  uppercase?: boolean;
  align?: "left" | "center";
};

const TRACKING_DOCUMENT_ROWS = [
  {
    type: "health_certificate",
    label: "Giấy chứng nhận sức khỏe",
  },
  {
    type: "driving_experience",
    label: "Bản khai thời gian, số km lái xe an toàn",
  },
  {
    type: "diploma",
    label: "Bản sao văn bằng (nếu cần)",
  },
  {
    type: "current_license_copy",
    label: "Bản sao GPLX hiện có (nếu cần)",
  },
  {
    type: "training_completion_certificate",
    label: "Giấy xác nhận hoàn thành khóa đào tạo",
  },
  {
    type: "exam_result_summary",
    label: "Biên bản tổng hợp kết quả sát hạch",
  },
  {
    type: "photo_3x4",
    label: "Ảnh thẻ 3x4",
  },
  {
    type: "other",
    label: "Giấy tờ khác",
  },
] as const;

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";

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

  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
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

function safeFileName(value: string): string {
  return value
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

function fitText(
  font: PDFFont,
  source: string,
  width: number,
  preferredSize: number,
  minSize: number
): { text: string; size: number } {
  let text = clean(source);
  let size = preferredSize;

  const maxWidth = Math.max(1, width);

  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size = Math.max(minSize, size - 0.2);
  }

  if (font.widthOfTextAtSize(text, size) > maxWidth) {
    const suffix = "...";

    while (
      text.length > 0 &&
      font.widthOfTextAtSize(text + suffix, size) > maxWidth
    ) {
      text = text.slice(0, -1);
    }

    text = text.trimEnd() + suffix;
  }

  return { text, size };
}

/**
 * Tọa độ tính từ mép trên trang PDF.
 *
 * Chỉ điền vào vùng trống, không che nhãn.
 */
function fillField(page: PDFPage, font: PDFFont, field: Field): void {
  let value = clean(field.value);
  if (!value) return;

  if (field.uppercase) {
    value = value.toLocaleUpperCase("vi-VN");
  }

  const fitted = fitText(
    font,
    value,
    field.width - 6,
    field.size ?? 11,
    field.minSize ?? 8
  );

  const fieldHeight = Math.max(13.2, fitted.size + 3);

  const rectY = page.getHeight() - field.top - fieldHeight;

  page.drawRectangle({
    x: field.x,
    y: rectY,
    width: field.width,
    height: fieldHeight,
    color: WHITE,
    borderWidth: 0,
  });

  const textWidth = font.widthOfTextAtSize(fitted.text, fitted.size);

  const x =
    field.align === "center"
      ? field.x + (field.width - textWidth) / 2
      : field.x + 3;

  page.drawText(fitted.text, {
    x,
    y: rectY + (fieldHeight - fitted.size) / 2 + 1,
    font,
    size: fitted.size,
    color: BLACK,
  });
}

/**
 * Đánh dấu tick trong cột Đảm bảo.
 */
function markCell(
  page: PDFPage,
  x: number,
  top: number,
  checked: boolean
): void {
  if (!checked) return;

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

function hasDocument(intake: StudentIntake, type: string): boolean {
  const compatibleTypes =
    type === "current_license_copy"
      ? ["current_license_copy", "driving_license"]
      : type === "health_certificate"
      ? ["health_certificate", "medical_exam_certificate"]
      : [type];

  return (
    intake.documents?.some(
      (item) => compatibleTypes.includes(item.type) && item.checked === true
    ) ?? false
  );
}

const PDF_DOCUMENT_TYPES = [
  "health_certificate",
  "training_completion_certificate",
  "identity_copy",
  "current_license_copy",
  "student_verification",
  "dat_verification",
  "exam_result_summary",
  "absent_failed_verification",
] as const;

function fillTrackingDocumentChecks(
  page: PDFPage,
  intake: StudentIntake
): void {
  const firstRowTop = 325;
  const rowHeight = 14.3;
  const checkX = 255;

  PDF_DOCUMENT_TYPES.forEach((type, index) => {
    const checked =
      intake.documents?.some(
        (item) => item.type === type && item.checked === true
      ) ?? false;

    markCell(page, checkX, firstRowTop + index * rowHeight, checked);
  });
}

/**
 * PHIẾU THEO DÕI HỒ SƠ THÍ SINH TỰ DO
 */
function fillTracking(
  page: PDFPage,
  font: PDFFont,
  student: StudentDetail,
  intake: StudentIntake
): void {
  const license = intake.existingLicenses?.[0];

  const examText = [
    applicationLabel(intake.applicationType),
    clean(intake.examinationContent),
  ]
    .filter(Boolean)
    .join(" - ");

  const fields: Field[] = [
    /**
     * HẠNG:
     *
     * Nhãn gốc kết thúc khoảng x=492.
     * Đặt giá trị sau nhãn, không che chữ HẠNG.
     */
    {
      x: 496,
      top: 50,
      width: 34,
      value: intake.requestedLicenseClass,
      size: 11,
      minSize: 9,
    },

    {
      x: 168,
      top: 87,
      width: 245,
      value: student.fullName,
      size: 11.5,
      minSize: 8.5,
      uppercase: true,
    },

    {
      x: 456,
      top: 87,
      width: 115,
      value: student.phoneNumber,
      size: 10.5,
      minSize: 9,
    },

    {
      x: 179,
      top: 106,
      width: 388,
      value: dateVN(student.dateOfBirth),
      size: 11,
    },

    {
      x: 109,
      top: 125,
      width: 239,
      value: student.identityNumber,
      size: 11,
    },

    {
      x: 415,
      top: 125,
      width: 150,
      value: dateVN(intake.identityIssuedDate),
      size: 10.5,
    },

    {
      x: 156,
      top: 144,
      width: 409,
      value: student.permanentAddress,
      size: 10.5,
      minSize: 8,
    },

    /**
     * Đơn vị đào tạo:
     * Nơi xác nhận hoàn thành khóa học.
     */
    {
      x: 137,
      top: 163,
      width: 428,
      value: intake.trainingCompletionIssuer,
      size: 11,
      minSize: 8,
    },

    {
      x: 270,
      top: 182,
      width: 295,
      value: intake.trainingCompletionNumber,
      size: 11,
      minSize: 8,
    },

    {
      x: 156,
      top: 201,
      width: 60,
      value: license?.licenseClass,
      size: 10.5,
      minSize: 9,
    },

    {
      x: 320,
      top: 201,
      width: 245,
      value: license?.number,
      size: 11,
      minSize: 9,
    },

    {
      x: 504,
      top: 229,
      width: 70,
      value: dateVN(intake.createdAt),
      size: 9.5,
      minSize: 8,
    },

    {
      x: 324,
      top: 248,
      width: 249,
      value: examText,
      size: 10.5,
      minSize: 8,
    },
  ];

  for (const field of fields) {
    fillField(page, font, field);
  }

  // Đồng bộ toàn bộ danh sách giấy tờ với form.
  fillTrackingDocumentChecks(page, intake);

  /**
   * Không tự điền:
   * - Đơn vị tổ chức sát hạch
   * - Kết quả sát hạch
   * - Ngày thi đề xuất
   * - Trung tâm, thư ký
   * - Kết quả xử lý và phê duyệt
   */
}

/**
 * BIÊN BẢN KIỂM TRA HỒ SƠ
 *
 * Giữ nguyên nghiệp vụ của mẫu này.
 */

function fillInspection(
  page: PDFPage,
  font: PDFFont,
  student: StudentDetail,
  intake: StudentIntake
): void {
  /**
   * BIÊN BẢN KIỂM TRA HỒ SƠ
   *
   * Tọa độ đã căn theo mẫu PDF gốc A4.
   *
   * Chỉ điền thông tin vào vùng dấu chấm.
   * Không che các nhãn:
   * - Họ và tên
   * - Sinh ngày
   * - Số CCCD
   * - được cấp ngày
   * - hạng
   * - tại
   *
   * Không thay đổi fillTracking().
   */

  const fields: Field[] = [
    {
      // Họ và tên
      x: 181,
      top: 563.5,
      width: 226,
      value: student.fullName,
      size: 11,
      minSize: 8.5,
      uppercase: true,
    },
    {
      // Ngày sinh
      x: 476,
      top: 563.5,
      width: 65,
      value: dateVN(student.dateOfBirth),
      size: 10.2,
      minSize: 9,
    },
    {
      // Số CCCD
      x: 179,
      top: 585,
      width: 173,
      value: student.identityNumber,
      size: 11,
      minSize: 9,
    },
    {
      // Ngày cấp CCCD
      x: 446,
      top: 585,
      width: 95,
      value: dateVN(intake.identityIssuedDate),
      size: 10.2,
      minSize: 9,
    },
    {
      // Hạng đào tạo
      x: 343,
      top: 606.5,
      width: 47,
      value: intake.trainingLicenseClass || intake.requestedLicenseClass,
      size: 11,
      minSize: 9,
    },
    {
      // Nơi đào tạo
      x: 418,
      top: 606.5,
      width: 123,
      value: intake.trainingCompletionIssuer,
      size: 10,
      minSize: 8,
    },
  ];

  for (const field of fields) {
    fillField(page, font, field);
  }

  /**
   * Giữ trống các thông tin chưa xác nhận:
   *
   * - Thời gian lập biên bản
   * - Danh sách cán bộ kiểm tra
   * - Số hồ sơ hợp lệ và không hợp lệ
   * - Bảng tổng hợp kỳ sát hạch
   * - Chữ ký
   */
}

function download(pdfBytes: Uint8Array, filename: string): void {
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
