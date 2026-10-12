import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, PUT } from "../src/app/api/library/route";
import { getDatabase } from "../src/lib/database";

const dir = mkdtempSync(join(tmpdir(), "bookit-api-test-"));
process.env.BOOKIT_DB_PATH = join(dir, "library.sqlite");
after(() => {
  getDatabase().close();
  rmSync(dir, { recursive: true, force: true });
});

test("same-origin browser writes work when Next.js binds to 0.0.0.0", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const snapshot = await response.json();
  snapshot.library.books[0].pages[0].content = "A browser draft, saved to SQLite.";
  const request = new Request("http://0.0.0.0:3007/api/library", {
    method: "PUT",
    headers: {
      origin: "http://localhost:3007",
      host: "localhost:3007",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(snapshot),
  });
  const saved = await PUT(request);
  assert.equal(saved.status, 200);
  const reloaded = await (await GET()).json();
  assert.equal(reloaded.library.books[0].pages[0].content, "A browser draft, saved to SQLite.");
  const stale = await PUT(
    new Request("http://localhost:3007/api/library", {
      method: "PUT",
      body: JSON.stringify(snapshot),
    }),
  );
  assert.equal(stale.status, 409);
});

test("API rejects cross-origin, malformed, and oversized writes", async () => {
  const foreign = await PUT(
    new Request("http://localhost:3007/api/library", {
      method: "PUT",
      headers: { origin: "https://another-site.example", host: "localhost:3007" },
      body: "{}",
    }),
  );
  assert.equal(foreign.status, 403);
  const malformed = await PUT(
    new Request("http://localhost:3007/api/library", { method: "PUT", body: "invalid json" }),
  );
  assert.equal(malformed.status, 400);
  const invalid = await PUT(
    new Request("http://localhost:3007/api/library", {
      method: "PUT",
      body: '{"revision":0,"library":{"books":[],"collections":[{"id":"x","name":""}]}}',
    }),
  );
  assert.equal(invalid.status, 400);
  const oversized = await PUT(
    new Request("http://localhost:3007/api/library", {
      method: "PUT",
      body: " ".repeat(5_000_001),
    }),
  );
  assert.equal(oversized.status, 413);
  const unicodeOversized = await PUT(
    new Request("http://localhost:3007/api/library", {
      method: "PUT",
      body: `"${"é".repeat(2_500_000)}"`,
    }),
  );
  assert.equal(unicodeOversized.status, 413);
});
