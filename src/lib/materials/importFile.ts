/**
 * 브라우저에서 CSV / XLSX 파일을 행 객체 배열로 읽는다.
 */
export async function readCsvFile(file: File): Promise<Record<string, string>[]> {
  const Papa = (await import("papaparse")).default;
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (result) => resolve(result.data),
      error: (err: Error) => reject(err),
    });
  });
}

export async function readXlsxFile(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });
}

export async function readSpreadsheetFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    return readCsvFile(file);
  }
  return readXlsxFile(file);
}
