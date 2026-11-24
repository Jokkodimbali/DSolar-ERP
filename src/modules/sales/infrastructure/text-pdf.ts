// Minimal static PDF 1.4 writer: base font, text-only streams, no scripts or attachments.
const WIDTH = 90;
const ROWS = 49;

function safeText(value: string): string {
  return value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/gu, '?');
}

function hex(value: string): string {
  return Array.from(safeText(value), (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

export function renderTextPdf(title: string, rows: string[]): string {
  const lines = rows.flatMap((row) => {
    const value = safeText(row);
    return value.match(new RegExp('.{1,' + WIDTH + '}', 'g')) ?? [''];
  });
  const pages: string[][] = [];
  for (let i = 0; i < lines.length || i === 0; i += ROWS) pages.push(lines.slice(i, i + ROWS));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count ' + pages.length + ' /Kids [' +
      pages.map((_, i) => (4 + i * 2) + ' 0 R').join(' ') + '] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  const text = (value: string, x: number, y: number, size: number) =>
    'BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td <' + hex(value) + '> Tj ET';
  pages.forEach((page, i) => {
    const content = [
      text(title, 45, 800, 16),
      ...page.map((row, index) => text(row, 45, 770 - index * 14, 9)),
      text('Page ' + (i + 1) + ' / ' + pages.length, 45, 45, 9),
    ].join('\n') + '\n';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' +
      (5 + i * 2) + ' 0 R >>');
    objects.push('<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' +
    offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return pdf;
}
