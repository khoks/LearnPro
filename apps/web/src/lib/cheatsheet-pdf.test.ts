import { describe, expect, it } from "vitest";
import {
  downloadCheatsheetPdf,
  renderCheatsheetPdf,
  type CheatsheetPdfDoc,
} from "./cheatsheet-pdf";

interface FakeDocCalls {
  setFont: Array<{ font: string; style?: string }>;
  setFontSize: number[];
  text: Array<{ text: string | string[]; x: number; y: number }>;
  splitTextToSize: Array<{ text: string; maxWidth: number }>;
  addPage: number;
  save: string[];
  output: string[];
}

function fakeDoc(): { doc: CheatsheetPdfDoc; calls: FakeDocCalls } {
  const calls: FakeDocCalls = {
    setFont: [],
    setFontSize: [],
    text: [],
    splitTextToSize: [],
    addPage: 0,
    save: [],
    output: [],
  };
  const doc: CheatsheetPdfDoc = {
    setFont(fontName: string, fontStyle?: string): void {
      const entry: { font: string; style?: string } =
        fontStyle === undefined ? { font: fontName } : { font: fontName, style: fontStyle };
      calls.setFont.push(entry);
    },
    setFontSize(size: number): void {
      calls.setFontSize.push(size);
    },
    text(text: string | string[], x: number, y: number): void {
      calls.text.push({ text, x, y });
    },
    splitTextToSize(text: string, maxWidth: number): string[] {
      calls.splitTextToSize.push({ text, maxWidth });
      return [text];
    },
    getTextWidth(text: string): number {
      return text.length * 5;
    },
    addPage(): void {
      calls.addPage += 1;
    },
    save(filename: string): void {
      calls.save.push(filename);
    },
    output(type: "blob"): Blob {
      calls.output.push(type);
      return new Blob([""]);
    },
  };
  return { doc, calls };
}

describe("renderCheatsheetPdf", () => {
  it("renders a heading + body line + section heading with the right font sizes", () => {
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf("# Personal cheatsheet\n\n_Generated on 2026-05-06_\n\n## Hash-map", {
      pdfFactory: () => doc,
    });
    // setFont called for at least: top heading, body italic line, section heading.
    expect(calls.setFont.length).toBeGreaterThan(2);
    // The top-level "# " heading should set 16pt and the "## " subheading 13pt.
    expect(calls.setFontSize).toContain(16);
    expect(calls.setFontSize).toContain(13);
    // Heading text should appear in the .text() draw calls.
    const drawnTexts = calls.text.map((t) => t.text).flat();
    expect(drawnTexts.some((t) => t.includes("Personal cheatsheet"))).toBe(true);
    expect(drawnTexts.some((t) => t.includes("Hash-map"))).toBe(true);
  });

  it("treats fenced ``` blocks as monospace code", () => {
    const md = ["## My code", "", "```", "for x in y:", "    print(x)", "```"].join("\n");
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf(md, { pdfFactory: () => doc });
    // courier monospace font requested at least once for the code block lines.
    expect(calls.setFont.some((s) => s.font === "courier")).toBe(true);
    const drawnTexts = calls.text.map((t) => t.text).flat();
    expect(drawnTexts.some((t) => t.includes("for x in y:"))).toBe(true);
    expect(drawnTexts.some((t) => t.includes("print(x)"))).toBe(true);
  });

  it("**Gotcha:** prefix renders bold label + plain rest (two-fragment line)", () => {
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf("**Gotcha:** Don't loop while mutating.", {
      pdfFactory: () => doc,
    });
    const drawnTexts = calls.text.map((t) => t.text).flat();
    expect(drawnTexts.some((t) => t === "Gotcha: ")).toBe(true);
    expect(drawnTexts.some((t) => typeof t === "string" && t.includes("mutating"))).toBe(true);
  });

  it("italic _line_ renders with italic font and strips the underscores", () => {
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf("_Generated on 2026-05-06_", { pdfFactory: () => doc });
    expect(calls.setFont.some((s) => s.style === "italic")).toBe(true);
    const drawnTexts = calls.text.map((t) => t.text).flat();
    // The underscores should have been stripped before rendering.
    expect(drawnTexts.some((t) => t === "Generated on 2026-05-06")).toBe(true);
    expect(drawnTexts.every((t) => !(typeof t === "string" && t.startsWith("_")))).toBe(true);
  });

  it("returns the rendered doc + page count for downstream callers", () => {
    const { doc } = fakeDoc();
    const out = renderCheatsheetPdf("# x", { pdfFactory: () => doc });
    expect(out.doc).toBe(doc);
    expect(out.pages).toBeGreaterThanOrEqual(1);
  });

  it("title option prepends a top-level heading even with empty markdown", () => {
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf("", {
      title: "Cheatsheet — 2026-05-06",
      pdfFactory: () => doc,
    });
    expect(calls.setFontSize).toContain(18);
    const drawnTexts = calls.text.map((t) => t.text).flat();
    expect(drawnTexts.some((t) => t === "Cheatsheet — 2026-05-06")).toBe(true);
  });

  it("flushes an unclosed fenced block (resilient to user edits)", () => {
    const md = "```\nstill open code";
    const { doc, calls } = fakeDoc();
    renderCheatsheetPdf(md, { pdfFactory: () => doc });
    const drawnTexts = calls.text.map((t) => t.text).flat();
    expect(drawnTexts.some((t) => t === "still open code")).toBe(true);
  });
});

describe("downloadCheatsheetPdf", () => {
  it("calls .save() on the underlying doc with the supplied filename", () => {
    const { doc, calls } = fakeDoc();
    downloadCheatsheetPdf("# Cheat", "cheatsheet.pdf", { pdfFactory: () => doc });
    expect(calls.save).toEqual(["cheatsheet.pdf"]);
  });

  it("the returned doc instance is the same one the renderer used", () => {
    const { doc } = fakeDoc();
    const out = downloadCheatsheetPdf("# x", "x.pdf", { pdfFactory: () => doc });
    expect(out.doc).toBe(doc);
  });
});
