import type { CsvColumn, CsvExporter } from '../../ports/csv-exporter.js';
import { CSV_DELIMITER, CSV_MAX_CELL_CHARS } from '../../modules/finding-export/constants.js';

export class PlainCsvExporter implements CsvExporter {
  toCsv(columns: CsvColumn[], rows: Record<string, string | number | null>[]): string {
    const header = columns.map((c) => escape(c.header)).join(CSV_DELIMITER);
    const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(CSV_DELIMITER));
    return [header, ...body].join('\n');
  }
}

function escape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value).slice(0, CSV_MAX_CELL_CHARS);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
