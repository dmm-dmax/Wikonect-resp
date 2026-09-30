export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_SESSION = 10;

export type FileKind = "PDF" | "IMAGE";
export type Validated = { ok: true; kind: FileKind; mime: "application/pdf" | "image/jpeg" | "image/png"; ext: string } | { ok: false; error: string };

const ALLOWED_DECLARED: Record<string, "application/pdf" | "image/jpeg" | "image/png"> = {
  "application/pdf": "application/pdf",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
};

/** Erkennung über Magic Bytes, nicht über Dateiname oder deklarierten Typ. */
export function sniff(buf: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

/** Aktive/eingebettete PDF-Inhalte. Heuristik auf Rohbytes; komprimierte Objekte sieht sie nicht (siehe docs/risiken.md). */
const PDF_DENY = ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/OpenAction", "/RichMedia", "/XFA", "/SubmitForm", "/ImportData"];

export function validateFile(buf: Buffer, declaredMime: string, size = buf.length): Validated {
  if (size === 0) return { ok: false, error: "Die Datei ist leer." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "Die Datei ist größer als 10 MB." };
  const declared = ALLOWED_DECLARED[declaredMime.toLowerCase()];
  if (!declared) return { ok: false, error: "Nur PDF, JPG und PNG sind erlaubt." };
  const real = sniff(buf);
  if (!real) return { ok: false, error: "Der Dateiinhalt ist weder PDF noch JPG oder PNG." };
  if (real !== declared) return { ok: false, error: "Dateityp und Inhalt passen nicht zusammen." };
  if (real === "application/pdf") {
    const raw = buf.toString("latin1");
    if (raw.includes("/Encrypt")) return { ok: false, error: "Geschützte PDFs werden nicht unterstützt." };
    for (const k of PDF_DENY) {
      // Name-Objekte enden an Trennzeichen; "/JS" darf nicht "/JSON" treffen
      if (new RegExp(`${k.replace("/", "\\/")}(?![A-Za-z0-9])`).test(raw)) return { ok: false, error: "Das PDF enthält aktive oder eingebettete Inhalte und wird abgelehnt." };
    }
    return { ok: true, kind: "PDF", mime: real, ext: "pdf" };
  }
  return { ok: true, kind: "IMAGE", mime: real, ext: real === "image/png" ? "png" : "jpg" };
}

/** Dateinamen: nur Anzeige (verschlüsselt gespeichert), nie als Pfad verwendet. */
export function cleanFilename(name: string): string {
  const base = name.replace(/[\\/]+/g, "_").replace(/[^\p{L}\p{N} ._()-]/gu, "").trim().slice(0, 100);
  return base || "befund";
}
