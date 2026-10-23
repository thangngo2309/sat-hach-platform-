import type ExcelJS from "exceljs";

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
};

export type ExcelSheet = {
  name: string;
  title: string;
  subtitle?: string;
  columns: ExcelColumn[];
  rows: Record<string, string | number | null | undefined>[];
};

function safeExcelValue(value: unknown): string | number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  // Ngăn dữ liệu từ XML hoặc người dùng bị Excel hiểu
  // thành công thức khi mở báo cáo.
  return /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function safeFilename(name: string) {
  return name.normalize("NFC").replace(/[\\/:*?"<>|]/g, "-");
}

export async function exportExcel(
  filename: string,
  sheets: ExcelSheet[]
): Promise<void> {
  const Excel = await import("exceljs");
  const workbook = new Excel.Workbook();

  workbook.creator = "Sat Hach Platform";
  workbook.created = new Date();

  for (const config of sheets) {
    const sheet = workbook.addWorksheet(config.name.slice(0, 31));

    const count = config.columns.length;
    if (!count) continue;

    sheet.mergeCells(1, 1, 1, count);

    const title = sheet.getCell(1, 1);
    title.value = config.title;
    title.font = {
      bold: true,
      size: 16,
      color: { argb: "FFFFFFFF" },
    };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17365D" },
    };
    title.alignment = {
      vertical: "middle",
      horizontal: "left",
    };
    sheet.getRow(1).height = 32;

    sheet.mergeCells(2, 1, 2, count);

    const subtitle = sheet.getCell(2, 1);
    subtitle.value = config.subtitle ?? "";
    subtitle.font = {
      italic: true,
      size: 10,
      color: { argb: "FF475569" },
    };
    sheet.getRow(2).height = 24;

    config.columns.forEach((column, index) => {
      const excelColumn = sheet.getColumn(index + 1);
      excelColumn.width = Math.min(Math.max(column.width ?? 18, 10), 45);

      const header = sheet.getCell(4, index + 1);
      header.value = column.header;
      header.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      header.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563A6" },
      };
      header.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });

    sheet.getRow(4).height = 32;

    config.rows.forEach((record, rowIndex) => {
      const rowNumber = rowIndex + 5;
      const row = sheet.getRow(rowNumber);

      config.columns.forEach((column, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);

        cell.value = safeExcelValue(record[column.key]);

        cell.alignment = {
          vertical: "middle",
          wrapText: true,
        };

        if (rowIndex % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F5F9" },
          };
        }

        cell.border = {
          bottom: {
            style: "hair",
            color: { argb: "FFE2E8F0" },
          },
        };
      });

      row.height = 23;
    });

    sheet.views = [
      {
        state: "frozen",
        ySplit: 4,
      },
    ];

    sheet.autoFilter = {
      from: {
        row: 4,
        column: 1,
      },
      to: {
        row: Math.max(4, config.rows.length + 4),
        column: count,
      },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = safeFilename(
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  );

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}
