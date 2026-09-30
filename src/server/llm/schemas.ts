import { z } from "zod";

export const COMPLAINT_FIELDS = ["lokalisation", "beginn", "dauer", "qualitaet", "intensitaet", "verlauf", "ausloeser", "begleitsymptome"] as const;
export const GENERAL_FIELDS = ["vorerkrankungen", "medikation", "allergien"] as const;
export const REGIONS = ["kopf", "hals", "thorax", "abdomen", "ruecken", "extremitaeten", "haut", "psyche", "allgemein", "sonstige"] as const;

export type ComplaintField = (typeof COMPLAINT_FIELDS)[number];
export type GeneralField = (typeof GENERAL_FIELDS)[number];

const short = z.string().trim().min(1).max(400);

export const slotSchema = z.object({
  quote: short,
  term: z.string().trim().min(1).max(200).nullable(),
});

export const complaintsSchema = z.object({
  complaints: z
    .array(
      z.object({
        labelPatient: z.string().trim().min(1).max(120),
        labelClinical: z.string().trim().min(1).max(120).nullable(),
        region: z.enum(REGIONS),
        entries: z.array(z.object({ field: z.enum(COMPLAINT_FIELDS), quote: short, term: z.string().trim().min(1).max(200).nullable() })).max(16),
      }),
    )
    .max(8),
});

export type Slot = z.infer<typeof slotSchema>;
export type ComplaintsResult = z.infer<typeof complaintsSchema>;
