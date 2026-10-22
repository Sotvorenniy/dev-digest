export interface CsvColumn {
  key: string;
  header: string;
}

/** Turns rows into a CSV document. Implemented in src/adapters/exporter. */
export interface CsvExporter {
  toCsv(columns: CsvColumn[], rows: Record<string, string | number | null>[]): string;
}
