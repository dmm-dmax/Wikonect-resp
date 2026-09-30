# Wettbewerb und Abgrenzung

Quellen: Websuche am 2026-09-30, Herstellerangaben und Vergleichsseiten. **Nicht verifiziert:** Preise, Funktionsumfang und Zertifizierungsstatus im Detail. Vor Nutzung in Vertrieb oder Präsentation prüfen.

## Drei Kategorien

| Kategorie | Beispiele | Was sie tun | Regulatorisch |
|---|---|---|---|
| **Digitale Anamnese/Patientenaufnahme (Formulare)** | [Idana](https://medizinio.de/digitalisierung/digitale-anamnese), Nelly, Simpleprax, AnaBoard, Doctolib (Patientenaufnahme), Athena (Dampsoft) | Patient füllt feste, arztdefinierte Fragebögen aus, teils mit Unterschrift/Aufklärung, PVS-Anbindung | Formularlogik, meist keine KI. Preis laut Vergleichsseite ca. 49–999 € netto/Monat (Herstellerangaben, ungeprüft) |
| **Symptom-Checker / Triage** | Ada Health, Infermedica, Symptoma | Bewerten Symptome, nennen mögliche Ursachen, Dringlichkeit | Ada laut [Herstellermeldung](https://about.ada.com/press/221215-ada-health-receives-eu-mdr-certification/) MDR Klasse IIa. Infermedica laut [Blog](https://infermedica.com/blog/articles/infermedica-achieves-iso-13485-certification) und Berichten IIb (2025). |
| **Ambient Scribe / KI-Dokumentation im Gespräch** | verschiedene Anbieter (nicht recherchiert) | Schreiben das Arzt-Patient-Gespräch mit | Nicht Teil dieser Recherche |

## Positionierung dieses Produkts

```
        bewertet nicht ◄──────────────► bewertet (Diagnose/Triage)
 feste Fragen   Formular-Tools (Idana, Nelly …)        Symptom-Checker (Ada, Infermedica)
 freie Sprache  ► dieses Produkt                       
```

Lücke, die das Produkt adressieren will: Patient erzählt frei, Ergebnis ist geordnet und in Fachsprache, **ohne** Bewertung. Formular-Tools erzwingen das Arzt-Schema und verlieren Nuancen. Symptom-Checker bewerten, was hier ausdrücklich ausgeschlossen ist.

## Abgrenzung

| Merkmal | Formular-Tools | Symptom-Checker | Dieses Produkt |
|---|---|---|---|
| Eingabe | Auswahlfelder | Geführte Fragen | Freitext + Katalogfragen |
| Fachsprache | Nein | Intern | Ja, mit Originalzitat |
| Diagnose/Ursache/Dringlichkeit | Nein | Ja | Nein (technisch gefiltert) |
| Befunde | Upload als Anhang | Selten | Laborwerte übernommen, nicht bewertet |
| PVS-Anbindung | Ja (etabliert) | Teils | **Nein (MVP)** |
| Reife | Etabliert | Zertifiziert | Prototyp |

## Kritische Einschätzung

- **Schwächster Punkt: PVS-Anbindung.** Etablierte Tools haben sie. Ohne sie ist der Nutzen für Praxen fraglich.
- **Der Unterschied zu Formular-Tools ist ein Versprechen, kein Beleg.** Ob Freitext+KI in der Praxis mehr Nutzen bringt als ein guter Fragebogen, ist ungeprüft. Pilotfrage: Sparen Ärzte Zeit, verbessert sich die Anamnesequalität?
- **Formular-Anbieter können nachrüsten.** Ein KI-Freitext-Modul ist für sie ein Zusatzmodul. Hürde: Datenschutz, Regulatorik. Der Vorsprung ist klein.
- **Regulatorischer Vorteil ist unsicher.** "Bewertet nicht" kann den Status "kein Medizinprodukt" stützen, garantiert ihn aber nicht (siehe `risiken.md` R1).
- **Nicht recherchiert:** Ambient-Scribe-Anbieter, Kassenärztliche Angebote, Krankenhaus-Portale, internationale Anamnese-Tools.
