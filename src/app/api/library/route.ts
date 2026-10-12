import { getDatabase, RevisionConflict } from "@/lib/database";
import { syncSchema } from "@/lib/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return Response.json(getDatabase().read(), { headers: noCache });
  } catch {
    return Response.json({ error: "Your library could not be opened." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    // Next.js may construct request.url with its 0.0.0.0 bind address. The
    // browser's origin must match the actual incoming Host header instead.
    try {
      const source = new URL(origin);
      const host = request.headers.get("host") || new URL(request.url).host;
      if (!["http:", "https:"].includes(source.protocol) || source.host !== host) {
        return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 5_000_000)
      return Response.json({ error: "Library exceeds the 5 MB library limit." }, { status: 413 });
    const result = syncSchema.safeParse(JSON.parse(raw));
    if (!result.success)
      return Response.json({ error: "The library contains invalid data." }, { status: 400 });
    return Response.json(getDatabase().write(result.data.library, result.data.revision), {
      headers: noCache,
    });
  } catch (error) {
    if (error instanceof RevisionConflict)
      return Response.json(
        { error: error.message, ...error.snapshot },
        { status: 409, headers: noCache },
      );
    if (error instanceof SyntaxError)
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    return Response.json({ error: "The local SQLite database is unavailable." }, { status: 500 });
  }
}
