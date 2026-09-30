import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export type Prompt = { id: string; version: number; label: string; text: string };

const cache = new Map<string, Prompt>();
const root = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "prompts");

/** Lädt die höchste Version von /prompts/<id>/v<N>.md. Prompts stehen nie im Code. */
export function loadPrompt(id: string): Prompt {
  const hit = cache.get(id);
  if (hit) return hit;
  const dir = path.join(/*turbopackIgnore: true*/ root(), id);
  const versions = readdirSync(dir)
    .map((f) => /^v(\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => !!v)
    .map(Number)
    .sort((a, b) => b - a);
  const v = versions[0];
  if (v === undefined) throw new Error(`Kein Prompt für ${id}`);
  const raw = readFileSync(path.join(/*turbopackIgnore: true*/ dir, `v${v}.md`), "utf8");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`Prompt ${id}: Frontmatter fehlt`);
  const p: Prompt = { id, version: v, label: `${id}@v${v}`, text: m[2]!.trim() };
  cache.set(id, p);
  return p;
}
