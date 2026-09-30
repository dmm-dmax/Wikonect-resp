import { extractText, getDocumentProxy } from "unpdf";

const MAX_PAGES = 100;
const MAX_CHARS = 300_000;

export type PdfText = { pages: string[]; truncated: boolean };

/** Extrahiert den Textlayer. Kein OCR. Scans ohne Text liefern leere Seiten. */
export async function extractPdfText(buf: Buffer): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  let total = 0;
  let truncated = text.length > MAX_PAGES;
  const pages: string[] = [];
  for (const t of text.slice(0, MAX_PAGES)) {
    if (total + t.length > MAX_CHARS) {
      pages.push(t.slice(0, Math.max(0, MAX_CHARS - total)));
      truncated = true;
      break;
    }
    pages.push(t);
    total += t.length;
  }
  return { pages, truncated };
}
