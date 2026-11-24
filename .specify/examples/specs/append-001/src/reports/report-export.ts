// CSV export of the daily sales report.
export interface ReportRow {
  sku: string;
  name: string;
  unitsSold: number;
}

export function exportReportCsv(rows: ReportRow[]): string {
  const header = 'sku,name,units_sold';
  const body = rows.map((row) => `${row.sku},${row.name},${row.unitsSold}`);
  return [header, ...body].join('\n');
}
