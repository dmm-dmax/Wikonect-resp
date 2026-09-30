/** Entfernt offensichtliche Identifikatoren, bevor Text gespeichert oder an die KI gesendet wird. Namen werden nicht erkannt. */
export function redactIdentifiers(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[E-Mail entfernt]")
    .replace(/https?:\/\/\S+/gi, "[Link entfernt]")
    .replace(/(\+|00)\d{1,3}[\s/-]?\(?\d+\)?[\d\s/-]{5,}/g, "[Nummer entfernt]")
    .replace(/\b0\d{2,5}[\s/-]?\d[\d\s/-]{4,}\b/g, "[Nummer entfernt]")
    .replace(/\b\d{9,}\b/g, "[Nummer entfernt]");
}
