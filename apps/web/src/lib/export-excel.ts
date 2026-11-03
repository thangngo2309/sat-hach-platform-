export type ExcelCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

export interface ExcelColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => ExcelCellValue;
}

export interface ExcelPage<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ExportExcelOptions<T> {
  filename: string;
  sheetName: string;
  columns: ExcelColumn<T>[];
  fetchPage: (page: number, limit: number) => Promise<ExcelPage<T>>;
  pageSize?: number;
  maxRows?: number;
}

/**
 * Không cho một chuỗi dữ liệu từ database bị
 * Excel diễn giải thành công thức.
 */
function safeExcelValue(value: ExcelCellValue): ExcelCellValue {
  if (typeof value !== "string") return value;

  return /^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

function safeFilename(name: string): string {
  const base = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();

  return base.toLowerCase().endsWith(".xlsx") ? base : `${base}.xlsx`;
}

export async function exportPagedExcel<T>({
  filename,
  sheetName,
  columns,
  fetchPage,
  pageSize = 100,
  maxRows = 100000,
}: ExportExcelOptions<T>): Promise<number> {
  if (!columns.length) {
    throw new Error("Chưa cấu hình cột xuất Excel.");
  }

  // Chỉ tải ExcelJS khi người dùng thực sự bấm xuất.
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hệ thống quản lý sát hạch ô tô";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: {
      defaultRowHeight: 20,
    },
  });

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 22,
  }));

  const headerRow = sheet.getRow(1);

  headerRow.font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF174A73" },
  };

  headerRow.alignment = {
    vertical: "middle",
    wrapText: true,
  };

  headerRow.height = 30;

  let page = 1;
  let count = 0;
  let totalPages = 1;

  do {
    const response = await fetchPage(page, pageSize);

    if (!response || !Array.isArray(response.data)) {
      throw new Error("API không trả về danh sách Excel hợp lệ.");
    }

    totalPages = Math.max(1, Number(response.pagination.totalPages) || 1);

    const total = Number(response.pagination.total) || 0;

    if (total > maxRows) {
      throw new Error(
        `Danh sách có ${total.toLocaleString("vi-VN")} bản ghi. ` +
          `Giới hạn mỗi lần xuất là ${maxRows.toLocaleString("vi-VN")} ` +
          "bản ghi; vui lòng lọc hẹp hơn."
      );
    }

    for (const row of response.data) {
      if (count >= maxRows) {
        throw new Error("Số bản ghi vượt quá giới hạn xuất Excel.");
      }

      const values: Record<string, ExcelCellValue> = {};

      for (const column of columns) {
        values[column.key] = safeExcelValue(column.value(row));
      }

      sheet.addRow(values);
      count += 1;
    }

    if (page < totalPages && response.data.length === 0) {
      throw new Error(
        "API trả về trang rỗng trước khi hết dữ liệu. " +
          "Vui lòng kiểm tra giới hạn phân trang Backend."
      );
    }

    page += 1;
  } while (page <= totalPages);

  if (sheet.rowCount > 1) {
    sheet.autoFilter = {
      from: {
        row: 1,
        column: 1,
      },
      to: {
        row: sheet.rowCount,
        column: columns.length,
      },
    };
  }

  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
    const row = sheet.getRow(rowIndex);

    row.alignment = {
      vertical: "middle",
      wrapText: true,
    };

    if (rowIndex % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF2F6FA" },
      };
    }

    row.eachCell((cell) => {
      if (cell.value instanceof Date) {
        cell.numFmt = "dd/mm/yyyy";
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = safeFilename(filename);

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);

  return count;
}
