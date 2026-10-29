"use client";

import { useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Tooltip,
} from "@mui/material";

import { FileDownloadOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  getManagedUsersStudents,
  type ManagedStudent,
  type ManagedUser,
} from "@/lib/user-management";

type Props = {
  selectedIds: number[];
  users: ManagedUser[];
  disabled?: boolean;
};

const PAGE_SIZE = 100;

const HEADERS = [
  "STT",
  "Mã hồ sơ",
  "Họ và tên",
  "Ngày sinh",
  "CCCD/CMND",
  "Loại hồ sơ",
  "Hạng sát hạch",
  "Ngày tiếp nhận",
  "Tình trạng BC2",
  "Nhân viên tiếp nhận",
];

function formatDate(value?: string | null): string {
  if (!value) return "";

  const text = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) return text;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("vi-VN", {
    hour12: false,
  });
}

function applicationLabel(value?: string | null): string {
  switch (value) {
    case "new":
      return "Cấp mới";
    case "upgrade":
      return "Nâng hạng";
    case "reissue":
      return "Cấp lại";
    default:
      return value ?? "";
  }
}

/**
 * Ngăn Excel diễn giải dữ liệu nhập từ người dùng
 * thành công thức khi mở file.
 */
function safeExcelText(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);

  if (/^[\s]*[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function sheetName(fullName: string, id: number, used: Set<string>): string {
  // Excel không cho phép các ký tự này
  // trong tên sheet: \ / ? * [ ] :
  const cleaned =
    fullName
      .replace(/[\\/?*[\]:]/g, "")
      .replace(/[\u0000-\u001F]/g, "")
      .trim() || "Nhan vien";

  const suffix = `_${id}`;

  let name = cleaned.slice(0, 31 - suffix.length) + suffix;

  let sequence = 1;

  while (used.has(name.toLowerCase())) {
    const extra = `_${id}_${sequence}`;
    name = cleaned.slice(0, 31 - extra.length) + extra;

    sequence += 1;
  }

  used.add(name.toLowerCase());

  return name;
}

function downloadWorkbook(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  const blob = new Blob([copy.buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Cho phép trình duyệt bắt đầu tải trước khi
  // thu hồi object URL.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function ExportAdminStudentsButton({
  selectedIds,
  users,
  disabled = false,
}: Props) {
  const { accessToken, user } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const canExport =
    user?.role === "super_admin" &&
    Boolean(accessToken) &&
    selectedIds.length > 0 &&
    !exporting &&
    !disabled;

  async function fetchAllStudents(
    token: string,
    adminId: number
  ): Promise<ManagedStudent[]> {
    const first = await getManagedUsersStudents(token, {
      userIds: [adminId],
      page: 1,
      limit: PAGE_SIZE,
    });

    const result = [...first.data];

    const totalPages = first.pagination.totalPages;

    for (let page = 2; page <= totalPages; page++) {
      const response = await getManagedUsersStudents(token, {
        userIds: [adminId],
        page,
        limit: PAGE_SIZE,
      });

      result.push(...response.data);
    }

    // Bảo vệ khỏi dữ liệu trùng ngoài ý muốn.
    const unique = new Map<number, ManagedStudent>();

    for (const student of result) {
      unique.set(student.id, student);
    }

    return [...unique.values()];
  }

  async function handleExport() {
    if (!canExport || !accessToken || user?.role !== "super_admin") {
      return;
    }

    const ids = [...new Set(selectedIds)];

    setExporting(true);
    setError("");
    setProgress("Đang chuẩn bị file Excel...");

    try {
      // Dynamic import để ExcelJS không nằm trong
      // bundle chính của trang Quản lý tài khoản.
      const ExcelJS = await import("exceljs");

      const workbook = new ExcelJS.Workbook();

      workbook.creator = "Sát hạch ô tô";
      workbook.lastModifiedBy = user.fullName;
      workbook.created = new Date();
      workbook.modified = new Date();
      workbook.subject = "Báo cáo thí sinh theo nhân viên tiếp nhận";

      const usedNames = new Set<string>();

      for (let index = 0; index < ids.length; index++) {
        const id = ids[index];

        const admin = users.find((item) => item.id === id);

        if (!admin) {
          throw new Error(
            `Không tìm thấy thông tin tài khoản ID ${id}. Vui lòng tải lại danh sách.`
          );
        }

        setProgress(
          `Đang lấy học viên của ${admin.fullName} (${index + 1}/${
            ids.length
          })...`
        );

        const students = await fetchAllStudents(accessToken, id);

        const sheet = workbook.addWorksheet(
          sheetName(admin.fullName, id, usedNames)
        );

        sheet.columns = [
          { width: 8 },
          { width: 28 },
          { width: 30 },
          { width: 16 },
          { width: 23 },
          { width: 17 },
          { width: 19 },
          { width: 24 },
          { width: 19 },
          { width: 30 },
        ];

        // Tiêu đề báo cáo
        sheet.mergeCells("A1:J1");
        const titleCell = sheet.getCell("A1");

        titleCell.value = "BÁO CÁO HỌC VIÊN THEO NHÂN VIÊN TIẾP NHẬN";

        titleCell.font = {
          bold: true,
          size: 16,
          color: { argb: "FFFFFFFF" },
        };

        titleCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF17365D" },
        };

        titleCell.alignment = {
          horizontal: "center",
          vertical: "middle",
        };

        sheet.getRow(1).height = 38;

        sheet.mergeCells("A2:J2");
        sheet.getCell(
          "A2"
        ).value = `Nhân viên: ${admin.fullName} (@${admin.username})`;

        sheet.getCell("A2").font = {
          bold: true,
          size: 12,
          color: { argb: "FF17365D" },
        };

        sheet.getRow(2).height = 27;

        sheet.mergeCells("A3:J3");
        sheet.getCell("A3").value = `Tổng số học viên: ${
          students.length
        }    |    Ngày xuất: ${new Date().toLocaleString("vi-VN")}`;

        sheet.getCell("A3").font = {
          size: 11,
          color: { argb: "FF475569" },
        };

        sheet.getRow(3).height = 24;
        sheet.getRow(4).height = 10;

        // Header bảng tại dòng 5
        const headerRow = sheet.getRow(5);
        headerRow.values = HEADERS;
        headerRow.height = 30;

        headerRow.eachCell((cell) => {
          cell.font = {
            bold: true,
            color: { argb: "FFFFFFFF" },
          };

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2563A6" },
          };

          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: true,
          };

          cell.border = {
            bottom: {
              style: "thin",
              color: { argb: "FFCBD5E1" },
            },
          };
        });

        students.forEach((student, studentIndex) => {
          const employeeNames =
            student.intakeUsers?.map((employee) => employee.fullName) ?? [];

          const row = sheet.addRow([
            studentIndex + 1,
            safeExcelText(student.registrationCode),
            safeExcelText(student.fullName),
            formatDate(student.dateOfBirth),
            safeExcelText(student.identityNumber),
            safeExcelText(applicationLabel(student.applicationType)),
            safeExcelText(student.requestedLicenseClass),
            formatDateTime(student.intakeCreatedAt),
            student.hasBc2 ? "Đã có BC2" : "Chưa có BC2",
            safeExcelText(employeeNames.join(", ") || admin.fullName),
          ]);

          row.height = 23;

          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = {
              vertical: "middle",
              wrapText: true,
            };

            cell.border = {
              bottom: {
                style: "hair",
                color: { argb: "FFE2E8F0" },
              },
            };

            if (studentIndex % 2 === 1) {
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFF1F5F9" },
              };
            }
          });

          // CCCD và mã hồ sơ luôn là chuỗi,
          // tránh Excel bỏ số 0 đầu.
          row.getCell(2).numFmt = "@";
          row.getCell(5).numFmt = "@";

          row.getCell(1).alignment = {
            horizontal: "center",
            vertical: "middle",
          };

          const statusCell = row.getCell(9);
          statusCell.font = {
            color: {
              argb: student.hasBc2 ? "FF166534" : "FF92400E",
            },
          };
        });

        if (students.length === 0) {
          const row = sheet.addRow([
            "",
            "Nhân viên chưa tiếp nhận học viên nào.",
          ]);

          row.getCell(2).font = {
            italic: true,
            color: { argb: "FF64748B" },
          };
        }

        // Cố định 5 dòng trên cùng.
        sheet.views = [
          {
            state: "frozen",
            ySplit: 5,
          },
        ];

        sheet.autoFilter = {
          from: "A5",
          to: `J${Math.max(6, 5 + students.length)}`,
        };

        sheet.pageSetup = {
          paperSize: 9,
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
        };
      }

      setProgress("Đang tạo file Excel...");

      const buffer = await workbook.xlsx.writeBuffer();

      const now = new Date();

      const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("");

      const filename = `Bao_cao_hoc_vien_theo_admin_${datePart}.xlsx`;

      downloadWorkbook(new Uint8Array(buffer), filename);

      setProgress("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể xuất báo cáo Excel."
      );
    } finally {
      setExporting(false);
      setProgress("");
    }
  }

  return (
    <>
      <Tooltip
        title={
          selectedIds.length === 0
            ? "Chọn ít nhất một tài khoản để xuất báo cáo"
            : `Xuất học viên của ${selectedIds.length} tài khoản, mỗi tài khoản một sheet`
        }
      >
        <Box component="span">
          <Button
            variant="outlined"
            color="success"
            startIcon={
              exporting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <FileDownloadOutlined />
              )
            }
            disabled={!canExport}
            onClick={() => void handleExport()}
            sx={{
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          >
            {exporting ? "Đang xuất..." : `Xuất Excel (${selectedIds.length})`}
          </Button>
        </Box>
      </Tooltip>

      <Snackbar
        open={Boolean(progress) && exporting}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <Alert severity="info" icon={<CircularProgress size={16} />}>
          {progress}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={7000}
        onClose={() => setError("")}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
      >
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
