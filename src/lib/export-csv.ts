export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  const cols = headers ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return "";
    // Texto que começa com = + - @ vira fórmula no Excel/Sheets (nome de lead
    // vem de formulário público): o apóstrofo faz a planilha tratar como texto.
    const bruto = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    const s = bruto.replace(/"/g, '""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
  headers?: string[],
) {
  const csv = "\uFEFF" + toCsv(rows, headers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
