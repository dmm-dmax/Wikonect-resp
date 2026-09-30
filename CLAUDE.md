# CLAUDE.md – Anamnese-Vorbereitung (MVP)

## Projektziel
Web-App, die Patienten vor dem Sprechstundentermin ihre Beschwerden strukturiert erfassen lässt.
Der Arzt erhält vorab eine Stichpunkt-Zusammenfassung in Fachsprache.
Betreiber: wikonect GmbH, Wiesbaden. Rolle im Datenschutz: Auftragsverarbeiter der Praxis (Art. 28 DSGVO).

## Produktgrenze (nicht verhandelbar)
Die App **dokumentiert und strukturiert**. Sie **bewertet nicht**.

| Erlaubt | Verboten |
|---|---|
| Angaben präzisieren | Diagnosen, Differentialdiagnosen |
| Laienworte in Fachterminologie überführen (Symptom-/Anatomieebene) | Ursachen, Wahrscheinlichkeiten |
| Nach Schema ordnen (Lokalisation, Beginn, Dauer, Qualität, Intensität, Verlauf, Auslöser, Begleitsymptome, Vorerkrankungen, Medikation, Allergien) | Dringlichkeits-/Triage-Bewertung |
| Befundwerte übernehmen und Beschwerdebereich zuordnen | Befundinterpretation ("erhöht, spricht für …") |
| Zusammenfassen | Therapie-/Untersuchungsempfehlungen |

Medizinwissen dient nur dazu, Folgefragen vollständig zu stellen, Laienangaben korrekt zu übersetzen und die Zusammenfassung zu gliedern. Nie für Schlussfolgerungen.
Fachübersetzung bleibt auf Symptomebene ("Dyspnoe", "thorakaler Druckschmerz"). Krankheitsnamen sind verboten, auch als Übersetzung.
Folgefragen sind neutral und kommen aus einem festen Katalog. Keine Suggestivfragen, die eine Ursache andeuten.

## Leitplanken
1. **Output-Filter** prüft jede KI-Ausgabe auf Diagnose-/Ursachen-/Wahrscheinlichkeits-/Dringlichkeits-/Empfehlungssprache und blockt. Tests sind Pflicht. Bei Block: ein Retry, dann Fallback auf Patientenzitat ohne Übersetzung plus Markierung.
2. **Prompts** verbieten jede Bewertung. "Was habe ich?" → feste Antwort: "Das klärt Ihr Arzt. Ich bereite Ihre Angaben dafür auf." (kein LLM-Aufruf).
3. **Notfall-Erkennung** regelbasiert (Schlagwortliste + Negationsregeln), nie per KI. Grund: deterministisch, testbar, auditierbar, keine Halluzination, keine Modellabhängigkeit. Treffer → Dialogabbruch, Anzeige 112 bzw. Hilfsangebote (116 117, Telefonseelsorge 0800 111 0 111).
4. **Keine echten Patientendaten** in Entwicklung, Tests, Logs, Fixtures. Nur synthetisch. Logs enthalten keine Freitexte und keine Gesundheitsdaten.
5. **Datenschutz by design:** Einwilligung (Art. 9 Abs. 2 lit. a) vor Dialogbeginn, TLS, Verschlüsselung at rest (Feldebene + Dateien), Löschkonzept, Audit-Log, EU-Hosting. KI-Aufrufe nur an Anbieter mit EU-Verarbeitung und AVV.
6. **Nachvollziehbarkeit:** Jeder Eintrag in der Arztansicht zeigt Originalaussage, Fachübersetzung, Quelle (Dialog/Befund), Prompt-Version und Modell.
7. **Human in the loop:** KI entscheidet nichts. Der Arzt bewertet.

## Stack
- TypeScript, Next.js (App Router), React, Tailwind
- PostgreSQL 16, Drizzle ORM (SQL-Migrationen in `/drizzle`)
- Vitest (Unit/Integration), Playwright (E2E, später), ESLint, `tsc --noEmit`
- Auth: eigene Session-Auth (argon2id, httpOnly-Cookies), zwei getrennte Realms (Patient / Arzt), Arzt mit TOTP
- KI: Interface `LlmProvider` mit `MockProvider` (Default) und echten Adaptern per `LLM_PROVIDER`-Env

## Konventionen
- Sprache: UI und Doku Deutsch, Code/Bezeichner Englisch.
- Strikte TS-Config, kein `any`. Validierung aller Ein-/Ausgaben mit Zod.
- Prompts: `/prompts/<name>/v<N>.md`, Frontmatter mit Version. Nie Prompt-Text im Code.
- Fragenkatalog, Notfall-Schlagwörter, Laborwert-Mapping, Filter-Muster: versionierte Dateien unter `/config`, nicht im Code verstreut.
- KI-Code nur hinter `src/server/llm/`. Jede KI-Ausgabe läuft durch `outputFilter` bevor sie gespeichert oder angezeigt wird.
- Secrets nur per Env. `.env.example` ohne echte Werte.
- Jeder Zugriff auf Gesundheitsdaten schreibt einen Audit-Eintrag (wer, was, wann, ohne Inhalt).
- Commits klein, Tests grün vor Commit: `npm run lint && npm run typecheck && npm test`.

## Befehle (nach Schritt 1 gültig)
`npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run db:migrate`

## Nicht-Ziele
Diagnose, Differentialdiagnose, Ursachenhinweise, Triage, Befundinterpretation, Therapieempfehlung, native Apps, PVS-Anbindung, Abrechnung, DiGA-Antrag, Bildanalyse, Mehrsprachigkeit.
