/**
 * Minimal one-page PDF wrapping a JPEG canvas render (WYSIWYG export).
 * Binary JPEG is embedded via Uint8Array so DCT streams stay valid.
 */

const enc = new TextEncoder();

const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const pdfEscape = (s: string): string => s.replace(/[()\\]/g, '\\$&');

const jpegFromCanvas = (canvas: HTMLCanvasElement): Uint8Array => {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid JPEG data URL from canvas');
  const bin = atob(dataUrl.slice(comma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
};

/**
 * Create a one-page PDF containing a JPEG canvas render. Dimensions are kept in
 * CSS pixels and mapped 1:1 to PDF points, which is sufficient for export.
 */
export function canvasToPdfBlob(canvas: HTMLCanvasElement, title = 'molecule'): Blob {
  const jpeg = jpegFromCanvas(canvas);
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);

  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = enc.encode(contentStream);

  // Object bodies (1-based). Image object (4) is built as bytes so JPEG stays binary-safe.
  const obj1 = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
  const obj2 = enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const obj3 = enc.encode(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  const obj4Header = enc.encode(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  const obj4 = concatBytes(obj4Header, jpeg, enc.encode('\nendstream'));
  const obj5 = concatBytes(
    enc.encode(`<< /Length ${contentBytes.length} >>\nstream\n`),
    contentBytes,
    enc.encode('endstream'),
  );
  const obj6 = enc.encode(`<< /Title (${pdfEscape(title)}) /Producer (MolDraw) >>`);

  const objects = [obj1, obj2, obj3, obj4, obj5, obj6];

  const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n')];
  const offsets: number[] = [0];
  let offset = parts[0]!.length;

  objects.forEach((body, index) => {
    offsets.push(offset);
    const header = enc.encode(`${index + 1} 0 obj\n`);
    const footer = enc.encode('\nendobj\n');
    parts.push(header, body, footer);
    offset += header.length + body.length + footer.length;
  });

  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\n`;
  xref += `startxref\n${xrefOffset}\n%%EOF`;
  parts.push(enc.encode(xref));

  const pdfBytes = concatBytes(...parts);
  const ab = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([ab], { type: 'application/pdf' });
}
