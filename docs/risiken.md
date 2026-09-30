# Offene Risiken vor einem Pilot

Stand: 2026-09-30. Bewertung: **K** = Pilot-Blocker, **H** = vor Pilot klären, **M** = im Pilot beobachten. Wahrscheinlichkeit und Schwere sind Einschätzungen, keine Messwerte.

## 1. Regulatorik

| # | Risiko | Stufe | Maßnahme |
|---|---|---|---|
| R1 | **MDR-Einstufung ungeklärt.** Nach Zweckbestimmung kann die Software Medizinprodukt sein (Regel 11, mind. Klasse IIa), sobald KI-Übersetzung und Zusammenfassung "Informationen für diagnostische Entscheidungen" liefern. Wettbewerber mit ähnlicher Funktion (Symptom-Checker) sind als IIa/IIb zertifiziert. | K | Schriftliche Qualifizierung nach MDCG 2019-11 durch regulatorische Beratung. Zweckbestimmung eng fassen. Bis zur Klärung kein Pilot mit echten Patienten. |
| R2 | **Notfall-Erkennung = faktische Dringlichkeitsbewertung.** Widerspricht dem Ziel "keine Triage". Kann Einstufung verschärfen. | K | In die R1-Prüfung einbeziehen. Alternative: nur statischer Dauerhinweis "Bei akuten Beschwerden 112", ohne Erkennung. Entscheidung durch Geschäftsführung nach Beratung. |
| R3 | **EU-KI-VO.** Hochrisiko-Einstufung, falls Medizinprodukt mit Benannter Stelle. Geltungstermine und mögliche Verschiebungen nicht verifiziert. | H | Rechtsprüfung. Art. 50 (KI-Kennzeichnung) ist im Patientendialog umgesetzt. |
| R4 | **Falsche Sicherheit durch Notfall-Regeln.** Liste ist ein Entwurf ohne ärztliche Freigabe. Tippfehler, Umschreibungen ("Brust zieht zu") werden nicht erkannt. Kein Fehlalarm-/Verpasst-Messwert vorhanden. | K | Medizinische Freigabe der Liste. Testkorpus mit realistischen Formulierungen (synthetisch). Dauerhinweis "App erkennt keine Notfälle" prominent. |

## 2. Haftung

| # | Risiko | Stufe | Maßnahme |
|---|---|---|---|
| H1 | Falsche oder unvollständige Wiedergabe (Übersetzungsfehler, verlorene Angabe) führt zu Fehlannahme des Arztes. | H | Originalzitat immer neben Fachbegriff (umgesetzt). Zitat muss wörtlich im Patiententext stehen (umgesetzt). Hinweis im Arzt-UI, dass Anamnese im Gespräch zu verifizieren ist. Haftpflichtdeckung klären. |
| H2 | Suggestive Folgefragen wirken als implizite Verdachtsäußerung. | H | Fester Fragenkatalog statt freier KI-Fragen (umgesetzt). Katalog ist ungeprüft → ärztliche Freigabe. |
| H3 | Laborwert-Zuordnung zu Beschwerdebereichen kann als Relevanzhinweis gelesen werden (z. B. Troponin → Thorax). | H | Nur Organsystem-Sortierung, Regel-ID sichtbar, Tabelle ärztlich freigeben. Werte ohne passende Beschwerde bleiben "ohne Zuordnung". |
| H4 | Fachbegriff in `Vorerkrankungen` darf Krankheitsnamen enthalten (Patient nennt sie). Ein Modell könnte eine Diagnose hinzufügen, die der Patient nicht genannt hat. | H | Bei echtem Modell: Prüfung, dass der Begriff im Patientenzitat vorkommt. Heute nur durch Mock abgedeckt. |
| H5 | Patientenzitate können Eigen-Diagnosen enthalten ("Herzinfarkt"). Sie erscheinen im Arzt-UI. | M | Kennzeichnung als Zitat (umgesetzt). Nicht in Folgefragen gespiegelt (umgesetzt, getestet). |

## 3. Datenschutz und Sicherheit

| # | Risiko | Stufe | Maßnahme |
|---|---|---|---|
| D1 | **Kein LLM-Anbieter gewählt.** Ohne EU-Verarbeitung, AVV, Zero-Retention kein Echtbetrieb. Aktivierung im Code nur mit `LLM_EU_CONFIRMED=true`. | K | Anbieter prüfen (Mistral EU, Azure EU-Region, Bedrock eu-central-1, Self-Hosting). Keine Aussage zur Eignung vor Vertragsprüfung. |
| D2 | DSFA (Art. 35) fehlt. | K | Erstellen vor Pilot. |
| D3 | Rollenklärung: Praxis = Verantwortlicher, wikonect = Auftragsverarbeiter. AVV-Vorlage, TOM-Anlage, Unterauftragsverarbeiter-Liste fehlen. | K | Juristische Vorlage. |
| D4 | § 393 SGB V / C5-Testat des Hosters für GKV-Daten nicht geprüft. § 203 StGB: Verpflichtung der Mitarbeiter. | H | Hoster mit C5 wählen, Verpflichtungserklärungen. |
| D5 | Schlüsselverwaltung: Master-Key kommt aus Umgebungsvariable. Kein KMS, keine Rotation. | H | KMS/HSM des Hosters, Rotationskonzept. Feldformat trägt Version (`v1`). |
| D6 | **Kein Virenscanner** beim Upload. Nur Magic-Bytes, Größe, Heuristik auf aktive PDF-Inhalte (erkennt keine komprimierten Objekte). | H | ClamAV oder Hoster-Scan vor Pilot. PDFs in Sandbox rendern. |
| D7 | Freitext kann Namen/Identifizierendes enthalten. Redaktion erkennt nur E-Mail, Telefon, Links, lange Zahlen. | M | Hinweis im UI. Optional Namenserkennung (NER, lokal). |
| D8 | Login: Rate-Limit nur per Kontosperre (5 Versuche). Kein IP-Limit, kein Passwort-Reset, keine E-Mail-Verifikation, kein Patienten-MFA. | H | Vor Pilot ergänzen. Arzt hat TOTP. |
| D9 | Notfall-Abbruch löscht Sitzungsinhalt sofort. Bei Fehlalarm verliert der Patient seine Angaben. | M | Bewusste Datenminimierung. Produktentscheidung prüfen. |
| D10 | Audit-Kette ist manipulationserkennend, aber nicht extern verankert. Ein DB-Admin kann die Kette neu berechnen. | M | Hash periodisch extern ablegen. |
| D11 | Löschfrist 30 Tage nach Termin ist eine Annahme. `purge`-Job muss geplant laufen (nicht eingerichtet). | H | Cron/Scheduler, Backup-Löschung im Konzept. Praxis archiviert im PVS (Export derzeit nur Druckansicht). |
| D12 | Interessenkonflikt: wikonect arbeitet für Pharmaunternehmen. Gesundheitsdaten dürfen nie dorthin fließen. | H | Organisatorische und technische Trennung, Vertragsklausel, kein Analytics auf Inhalten. |

## 4. Halluzinationen und Modellqualität

| # | Risiko | Stufe | Maßnahme |
|---|---|---|---|
| M1 | Output-Filter erkennt Muster, keine umschriebenen Bewertungen. Filtertests prüfen nur bekannte Formulierungen. | H | Red-Team-Korpus mit echtem Modell, Stichprobenprüfung durch Arzt, Filterliste pflegen. |
| M2 | Bisher nur Mock getestet. Verhalten realer Modelle (Halluzination, Format, Latenz, Kosten) unbekannt. | K | Eval-Suite mit synthetischen Fällen vor Pilot. |
| M3 | Zu viele Blocks → Nutzen sinkt (viele Einträge "ohne Übersetzung"). "akut", "möglich", "sollte" sind Blockwörter auch in legitimen Kontexten. | M | Blockrate im Pilot messen. |
| M4 | Laborparser: Layouts außerhalb einfacher Zeilen (mehrspaltig, Tabellen-Bilder, Scans) werden nicht erkannt. Kein OCR. Falsch-positive bei unbekannten Parametern möglich. | M | Originalzeile und PDF stets sichtbar (umgesetzt). Testkorpus echter Layouts (anonymisiert) im Pilot. |

## 5. Akzeptanz in Praxen

| # | Risiko | Stufe | Maßnahme |
|---|---|---|---|
| A1 | Keine PVS-Anbindung → Doppelarbeit. Nutzen nur bei Übernahme. | H | GDT/FHIR-Export priorisieren (siehe `naechste-schritte.md`). |
| A2 | Ärzte lesen lange Zusammenfassungen nicht. Nutzen unbelegt. | H | Zeitmessung im Pilot (Anamnesezeit vor/nach). Kein Wirksamkeitsnachweis vorhanden. |
| A3 | Patientengruppen (ältere, Sprachbarrieren, keine Smartphones) fallen aus. Nur Deutsch, nur Text. | M | Sprache (EU-STT), einfache Sprache, Fallback Papierbogen. |
| A4 | Fragenkatalog generisch. Fachrichtungen brauchen eigene Kataloge. | M | Pilot mit einer Fachrichtung. |

## 6. Technik

- Keine End-to-End-Tests in CI (nur Browser-Smoke-Skript `scripts/smoke.ts`).
- Kein Monitoring, kein Backup-/Restore-Test, kein Pen-Test.
- Datei-Speicher lokal (Dev). Produktiv EU-Objektspeicher nötig.
- Zugriffsrecht der Ärzte: nur eigene Sitzungen. Vertretung/Praxisteam nicht modelliert.
