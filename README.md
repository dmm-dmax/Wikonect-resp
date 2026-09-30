# Anamnese-Vorbereitung (MVP)

Patient beschreibt Beschwerden, die App strukturiert sie und übersetzt auf Symptomebene in Fachsprache. Der Arzt sieht vorab eine Stichpunkt-Zusammenfassung. **Keine Diagnose, keine Bewertung.** Siehe `CLAUDE.md` und `docs/`.

Nur synthetische Daten verwenden.

## Start (lokal)

```bash
docker compose up -d db          # PostgreSQL 16
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed                  # legt Demo-Arzt an, gibt TOTP-Secret aus (in Authenticator-App eintragen)
npm run dev                      # http://localhost:3000
```

Ablauf: Arzt (`/arzt/login`) erzeugt Einladungslink → Patient (`/patient/einladung/<token>`) willigt ein und startet den Dialog → Abgabe → Arzt öffnet die Zusammenfassung.

Test-Datenbank: `anamnese_test` mit demselben Nutzer anlegen (`createdb -O anamnese anamnese_test`).

## Befehle

| | |
|---|---|
| `npm test` | Unit- und Integrationstests (brauchen PostgreSQL) |
| `npm run lint` / `npm run typecheck` | Lint, Typprüfung |
| `npm run db:purge` | Löscht abgelaufene Sitzungen (Löschkonzept) |
| `SMOKE_BASE=http://localhost:3100 npx tsx --env-file=.env scripts/smoke.ts` | Browser-Durchlauf gegen laufenden Server |

## KI-Anbindung

Standard: `LLM_PROVIDER=mock` (regelbasiert, ohne Netzwerk). Echter Anbieter: `LLM_PROVIDER=openai-compatible` plus `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` und `LLM_EU_CONFIRMED=true`. Letzteres nur setzen, wenn EU-Verarbeitung und AVV vertraglich vorliegen.
