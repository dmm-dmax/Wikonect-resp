import { PDFDocument, StandardFonts } from "pdf-lib";

/** Synthetische Befund-PDFs (nur erfundene Werte). */
export async function labPdf(rows: string[][], title = "Laborbefund (synthetisch)"): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]);
  p.drawText(title, { x: 50, y: 810, size: 12, font: f });
  p.drawText("Seite 1 von 1", { x: 450, y: 810, size: 9, font: f });
  p.drawText("Datum: 12.03.2025", { x: 50, y: 795, size: 9, font: f });
  rows.forEach((r, i) => r.forEach((c, j) => p.drawText(c, { x: 50 + j * 110, y: 770 - i * 16, size: 10, font: f })));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export async function textPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]);
  text.split("\n").forEach((l, i) => p.drawText(l, { x: 50, y: 800 - i * 16, size: 10, font: f }));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

/** PDF ohne Textlayer (nur Linie), wie ein Scan. */
export async function blankPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawLine({ start: { x: 10, y: 10 }, end: { x: 200, y: 200 } });
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
export const JPG_MIN = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
