// Minimal RFC 4180 CSV reading. The pipeline writes release CSVs with its own toCsv and reads
// them back with this, so there is one parser for both publishing and verifying.

export type Row = Record<string, string>;

/** Every record of a CSV, the header first, as the exact field strings. LF or CRLF line endings. */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(value);
      value = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(value);
      records.push(record);
      record = [];
      value = "";
    } else value += ch;
  }
  if (quoted) throw new Error("unterminated quoted field");
  if (value !== "" || record.length > 0) {
    record.push(value);
    records.push(record);
  }
  const width = records[0]?.length;
  records.forEach((r, n) => {
    if (r.length !== width) {
      throw new Error(`CSV line ${n + 1} has ${r.length} fields, header has ${width}`);
    }
  });
  return records;
}

/** The rows of a CSV as objects keyed by the header. */
export function parseCsv(text: string): Row[] {
  const [header, ...body] = parseCsvRecords(text);
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ""])));
}
