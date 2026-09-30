# Nächste drei Schritte nach dem MVP

Priorisiert nach: Was blockiert einen Pilot? Was entscheidet über Weiterbau oder Abbruch?

## 1. Regulatorik und Recht klären (Blocker, parallel zu allem)

Ohne diesen Schritt kein Pilot mit echten Patienten.

- Regulatorische Qualifizierung (MDR, MDCG 2019-11) inkl. Bewertung der Notfall-Erkennung. Ergebnis: schriftliche Zweckbestimmung.
- DSFA, AVV-Vorlage für Praxen, TOM, Unterauftragsverarbeiter.
- Hoster mit C5 wählen, LLM-Anbieter mit EU-Verarbeitung und AVV prüfen.
- Entscheidung: Notfall-Erkennung behalten oder durch statischen Hinweis ersetzen.
- Aufwand (Annahme): 4–8 Wochen Elapsed, überwiegend extern. Kosten ungeschätzt, Angebot einholen.
- **Abbruchkriterium:** Stuft die Beratung das Produkt als Klasse IIa oder höher ein und die Zertifizierung ist nicht finanzierbar → Produktzuschnitt ändern (z. B. nur Formular-/Dokumentenmodus ohne KI-Übersetzung) oder stoppen.

## 2. Echtes Modell anbinden und Qualität messen

- Adapter ist vorhanden (`openai-compatible`). Nach Anbieterwahl (Schritt 1) einschalten.
- Eval-Suite: 100+ synthetische Patiententexte mit Soll-Extraktion, Red-Team-Korpus für Diagnosesprache, Messung von Zitattreue, Blockrate, Latenz, Kosten je Sitzung.
- Ärztliche Freigabe von Fragenkatalog, Notfall-Liste, Laborzuordnung, Filterliste. Ein Arzt steht laut Auftraggeber zur Verfügung.
- Erfolgskriterium (Vorschlag, zu bestätigen): Zitattreue 100 % (Pflicht), keine Diagnosesprache im Korpus, Blockrate unter 10 %.
- Zusätzlich vor Pilot: Virenscan, Passwort-Reset/E-Mail-Verifikation, KMS, Löschjob planen (siehe `risiken.md`).

## 3. Pilot mit 1–3 Praxen einer Fachrichtung, inkl. Export

- Nutzen messen: Anamnesezeit im Termin vor/nach, Vollständigkeit, Akzeptanz (Ärzte und Patienten), Abbruchquote im Dialog.
- Schnittstelle: PDF-Export, danach GDT/FHIR zum PVS. Ohne Übernahme in die Akte kein dauerhafter Nutzen.
- Pilot-Design: Einwilligung, Patienteninformation, Schulung, Feedbackkanal, Abbruchregel bei Sicherheitsvorfall.
- Entscheidung am Ende: Weiterbau, Zuschnitt ändern oder Stopp, auf Basis der Messwerte.

## Zurückgestellt

Sprache (EU-STT), OCR für Scans, weitere Fachrichtungen, Mehrsprachigkeit, Multi-Mandanten-Administration. Erst nach Pilot-Ergebnis.
