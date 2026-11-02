import { BRAND } from '../config/brand';
import { SOURCE_LABEL, type Block, type Doc, type ProjectCard, type Source } from '../logic/doc';
import boldB64 from './fonts/liberation-bold';
import regularB64 from './fonts/liberation-regular';
import { base64ToBytes, FontHandle, hexToRgb, Page, parseTtf, PdfDocument, type RGB } from './pdfkit-lite';

const C = {
  graphite: hexToRgb(BRAND.colors.graphite),
  steel: hexToRgb(BRAND.colors.steel),
  red: hexToRgb(BRAND.colors.red),
  light: hexToRgb(BRAND.colors.light),
  white: [1, 1, 1] as RGB,
  text: hexToRgb('#1B2731'),
  muted: hexToRgb('#5B6876'),
  paper: hexToRgb('#F3F4F5'),
};

const SOURCE_COLOR: Record<Source, RGB> = { client: C.steel, fact: C.graphite, rec: C.red };

const W = 595.28;
const H = 841.89;
const M = 48;
const CW = W - M * 2;
const BOTTOM = H - 56;

class Layout {
  doc = new PdfDocument();
  reg: FontHandle;
  bold: FontHandle;
  page!: Page;
  y = 0;

  constructor(
    private title: string,
  ) {
    this.reg = this.doc.addFont(parseTtf(base64ToBytes(regularB64), 'LiberationSans'));
    this.bold = this.doc.addFont(parseTtf(base64ToBytes(boldB64), 'LiberationSans-Bold'));
    this.doc.title = title;
    this.doc.author = BRAND.name;
  }

  newPage(): void {
    this.page = this.doc.addPage(W, H);
    // Тонкая шапка на продолжении
    this.page.rect(0, 0, W, 6, C.graphite);
    this.page.rect(M, 6, 36, 2, C.red);
    this.y = 40;
  }

  ensure(h: number): boolean {
    if (this.y + h > BOTTOM) {
      this.newPage();
      return true;
    }
    return false;
  }

  wrap(text: string, font: FontHandle, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const word of words) {
        const cand = line ? `${line} ${word}` : word;
        if (font.width(cand, size) <= width) {
          line = cand;
          continue;
        }
        if (line) lines.push(line);
        if (font.width(word, size) <= width) {
          line = word;
        } else {
          // очень длинное слово — режем по символам
          let part = '';
          for (const ch of word) {
            if (font.width(part + ch, size) > width) {
              lines.push(part);
              part = ch;
            } else part += ch;
          }
          line = part;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Абзац с переносами; возвращает высоту */
  para(text: string, opts: { font?: FontHandle; size?: number; color?: RGB; x?: number; width?: number; lead?: number } = {}): void {
    const font = opts.font ?? this.reg;
    const size = opts.size ?? 10;
    const lead = opts.lead ?? size * 1.42;
    const x = opts.x ?? M;
    const width = opts.width ?? CW - (x - M);
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lead);
      this.page.text(font, size, x, this.y + size, line, opts.color ?? C.text);
      this.y += lead;
    }
  }

  tag(source: Source | undefined, x = M, keepWith = 40): void {
    if (!source) return;
    const label = SOURCE_LABEL[source].toUpperCase();
    const size = 6.5;
    const w = this.bold.width(label, size) + label.length * 0.4 + 10;
    this.ensure(16 + keepWith);
    this.page.rect(x, this.y, w, 12, SOURCE_COLOR[source]);
    this.page.text(this.bold, size, x + 5, this.y + 8.4, label, C.white, 0.4);
    this.y += 16;
  }

  cover(doc: Doc): void {
    this.page = this.doc.addPage(W, H);
    const hh = 168;
    this.page.rect(0, 0, W, hh, C.graphite);
    this.page.rect(M, 40, 36, 3, C.red);
    this.page.text(this.bold, 9, M, 64, BRAND.name.toUpperCase(), C.white, 2.2);
    this.page.text(this.reg, 8, M, 78, BRAND.fullName, C.light);
    let y = 112;
    for (const line of this.wrap(doc.title, this.bold, 19, CW)) {
      this.page.text(this.bold, 19, M, y, line, C.white);
      y += 23;
    }
    this.page.text(this.reg, 10, M, Math.min(y + 2, hh - 10), doc.subtitle, C.light);
    this.y = hh + 22;
    for (const [k, v] of doc.meta) {
      this.page.text(this.bold, 8.5, M, this.y + 8.5, k, C.muted);
      this.para(v, { size: 8.5, x: M + 110, color: C.text, lead: 12 });
    }
    this.y += 8;
    // Дисклеймер
    const lines = this.wrap(doc.disclaimer, this.reg, 9, CW - 28);
    const bh = lines.length * 13 + 18;
    this.page.rect(M, this.y, CW, bh, C.paper);
    this.page.rect(M, this.y, 3, bh, C.red);
    let ty = this.y + 9;
    for (const l of lines) {
      this.page.text(this.reg, 9, M + 16, ty + 9, l, C.steel);
      ty += 13;
    }
    this.y += bh + 18;
  }

  sectionTitle(title: string): void {
    this.ensure(48);
    this.y += 8;
    this.page.rect(M, this.y + 2, 4, 14, C.red);
    const lines = this.wrap(title, this.bold, 13, CW - 14);
    for (const l of lines) {
      this.page.text(this.bold, 13, M + 12, this.y + 13, l, C.graphite);
      this.y += 18;
    }
    this.y += 6;
  }

  subTitle(text: string): void {
    this.ensure(30);
    this.para(text, { font: this.bold, size: 10, color: C.steel });
    this.y += 2;
  }

  list(items: string[], ordered?: boolean): void {
    items.forEach((it, i) => {
      const marker = ordered ? `${i + 1}.` : '•';
      const lines = this.wrap(it, this.reg, 10, CW - 18);
      this.ensure(14);
      this.page.text(ordered ? this.bold : this.reg, 10, M + 2, this.y + 10, marker, ordered ? C.red : C.steel);
      lines.forEach((l, j) => {
        if (j > 0) this.ensure(14);
        this.page.text(this.reg, 10, M + 18, this.y + 10, l, C.text);
        this.y += 14;
      });
      this.y += 2;
    });
    this.y += 4;
  }

  kv(rows: [string, string][], x = M, width = CW, size = 9.5): void {
    const kw = Math.min(150, width * 0.32);
    for (const [k, v] of rows) {
      const kl = this.wrap(k, this.bold, size - 0.5, kw - 10);
      const vl = this.wrap(v, this.reg, size, width - kw);
      const n = Math.max(kl.length, vl.length);
      const lead = size * 1.4;
      if (this.y + Math.min(n, 3) * lead + 6 > BOTTOM) this.newPage();
      const startY = this.y;
      for (let i = 0; i < n; i++) {
        if (i > 0 && this.y + lead > BOTTOM) this.newPage();
        if (kl[i]) this.page.text(this.bold, size - 0.5, x, this.y + size, kl[i], C.steel);
        if (vl[i]) this.page.text(this.reg, size, x + kw, this.y + size, vl[i], C.text);
        this.y += lead;
      }
      void startY;
      this.y += 3;
      this.page.line(x, this.y, x + width, this.y, C.light, 0.5);
      this.y += 5;
    }
    this.y += 4;
  }

  card(card: ProjectCard, source?: Source): void {
    this.ensure(50);
    this.y += 4;
    const x = M + 12;
    const width = CW - 12;
    let segStart = this.y;
    let pageAtStart = this.page;
    const closeSegment = () => {
      pageAtStart.rect(M, segStart, 3, Math.max(this.y - segStart, 4), source ? SOURCE_COLOR[source] : C.steel);
    };
    const guard = (h: number) => {
      if (this.y + h > BOTTOM) {
        closeSegment();
        this.newPage();
        segStart = this.y;
        pageAtStart = this.page;
      }
    };
    for (const l of this.wrap(card.name, this.bold, 11.5, width)) {
      guard(16);
      this.page.text(this.bold, 11.5, x, this.y + 11.5, l, C.graphite);
      this.y += 16;
    }
    guard(14);
    this.page.text(this.reg, 7.5, x, this.y + 8, card.tags.join('  ·  ').toUpperCase(), source ? SOURCE_COLOR[source] : C.muted, 0.3);
    this.y += 16;
    const kw = 128;
    for (const [k, v] of card.rows) {
      const kl = this.wrap(k, this.bold, 8.5, kw - 8);
      const vl = this.wrap(v, this.reg, 9, width - kw);
      const n = Math.max(kl.length, vl.length);
      for (let i = 0; i < n; i++) {
        guard(12.5);
        if (kl[i]) this.page.text(this.bold, 8.5, x, this.y + 9, kl[i], C.steel);
        if (vl[i]) this.page.text(this.reg, 9, x + kw, this.y + 9, vl[i], C.text);
        this.y += 12.5;
      }
      this.y += 3;
    }
    if (card.why) {
      for (const l of this.wrap(`Почему здесь: ${card.why}`, this.reg, 8, width)) {
        guard(11);
        this.page.text(this.reg, 8, x, this.y + 8, l, C.muted);
        this.y += 11;
      }
    }
    this.y += 2;
    closeSegment();
    this.y += 14;
  }

  note(text: string): void {
    const lines = this.wrap(text, this.reg, 8.5, CW - 20);
    const h = lines.length * 12 + 12;
    this.ensure(h + 6);
    this.page.rect(M, this.y, CW, h, C.paper);
    let y = this.y + 6;
    for (const l of lines) {
      this.page.text(this.reg, 8.5, M + 10, y + 8.5, l, C.muted);
      y += 12;
    }
    this.y += h + 10;
  }

  block(b: Block): void {
    if ('source' in b) this.tag(b.source, M, b.t === 'card' ? 90 : 40);
    switch (b.t) {
      case 'p':
        this.para(b.text);
        this.y += 6;
        break;
      case 'note':
        this.note(b.text);
        break;
      case 'h3':
        this.subTitle(b.sub ? `${b.text} — ${b.sub}` : b.text);
        break;
      case 'list':
        if (b.title) this.subTitle(b.title);
        this.list(b.items, b.ordered);
        break;
      case 'kv':
        if (b.title) this.subTitle(b.title);
        this.kv(b.rows);
        break;
      case 'card':
        // тег источника уже выведен
        this.card(b.card, b.source);
        break;
    }
  }

  footers(): void {
    const total = this.doc.pages.length;
    this.doc.pages.forEach((p, i) => {
      p.line(M, H - 36, W - M, H - 36, C.light, 0.5);
      p.text(this.reg, 7.5, M, H - 24, `${BRAND.name} · ${this.title}`, C.muted);
      const label = `${i + 1} / ${total}`;
      p.text(this.reg, 7.5, W - M - this.reg.width(label, 7.5), H - 24, label, C.muted);
    });
  }
}

export async function docToPdf(doc: Doc): Promise<Uint8Array> {
  const L = new Layout(doc.title);
  L.cover(doc);
  for (const s of doc.sections) {
    L.sectionTitle(s.title);
    for (const b of s.blocks) L.block(b);
  }
  L.footers();
  return L.doc.save();
}

/** Несколько документов в одном PDF */
export async function docsToPdf(docs: Doc[]): Promise<Uint8Array> {
  if (docs.length === 1) return docToPdf(docs[0]);
  const L = new Layout(docs[0].title);
  docs.forEach((d) => {
    L.cover(d);
    for (const s of d.sections) {
      L.sectionTitle(s.title);
      for (const b of s.blocks) L.block(b);
    }
  });
  L.footers();
  return L.doc.save();
}
