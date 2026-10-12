import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("PWA precaches the initial scripts and fonts and serves its shell offline", async () => {
  const origin = "https://bookit.example";
  const handlers = new Map<
    string,
    (event: {
      waitUntil: (promise: Promise<unknown>) => void;
      request?: { method: string; url: string; mode: string };
      respondWith?: (promise: Promise<Response>) => void;
    }) => void
  >();
  const stores = new Map<string, Map<string, Response>>();
  stores.set("another-app-cache", new Map());
  stores.set("bookit-shell-old", new Map());
  let offline = false;
  const key = (value: string | { url: string }) =>
    new URL(typeof value === "string" ? value : value.url, origin).href;
  const network = async (request: string | { url: string }) => {
    if (offline) throw new Error("offline");
    const url = new URL(key(request));
    if (url.pathname === "/")
      return new Response(
        '<html><link href="/_next/static/chunks/app.css" rel="stylesheet"><script src="/_next/static/chunks/app.js"></script><body>Bookit shell</body></html>',
      );
    if (url.pathname.endsWith("app.css"))
      return new Response(
        "@font-face{src:url(../media/lora.woff2)} .grain{background:url(\"data:image/svg+xml,%3Csvg filter='url(%23n)'/%3E\")}",
      );
    return new Response(`asset: ${url.pathname}`);
  };
  const cacheStorage = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name)!;
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) cache.set(key(url), await network(url));
        },
        put: async (url: string | { url: string }, response: Response) => {
          cache.set(key(url), response.clone());
        },
        match: async (url: string | { url: string }) => cache.get(key(url))?.clone(),
      };
    },
    match: async (request: string | { url: string }) => {
      for (const cache of stores.values()) {
        const found = cache.get(key(request));
        if (found) return found.clone();
      }
    },
  };
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: {
      location: { origin },
      addEventListener: (
        event: string,
        handler: typeof handlers extends Map<string, infer H> ? H : never,
      ) => handlers.set(event, handler),
      skipWaiting() {},
      clients: { claim: async () => undefined },
    },
    caches: cacheStorage,
    fetch: network,
    URL,
  });
  const pending: Promise<unknown>[] = [];
  handlers.get("install")!({ waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  assert.ok(await cacheStorage.match("/_next/static/chunks/app.js"));
  assert.ok(await cacheStorage.match("/_next/static/media/lora.woff2"));
  assert.equal(
    await cacheStorage.match("/_next/static/chunks/%23n"),
    undefined,
    "SVG texture filter references are not font assets",
  );
  pending.length = 0;
  handlers.get("activate")!({ waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(stores.has("bookit-shell-old"), false);
  assert.equal(stores.has("another-app-cache"), true);
  offline = true;
  let response: Promise<Response> | undefined;
  handlers.get("fetch")!({
    request: { method: "GET", url: `${origin}/`, mode: "navigate" },
    waitUntil: (promise) => pending.push(promise),
    respondWith: (promise) => {
      response = promise;
    },
  });
  assert.ok((await (await response)!.text()).includes("Bookit shell"));
  response = undefined;
  handlers.get("fetch")!({
    request: { method: "GET", url: `${origin}/api/library`, mode: "cors" },
    waitUntil: (promise) => pending.push(promise),
    respondWith: (promise) => {
      response = promise;
    },
  });
  assert.equal(response, undefined, "SQLite API responses must never enter the shell cache");
});
