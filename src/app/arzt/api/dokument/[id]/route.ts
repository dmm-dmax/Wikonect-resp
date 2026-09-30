import { cookies } from "next/headers";
import { COOKIE, resolveAuthSession } from "@/server/auth/session";
import { readDocumentFile } from "@/server/upload/service";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const doctorId = await resolveAuthSession("doctor", (await cookies()).get(COOKIE.doctor)?.value);
  if (!doctorId) return new Response("Nicht angemeldet", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const f = await readDocumentFile(id, doctorId);
  if (!f) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; frame-ancestors 'self'",
      "Cache-Control": "no-store",
    },
  });
}
