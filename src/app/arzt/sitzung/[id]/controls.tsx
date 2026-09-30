"use client";
import { useEffect } from "react";

const all = () => Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-section]"));

export function Controls() {
  // Beim Drucken alle Bereiche öffnen, danach Zustand wiederherstellen
  useEffect(() => {
    let prev: boolean[] = [];
    const before = () => { prev = all().map((d) => d.open); all().forEach((d) => (d.open = true)); };
    const after = () => all().forEach((d, i) => (d.open = prev[i] ?? true));
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  return (
    <div className="flex gap-2 print:hidden">
      <button className="btn-secondary" onClick={() => all().forEach((d) => (d.open = true))}>Alle aufklappen</button>
      <button className="btn-secondary" onClick={() => all().forEach((d) => (d.open = false))}>Alle einklappen</button>
      <button className="btn" onClick={() => window.print()}>Drucken</button>
    </div>
  );
}
