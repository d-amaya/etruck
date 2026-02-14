import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number)[][];
}

@Injectable({ providedIn: 'root' })
export class ExcelExportService {

  exportToExcel(filename: string, sheets: ExcelSheet[], startDate?: Date | null, endDate?: Date | null): void {
    const wb = XLSX.utils.book_new();

    for (const sheet of sheets) {
      const data = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = sheet.headers.map((h, i) => ({
        wch: Math.max(h.length, ...sheet.rows.map(r => String(r[i] ?? '').length)) + 2
      }));
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
    }

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const dateSuffix = startDate && endDate ? `_${fmt(startDate)}_to_${fmt(endDate)}` : '';
    XLSX.writeFile(wb, `${filename}${dateSuffix}.xlsx`);
  }
}
