import { jsPDF } from "jspdf";

// STORY-041 — client-side PDF rendering for the personal cheatsheet. Pure helper: takes the
// markdown content (already user-edited) and produces a single-page-ish printable PDF using
// jspdf's text + multi-line layout. Style is intentionally minimal — sans-serif, two type
// sizes, no fancy paging. The function returns the constructed `jsPDF` instance so the
// caller can decide whether to `.save(filename)` or `.output("blob")` for preview.
//
// The renderer is a tiny markdown-to-PDF mapping — it doesn't aim to support GitHub-flavored
// markdown. It handles `# heading`, `## heading`, fenced code blocks, and `**bold:**` line
// prefixes. Anything else goes through as plain text. This is consistent with what the
// `entriesToMarkdown` agent helper produces and lets the user lightly edit without breaking
// the renderer.

export interface CheatsheetPdfOptions {
  title?: string;
  // Allows tests to inject a stubbed jsPDF impl. When omitted, `jsPDF` from the
  // dependency is used.
  pdfFactory?: () => CheatsheetPdfDoc;
}

// Minimal subset of jsPDF the renderer touches. Defining it as an interface keeps the helper
// testable without instantiating the real lib + measuring DOM glyphs.
export interface CheatsheetPdfDoc {
  setFont(fontName: string, fontStyle?: string): void;
  setFontSize(size: number): void;
  text(text: string | string[], x: number, y: number): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
  addPage(): void;
  save(filename: string): void;
  output(type: "blob"): Blob;
}

export interface RenderedCheatsheetPdf {
  doc: CheatsheetPdfDoc;
  pages: number;
}

const PAGE_MARGIN = 36; // pt
const PAGE_WIDTH = 612; // US Letter width in pt (jsPDF default)
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LINE_HEIGHT = 14;
const HEADING_LINE_HEIGHT = 20;
const SUBHEADING_LINE_HEIGHT = 16;

export function renderCheatsheetPdf(
  markdown: string,
  opts: CheatsheetPdfOptions = {},
): RenderedCheatsheetPdf {
  const doc = opts.pdfFactory
    ? opts.pdfFactory()
    : (new jsPDF({ unit: "pt", format: "letter" }) as unknown as CheatsheetPdfDoc);
  let y = PAGE_MARGIN;
  let pages = 1;

  const advance = (delta: number): void => {
    y += delta;
    if (y > PAGE_HEIGHT - PAGE_MARGIN) {
      doc.addPage();
      pages += 1;
      y = PAGE_MARGIN;
    }
  };

  if (opts.title && opts.title.trim().length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(opts.title, PAGE_MARGIN, y);
    advance(HEADING_LINE_HEIGHT + 4);
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushCodeBlock = (): void => {
    if (codeBuffer.length === 0) return;
    doc.setFont("courier", "normal");
    doc.setFontSize(9);
    for (const codeLine of codeBuffer) {
      const wrapped = doc.splitTextToSize(codeLine, CONTENT_WIDTH);
      for (const w of wrapped) {
        doc.text(w, PAGE_MARGIN, y);
        advance(LINE_HEIGHT - 2);
      }
    }
    codeBuffer = [];
    advance(4);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }
    if (line.startsWith("# ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const wrapped = doc.splitTextToSize(line.slice(2), CONTENT_WIDTH);
      for (const w of wrapped) {
        doc.text(w, PAGE_MARGIN, y);
        advance(HEADING_LINE_HEIGHT);
      }
      advance(2);
      continue;
    }
    if (line.startsWith("## ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      const wrapped = doc.splitTextToSize(line.slice(3), CONTENT_WIDTH);
      for (const w of wrapped) {
        doc.text(w, PAGE_MARGIN, y);
        advance(SUBHEADING_LINE_HEIGHT);
      }
      advance(2);
      continue;
    }
    if (line.length === 0) {
      advance(LINE_HEIGHT / 2);
      continue;
    }
    // Body text — italic for `_..._` lines, plain otherwise. **Gotcha:** prefix gets bolded.
    const isItalic = line.startsWith("_") && line.endsWith("_") && line.length > 2;
    const gotchaMatch = line.match(/^\*\*Gotcha:\*\*\s*(.*)$/);
    if (gotchaMatch) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const label = "Gotcha: ";
      doc.text(label, PAGE_MARGIN, y);
      const labelWidth = doc.getTextWidth(label);
      doc.setFont("helvetica", "normal");
      const rest = gotchaMatch[1] ?? "";
      const wrapped = doc.splitTextToSize(rest, CONTENT_WIDTH - labelWidth);
      for (let i = 0; i < wrapped.length; i++) {
        const segment = wrapped[i] ?? "";
        if (i === 0) {
          doc.text(segment, PAGE_MARGIN + labelWidth, y);
          advance(LINE_HEIGHT);
        } else {
          doc.text(segment, PAGE_MARGIN, y);
          advance(LINE_HEIGHT);
        }
      }
      continue;
    }
    doc.setFont("helvetica", isItalic ? "italic" : "normal");
    doc.setFontSize(10);
    const stripped = isItalic ? line.slice(1, -1) : line;
    const wrapped = doc.splitTextToSize(stripped, CONTENT_WIDTH);
    for (const w of wrapped) {
      doc.text(w, PAGE_MARGIN, y);
      advance(LINE_HEIGHT);
    }
  }
  if (inCodeBlock) {
    // Unclosed fence — flush whatever's there so users still see their code.
    flushCodeBlock();
  }

  return { doc, pages };
}

// Convenience: render + save with a sensible filename. Kept on the same module so callers
// don't have to import jsPDF directly.
export function downloadCheatsheetPdf(
  markdown: string,
  filename: string,
  opts: CheatsheetPdfOptions = {},
): RenderedCheatsheetPdf {
  const rendered = renderCheatsheetPdf(markdown, opts);
  rendered.doc.save(filename);
  return rendered;
}
