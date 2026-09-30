# Konzept – KI-gestützte Anamnese-Vorbereitung (MVP)

Stand: 2026-09-30 · Status: Entwurf zur Freigabe
Regulatorische Aussagen sind Arbeitsstand, keine Rechtsberatung. Vor Pilot juristisch und regulatorisch prüfen lassen (siehe `risiken.md`).

## 1. Stack-Begründung
Next.js mit TypeScript deckt Patienten-UI (mobile-first), Arzt-UI und Server-API in einem Projekt ab und hält den Betriebsaufwand klein. PostgreSQL liefert Transaktionen, Row-Level-Sicherheit und ist bei EU-Anbietern als Managed-Service verfügbar. Drizzle (reines JS, keine Binär-Engine) und Zod halten Schema und Validierung typsicher, Vitest und ESLint sind Standard und schnell.

## 2. Architektur

```
 Patient (Mobile Browser)            Arzt (Desktop Browser)
        │  /patient/*                        │  /arzt/*
        │  Cookie: pt_session                │  Cookie: dr_session (+TOTP)
        ▼                                    ▼
 ┌───────────────────────── Next.js (EU-Hosting) ─────────────────────────┐
 │ Auth-Realms getrennt │ Consent-Gate │ Audit-Middleware                 │
 │                                                                        │
 │ Dialog-Engine (Zustandsautomat, Code)                                  │
 │   ├─ Emergency-Detector (Regeln, /config/emergency.json)               │
 │   ├─ Question-Catalog   (/config/questions.json)                       │
 │   ├─ Slot-Extraktion ──► LlmProvider ──► outputFilter ──► DB           │
 │   └─ Zusammenfassung ──► LlmProvider ──► outputFilter ──► DB           │
 │                                                                        │
 │ Upload-Pipeline: Typ/Größe/Magic-Bytes → Malware-Scan → Verschlüsseln  │
 │   ├─ PDF: Textlayer-Extraktion → Labor-Parser (Regeln) → Mapping       │
 │   │       (/config/lab-mapping.json, deterministisch, kein LLM)        │
 │   └─ JPG/PNG: nur Anhang                                               │
 └──────────────┬───────────────────────────────┬─────────────────────────┘
                │                               │
         PostgreSQL (EU)                 Objektspeicher (EU, verschlüsselt)
                                        LLM: Mock | EU-Anbieter mit AVV
```

**Kernentscheidung: Code steuert, KI füllt.**
Der Dialog ist ein Zustandsautomat. Er wählt die nächste Frage aus einem kuratierten Katalog. Die KI macht nur:
1. Slot-Extraktion: Freitext → strukturierte Felder (Originalzitat + Fachbegriff).
2. Formulierung der Katalogfrage in einfacher Sprache.
3. Zusammenfassung aus bereits gespeicherten Einträgen.

Grund: Frei generierte Folgefragen können Ursachen andeuten ("Strahlt der Schmerz in den Arm aus?"). Ein Katalog ist prüfbar, die KI nicht. Nachteil: weniger flexibel. Akzeptiert für MVP.

### Output-Filter (Defense in Depth)
1. Strukturierte Ausgabe: JSON-Schema, nur definierte Felder (Zod). Kein freier Fließtext ohne Feldbindung.
2. Muster-Filter (`/config/filter-patterns.json`): Diagnose-, Ursachen-, Wahrscheinlichkeits-, Dringlichkeits-, Empfehlungssprache ("spricht für", "könnte sein", "Verdacht auf", "wahrscheinlich", "deutet auf", "hinweisend", "sollten Sie", "dringend"…).
3. Krankheitsnamen-Blockliste für das Feld `clinicalTerm` (Symptomebene erzwingen).
4. Bei Treffer: ein Retry mit verschärftem Prompt, dann Fallback (Patientenzitat ohne Übersetzung, Flag `translationBlocked`). Jeder Block wird auditiert (ohne Inhalt).

Grenze: Muster-Filter erkennen keine umschriebene Bewertung ("Die Kombination ist auffällig"). Der Filter ist ein Sicherheitsnetz, kein Nachweis. Ergänzend: Red-Team-Testkorpus und menschliche Stichproben (siehe `risiken.md`).
Patientenzitate können Eigen-Diagnosen enthalten ("ich glaube, ich habe …"). Sie bleiben als Zitat sichtbar und werden als solche gekennzeichnet. Die Fachübersetzung übernimmt sie nie.

### Notfall-Erkennung
Regelbasiert auf Patienteneingaben, vor jedem KI-Aufruf.
- Schlagwortliste + Kombinationsregeln (z. B. Brustschmerz UND Atemnot; Lähmung/Halbseitenschwäche; Suizidgedanken).
- Normalisierung (Kleinschreibung, Umlaute, Tippfehler-Varianten) und Negationserkennung ("keine Atemnot").
- Treffer → Sitzung `ABORTED_EMERGENCY`, Anzeige 112 / 116 117 / Telefonseelsorge. Kein Weiterführen, kein Arzt-Report zum Sitzungsinhalt außer Abbruchvermerk.
- Begründung gegen KI-Erkennung: deterministisch und testbar, kein Halluzinations- oder Drift-Risiko, unabhängig von Anbieter und Modellversion, vollständig auditierbar, Liste vom medizinischen Berater freigabefähig.
- Bewusste Asymmetrie: lieber Fehlalarm als Übersehen. Die App verspricht nie, Notfälle zu erkennen. Dauerhinweis: "Bei akuten Beschwerden: 112."
- **Regulatorischer Konflikt:** Notfallerkennung ist faktisch eine Dringlichkeitsbewertung. Siehe Abschnitt 6.

## 3. Datenmodell (PostgreSQL, vereinfacht)

| Tabelle | Zweck | Wichtige Felder |
|---|---|---|
| `practice` | Mandant (Verantwortlicher) | name, retention_days |
| `doctor` | Arzt-Account | practice_id, email, pw_hash, totp_secret_enc |
| `patient` | Patienten-Account | practice_id, email, pw_hash, pseudonym |
| `invitation` | Zuordnung Patient↔Termin | practice_id, doctor_id, token_hash, appointment_at, used_at |
| `consent` | Einwilligung | patient_id, version, purpose (`dialog`,`ai_processing`,`upload`), granted_at, revoked_at |
| `session` | Anamnese-Sitzung | patient_id, doctor_id, status (`OPEN`,`ABORTED_EMERGENCY`,`SUBMITTED`,`DELETED`), schema_version |
| `complaint` | Beschwerdebereich | session_id, region, label_patient, label_clinical |
| `message` | Dialogzug | session_id, role, content_enc, prompt_version, model |
| `entry` | Strukturierter Eintrag | complaint_id, field (Lokalisation…Allergien), patient_quote_enc, clinical_term_enc, source (`DIALOG`/`DOCUMENT`), source_ref, prompt_version, model, translation_blocked |
| `document` | Upload | session_id, kind (`PDF`,`IMAGE`), mime, size, sha256, storage_key, extraction_status |
| `lab_value` | Laborwert | document_id, complaint_id, name_as_printed, value, unit, ref_range_as_printed, page, mapping_rule_id |
| `summary` | Arztansicht-Snapshot | session_id, version, generated_at, prompt_version, model |
| `audit_log` | Append-only, Hash-Kette | ts, actor_type, actor_id, action, object_type, object_id, prev_hash, hash (kein Inhalt) |

Verschlüsselung: Felder `*_enc` per AES-256-GCM in der Anwendung (Envelope-Keys pro Mandant, Master-Key aus KMS/Env). Dateien verschlüsselt im Objektspeicher. Zusätzlich Volume-Verschlüsselung beim Hoster.
Löschkonzept: Standard 30 Tage nach Termin (`retention_days`, pro Praxis konfigurierbar), Löschjob inkl. Dateien, Audit-Log behält nur Metadaten. Sofortlöschung auf Patientenwunsch und bei Einwilligungswiderruf. Annahme: Dokumentationspflicht (§ 630f BGB) erfüllt die Praxis im eigenen PVS, nicht hier.
Laborwerte: übernommen werden Name, Wert, Einheit und der **im Dokument gedruckte** Referenzbereich. Die App berechnet keine Flags ("erhöht/erniedrigt").

## 4. MVP-Scope vs. Ausbaustufen

| Bereich | MVP | Ausbau |
|---|---|---|
| Eingabe | Freitext | Sprache (EU-STT mit AVV) |
| Dialog | Zustandsautomat, Katalog, Slot-Extraktion, Notfall-Abbruch | Weitere Fachrichtungen, Kataloge durch Fachgesellschaften geprüft |
| Befunde | PDF (Textlayer), Laborwert-Parser, Bilder als Anhang | OCR für Scans, weitere Dokumenttypen |
| Arzt | Zusammenfassung, Einklappen, Herkunftskennzeichnung, Druckansicht | PDF-Export, PVS-Anbindung (GDT/FHIR) |
| Auth | E-Mail+Passwort (Patient via Einladung), Arzt mit TOTP | SSO, TI-Identitäten |
| Mandanten | Modell vorhanden, eine Praxis im Pilot | Mehrere Praxen, Admin-UI |
| KI | Mock, Adapter-Interface, ein echter Adapter | Modellvergleich, Eval-Suite |
| Betrieb | Docker, CI (Lint, Typen, Tests) | Monitoring, Pen-Test, C5-Hoster |

## 5. Schritte
0. Plan (dieses Dokument) → Freigabe
1. Gerüst: Setup, Schema, Auth (2 Realms), Rollen, Einwilligung
2. Dialog: Zustandsautomat, Katalog, Mock-LLM, Notfall, Filter + Tests
3. Upload: Validierung, Extraktion, Mapping
4. Arztansicht: Zusammenfassung, Herkunft, Anhänge

## 6. Regulatorische Einordnung (Arbeitsstand)

### DSGVO Art. 9
- Gesundheitsdaten = besondere Kategorie. Rechtsgrundlage: ausdrückliche Einwilligung (Abs. 2 lit. a), getrennt nach Zweck (Dialog, KI-Verarbeitung, Upload), widerrufbar, versioniert, vor Dialogbeginn.
- Rollen: Praxis = Verantwortlicher, wikonect = Auftragsverarbeiter (Art. 28, AVV mit Praxis). LLM-Anbieter = Unterauftragsverarbeiter (AVV, EU-Verarbeitung, kein Training mit Daten).
- DSFA nach Art. 35 erforderlich (Gesundheitsdaten + neue Technologie). Vor Pilot.
- Zusätzlich: § 203 StGB (Schweigepflicht; Dienstleister als mitwirkende Personen verpflichten), § 393 SGB V (Cloud-Nutzung im GKV-Umfeld: C5-Testat des Anbieters nötig; Stand bitte verifizieren).
- Art. 22 nicht einschlägig, solange keine automatisierte Entscheidung entsteht. Das stützt die Produktgrenze.

### MDR (VO 2017/745)
- Kernfrage: Ist die Software ein Medizinprodukt? Maßgeblich ist die **Zweckbestimmung** des Herstellers (Art. 2 Nr. 1), nicht die Selbstbeschreibung.
- Argument dafür, dass keines vorliegt: reine Erfassung, Strukturierung, Übermittlung ohne Entscheidungsunterstützung (Leitlinie MDCG 2019-11 nennt Speicherung, Übermittlung, einfache Suche als Nicht-MDSW).
- Argument dagegen: KI übersetzt in Fachsprache, filtert, priorisiert Darstellung und erkennt Notfälle. Sobald Informationen "für diagnostische oder therapeutische Entscheidungen" geliefert werden, greift Regel 11 (mindestens Klasse IIa). Eine Behörde oder Benannte Stelle kann die Zusammenfassung so einordnen.
- **Einschätzung:** Die Grenze ist nicht gesichert. Der Status "kein Medizinprodukt" muss schriftlich begründet und mit einer regulatorischen Beratung bestätigt werden, bevor ein Pilot mit echten Patienten läuft. Die Zweckbestimmung wird eng formuliert ("Erfassung und Strukturierung von Patientenangaben zur Vorbereitung eines Arztgesprächs; keine Diagnose-, Therapie- oder Triageunterstützung").

### EU-KI-Verordnung (VO 2024/1689)
- Ist die Software Medizinprodukt mit Konformitätsbewertung durch Benannte Stelle, gilt sie als Hochrisiko-KI (Art. 6 Abs. 1). Andernfalls Transparenzpflichten (Art. 50: Nutzer wissen, dass sie mit KI interagieren) und KI-Kompetenz (Art. 4).
- Zeitplan für Hochrisiko-Pflichten: nach meinem Kenntnisstand ab August 2027 für Produkte nach Anhang I, Verschiebungen (Digital-Omnibus) in Diskussion. **Nicht verifiziert**, vor Pilot prüfen.
- Umgesetzt im MVP: KI-Kennzeichnung im Patientendialog, Protokollierung von Modell und Prompt-Version, menschliche Letztentscheidung.

### Haftungsabgrenzung
| | Dokumentation (Produkt) | Diagnose (nicht Produkt) |
|---|---|---|
| Inhalt | Gibt Patientenaussagen wieder, strukturiert, übersetzt auf Symptomebene | Bewertet, gewichtet, schlägt Ursachen/Maßnahmen vor |
| Verantwortung | wikonect: Richtigkeit der Wiedergabe, Sicherheit der Daten | Arzt: Bewertung, Anamnese-Verifikation im Gespräch, Behandlung |
| Risiko | Falsche oder unvollständige Wiedergabe, Übersetzungsfehler | – |
| Absicherung | Originalzitat immer sichtbar, Arzt prüft im Gespräch, Hinweis in UI und AGB, Betriebshaftpflicht/Produkthaftpflicht klären | – |

Die Zusammenfassung ersetzt nie die ärztliche Anamnese. Das steht im Arzt-UI und im Vertrag.

## 7. Datenschutzarchitektur: gewählte Lösung
- **Hosting:** EU-Anbieter mit C5-Testat (Kandidaten: STACKIT, IONOS, Open Telekom Cloud; Entscheidung offen).
- **KI-Anbindung:** MVP läuft mit Mock. Echter Adapter nur bei EU-Verarbeitung + AVV + Zero-Retention/kein Training. Kandidaten: Mistral (EU), Azure OpenAI (EU-Region, Datengrenze EU), AWS Bedrock (eu-central-1), Selbst-Hosting eines Open-Weights-Modells. **Keine Aussage, dass ein Anbieter die Bedingungen erfüllt, bevor Vertrag und Doku geprüft sind.**
- **Minimierung:** Prompts enthalten keine Namen, Geburtsdaten oder Kontaktdaten, nur Pseudonym-ID und Beschwerdetext. Freitext kann dennoch Identifizierendes enthalten → Hinweis an Patienten, Pseudonymisierungs-Filter für offensichtliche Muster (Telefon, E-Mail) vor KI-Aufruf.
- **Audit-Log:** append-only, Hash-Kette, ohne Gesundheitsinhalte.
- **Logs:** nur technische Metadaten. Test in CI, der Freitext-Leaks in Logs erkennt.

## 8. Tests (Pflicht)
- Notfall: Positivfälle, Negation, Schreibvarianten, Kombinationsregeln, Fehlalarm-Toleranz dokumentiert.
- Filter: Korpus verbotener Formulierungen (muss blocken) und erlaubter Formulierungen (darf nicht blocken), Adversarial-Fälle.
- Dialog: Zustandsübergänge, Fortschritt, Abbruch, "Was habe ich?"-Festantwort, Einwilligungs-Gate.
- Zusammenfassung: Jeder Eintrag hat Zitat, Term, Quelle. Keine Einträge ohne Quelle.
- Upload: Typ-/Größen-/Magic-Byte-Prüfung, Laborparser mit synthetischen PDFs, keine Bewertungsfelder.
- Datenschutz: Verschlüsselung round-trip, Löschjob, Audit-Kette intakt.

## 9. Ordnerstruktur
```
/CLAUDE.md
/docs/                 konzept, risiken, wettbewerb, monetarisierung, naechste-schritte
/prompts/<name>/v1.md  versionierte Prompts
/config/               questions.json, emergency.json, filter-patterns.json, lab-mapping.json
/src/server/db/schema.ts + /drizzle (Migrationen)
/src/app/patient|arzt  zwei UIs
/src/server/{auth,consent,dialog,emergency,filter,llm,upload,audit}
/tests/
```
