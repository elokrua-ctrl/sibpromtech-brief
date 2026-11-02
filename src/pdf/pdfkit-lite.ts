/**
 * Мини-генератор PDF без внешних зависимостей.
 * Встраивает TrueType-шрифт (Identity-H), поэтому кириллица выводится
 * как настоящий текст: его можно выделять, копировать и искать.
 */

/* ---------------- TrueType ---------------- */

export interface TtfFont {
  bytes: Uint8Array;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  bbox: [number, number, number, number];
  italicAngle: number;
  advances: Uint16Array;
  cmap: Map<number, number>;
  name: string;
}

export function parseTtf(bytes: Uint8Array, name: string): TtfFont {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(4);
  const tables: Record<string, { off: number; len: number }> = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
    tables[tag] = { off: dv.getUint32(rec + 8), len: dv.getUint32(rec + 12) };
  }
  const head = tables['head'].off;
  const unitsPerEm = dv.getUint16(head + 18);
  const bbox: [number, number, number, number] = [
    dv.getInt16(head + 36),
    dv.getInt16(head + 38),
    dv.getInt16(head + 40),
    dv.getInt16(head + 42),
  ];
  const hhea = tables['hhea'].off;
  const ascent = dv.getInt16(hhea + 4);
  const descent = dv.getInt16(hhea + 6);
  const numHMetrics = dv.getUint16(hhea + 34);
  const numGlyphs = dv.getUint16(tables['maxp'].off + 4);
  const hmtx = tables['hmtx'].off;
  const advances = new Uint16Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numHMetrics) last = dv.getUint16(hmtx + g * 4);
    advances[g] = last;
  }
  let capHeight = Math.round(ascent * 0.7);
  if (tables['OS/2']) {
    const os2 = tables['OS/2'].off;
    if (dv.getUint16(os2) >= 2 && tables['OS/2'].len >= 90) capHeight = dv.getInt16(os2 + 88);
  }
  let italicAngle = 0;
  if (tables['post']) italicAngle = dv.getInt32(tables['post'].off + 4) / 65536;

  const cmap = new Map<number, number>();
  const cm = tables['cmap'].off;
  const n = dv.getUint16(cm + 2);
  let sub = -1;
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(cm + 4 + i * 8);
    const eid = dv.getUint16(cm + 6 + i * 8);
    const off = dv.getUint32(cm + 8 + i * 8);
    if (dv.getUint16(cm + off) === 4 && ((pid === 3 && eid === 1) || pid === 0)) {
      sub = cm + off;
      if (pid === 3) break;
    }
  }
  if (sub < 0) throw new Error('В шрифте нет таблицы cmap формата 4');
  const segX2 = dv.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = dv.getUint16(ends + s * 2);
    const start = dv.getUint16(starts + s * 2);
    const delta = dv.getInt16(deltas + s * 2);
    const ro = dv.getUint16(ranges + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g: number;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        const addr = ranges + s * 2 + ro + (c - start) * 2;
        g = dv.getUint16(addr);
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g) cmap.set(c, g);
    }
  }
  return { bytes, unitsPerEm, ascent, descent, capHeight, bbox, italicAngle, advances, cmap, name };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------------- PDF ---------------- */

export class FontHandle {
  used = new Map<number, number>(); // gid -> unicode
  constructor(
    public font: TtfFont,
    public resName: string,
  ) {}

  /** Ширина строки в пунктах */
  width(text: string, size: number): number {
    let w = 0;
    for (const ch of text) {
      const g = this.gid(ch);
      w += this.font.advances[g] ?? 0;
    }
    return (w * size) / this.font.unitsPerEm;
  }

  gid(ch: string): number {
    const cp = ch.codePointAt(0)!;
    let g = this.font.cmap.get(cp);
    if (g === undefined) {
      const fallback = FALLBACKS[cp];
      g = fallback !== undefined ? this.font.cmap.get(fallback) : undefined;
    }
    return g ?? this.font.cmap.get(0x3f) ?? 0;
  }

  encode(text: string): string {
    let hex = '';
    for (const ch of text) {
      const g = this.gid(ch);
      if (!this.used.has(g)) this.used.set(g, ch.codePointAt(0)!);
      hex += g.toString(16).padStart(4, '0');
    }
    return hex;
  }
}

/** Символы, которых может не быть в подмножестве шрифта */
const FALLBACKS: Record<number, number> = {
  0x2014: 0x2013,
  0x2192: 0x2013,
  0x2501: 0x2013,
  0x25b8: 0x2022,
  0x00a0: 0x20,
};

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

export class Page {
  ops: string[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {}

  rect(x: number, y: number, w: number, h: number, fill: RGB): void {
    this.ops.push(`${f2(fill[0])} ${f2(fill[1])} ${f2(fill[2])} rg ${f2(x)} ${f2(this.height - y - h)} ${f2(w)} ${f2(h)} re f`);
  }

  strokeRect(x: number, y: number, w: number, h: number, color: RGB, lw = 0.6): void {
    this.ops.push(
      `${f2(color[0])} ${f2(color[1])} ${f2(color[2])} RG ${f2(lw)} w ${f2(x)} ${f2(this.height - y - h)} ${f2(w)} ${f2(h)} re S`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: RGB, lw = 0.5): void {
    this.ops.push(
      `${f2(color[0])} ${f2(color[1])} ${f2(color[2])} RG ${f2(lw)} w ${f2(x1)} ${f2(this.height - y1)} m ${f2(x2)} ${f2(this.height - y2)} l S`,
    );
  }

  /** y — базовая линия, отсчёт сверху страницы */
  text(font: FontHandle, size: number, x: number, y: number, s: string, color: RGB, charSpacing = 0): void {
    if (!s) return;
    this.ops.push(
      `BT /${font.resName} ${f2(size)} Tf ${f2(color[0])} ${f2(color[1])} ${f2(color[2])} rg ${charSpacing ? `${f2(charSpacing)} Tc ` : ''}${f2(x)} ${f2(this.height - y)} Td <${font.encode(s)}> Tj ${charSpacing ? '0 Tc ' : ''}ET`,
    );
  }
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: new (f: string) => TransformStream<Uint8Array, Uint8Array> }).CompressionStream;
  if (!CS) return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CS('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

const enc = new TextEncoder();

export class PdfDocument {
  pages: Page[] = [];
  fonts: FontHandle[] = [];
  title = '';
  author = '';

  addFont(font: TtfFont): FontHandle {
    const h = new FontHandle(font, `F${this.fonts.length + 1}`);
    this.fonts.push(h);
    return h;
  }

  addPage(w = 595.28, h = 841.89): Page {
    const p = new Page(w, h);
    this.pages.push(p);
    return p;
  }

  async save(): Promise<Uint8Array> {
    const objs: (Uint8Array | null)[] = [null]; // 1-based
    const reserve = () => {
      objs.push(null);
      return objs.length - 1;
    };
    const setObj = (id: number, body: string | Uint8Array) => {
      objs[id] = typeof body === 'string' ? enc.encode(body) : body;
    };
    const stream = async (dict: string, data: Uint8Array, compress = true): Promise<Uint8Array> => {
      const z = compress ? await deflate(data) : null;
      const payload = z ?? data;
      const head = enc.encode(`<< ${dict} /Length ${payload.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
      const tail = enc.encode('\nendstream');
      const out = new Uint8Array(head.length + payload.length + tail.length);
      out.set(head, 0);
      out.set(payload, head.length);
      out.set(tail, head.length + payload.length);
      return out;
    };

    const catalogId = reserve();
    const pagesId = reserve();
    const infoId = reserve();

    // Сначала страницы (заполняют used glyphs), потом шрифты
    const fontIds = this.fonts.map(() => reserve());
    const pageIds: number[] = [];
    for (const p of this.pages) {
      const cId = reserve();
      setObj(cId, await stream('', enc.encode(p.ops.join('\n'))));
      const pid = reserve();
      const fontRes = this.fonts.map((f, i) => `/${f.resName} ${fontIds[i]} 0 R`).join(' ');
      setObj(
        pid,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(p.width)} ${f2(p.height)}] /Resources << /Font << ${fontRes} >> >> /Contents ${cId} 0 R >>`,
      );
      pageIds.push(pid);
    }

    for (let i = 0; i < this.fonts.length; i++) {
      const fh = this.fonts[i];
      const f = fh.font;
      const scale = 1000 / f.unitsPerEm;
      const fileId = reserve();
      setObj(fileId, await stream(`/Length1 ${f.bytes.length}`, f.bytes));
      const descId = reserve();
      const psName = f.name.replace(/[^A-Za-z0-9-]/g, '');
      setObj(
        descId,
        `<< /Type /FontDescriptor /FontName /${psName} /Flags 32 /FontBBox [${f.bbox.map((v) => Math.round(v * scale)).join(' ')}] /ItalicAngle ${f.italicAngle} /Ascent ${Math.round(f.ascent * scale)} /Descent ${Math.round(f.descent * scale)} /CapHeight ${Math.round(f.capHeight * scale)} /StemV 80 /FontFile2 ${fileId} 0 R >>`,
      );
      const gids = [...fh.used.keys()].sort((a, b) => a - b);
      const w = gids.map((g) => `${g} [${Math.round(f.advances[g] * scale)}]`).join(' ');
      const cidId = reserve();
      setObj(
        cidId,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${psName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 500 /W [${w}] /CIDToGIDMap /Identity >>`,
      );
      const bf = gids
        .map((g) => {
          const cp = fh.used.get(g)!;
          const u = cp > 0xffff ? '003F' : cp.toString(16).padStart(4, '0');
          return `<${g.toString(16).padStart(4, '0')}> <${u}>`;
        })
        .reduce<string[][]>((acc, line, idx) => {
          if (idx % 100 === 0) acc.push([]);
          acc[acc.length - 1].push(line);
          return acc;
        }, [])
        .map((chunk) => `${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`)
        .join('\n');
      const cmapStr = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${bf}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
      const tuId = reserve();
      setObj(tuId, await stream('', enc.encode(cmapStr)));
      setObj(
        fontIds[i],
        `<< /Type /Font /Subtype /Type0 /BaseFont /${psName} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${tuId} 0 R >>`,
      );
    }

    setObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (ru-RU) >>`);
    setObj(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    setObj(infoId, `<< /Title ${pdfString(this.title)} /Author ${pdfString(this.author)} /Producer (sibpromtech-brief) >>`);

    const chunks: Uint8Array[] = [];
    let offset = 0;
    const push = (b: Uint8Array) => {
      chunks.push(b);
      offset += b.length;
    };
    push(enc.encode('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'));
    const offsets: number[] = [0];
    for (let id = 1; id < objs.length; id++) {
      offsets[id] = offset;
      push(enc.encode(`${id} 0 obj\n`));
      push(objs[id] ?? enc.encode('null'));
      push(enc.encode('\nendobj\n'));
    }
    const xref = offset;
    let x = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objs.length; id++) x += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    x += `trailer\n<< /Size ${objs.length} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    push(enc.encode(x));
    const out = new Uint8Array(offset);
    let p = 0;
    for (const c of chunks) {
      out.set(c, p);
      p += c.length;
    }
    return out;
  }
}

/** Строка PDF в UTF-16BE (для метаданных с кириллицей) */
function pdfString(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex}>`;
}
