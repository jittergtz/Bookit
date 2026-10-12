import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/lib/database";
import {
  coverDesignSchema,
  getCoverDesign,
  librarySchema,
  newDesignElement,
  newPage,
  pageText,
  setPageLayout,
} from "../src/lib/model";
import { seedLibrary } from "../src/lib/seed";

test("custom cover layers, gradients, colors, and composed pages survive SQLite reopening", () => {
  const dir = mkdtempSync(join(tmpdir(), "bookit-studio-test-"));
  const path = join(dir, "library.sqlite");
  const db = openDatabase(path);
  try {
    const snapshot = db.read();
    const book = snapshot.library.books[0];
    book.coverColor = "#123abc";
    book.paperColor = "#fff1de";
    book.pageLayout = "canvas";
    book.coverDesign = {
      ...getCoverDesign(book),
      fill: "linear",
      gradientColor: "#fc85b4",
      gradientAngle: 75,
      pattern: "waves",
      elements: [
        newDesignElement({
          text: "My own year",
          x: 43,
          y: 28,
          fontSize: 48,
          font: "handwritten",
          italic: true,
          color: "#fefefe",
        }),
        newDesignElement({ kind: "sticker", text: "🦋", x: 66, y: 75, rotation: 15, width: 30 }),
        newDesignElement({ kind: "image", image: "data:image/png;base64,aGVsbG8=", width: 25 }),
      ],
    };
    const page = newPage(book);
    page.elements = [
      newDesignElement({
        text: "One sentence is enough.",
        x: 50,
        y: 50,
        align: "center",
        bold: true,
        font: "mono",
        color: "#934466",
      }),
    ];
    book.pages.push(page);
    const saved = db.write(snapshot.library, snapshot.revision);
    db.close();
    const reopened = openDatabase(path);
    try {
      assert.deepEqual(reopened.read(), saved);
      assert.equal(
        pageText(reopened.read().library.books[0].pages.at(-1)!),
        "One sentence is enough.",
      );
      assert.deepEqual(
        librarySchema.parse(JSON.parse(JSON.stringify(saved.library))),
        saved.library,
        "exported artwork remains restorable",
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("older books retain their content and get optional title layers without forced decoration", () => {
  const old = seedLibrary();
  const parsed = librarySchema.parse(old);
  assert.deepEqual(parsed, old);
  const design = getCoverDesign(parsed.books[0]);
  assert.deepEqual(
    design.elements.map((item) => item.source),
    ["title", "subtitle"],
  );
  assert.ok(design.elements.every((item) => item.kind === "text"));
  assert.equal(parsed.books[0].coverDesign, undefined);
  assert.ok(
    coverDesignSchema.safeParse({ ...design, elements: [] }).success,
    "blank covers are valid",
  );
});

test("layout changes preserve writing and refresh changed text without losing stickers", () => {
  const book = seedLibrary().books[0];
  let page = setPageLayout(book.pages[0], "canvas");
  assert.equal(pageText(page), book.pages[0].content);
  const sticker = newDesignElement({ kind: "sticker", text: "☀" });
  page.elements!.push(sticker);
  page = setPageLayout(page, "writing");
  assert.equal(page.content, book.pages[0].content);
  page.content = "A revised thought.";
  page = setPageLayout(page, "canvas");
  assert.equal(pageText(page), "A revised thought.");
  assert.ok(page.elements!.some((item) => item.id === sticker.id));
  const blank = newPage({ ...book, pageLayout: "canvas" });
  assert.equal(blank.layout, "canvas");
  assert.equal(blank.content, "");
  assert.deepEqual(blank.elements, []);
  const full = {
    ...blank,
    layout: "writing" as const,
    content: "Keep this writing safe.",
    elements: Array.from({ length: 30 }, () => newDesignElement({ kind: "sticker", text: "✦" })),
  };
  const original = structuredClone(full);
  assert.throws(() => setPageLayout(full, "canvas"), /too many layers/);
  assert.deepEqual(full, original, "a full canvas cannot silently discard writing or artwork");
});

test("invalid design data cannot enter the library", () => {
  const library = seedLibrary();
  library.books[0].coverColor = "url(javascript:bad)";
  assert.equal(librarySchema.safeParse(library).success, false);
  library.books[0].coverColor = "#abcdef";
  const design = getCoverDesign(library.books[0]);
  assert.equal(
    coverDesignSchema.safeParse({ ...design, elements: [newDesignElement({ x: 101 })] }).success,
    false,
  );
  const layer = newDesignElement();
  assert.equal(coverDesignSchema.safeParse({ ...design, elements: [layer, layer] }).success, false);
  assert.equal(
    coverDesignSchema.safeParse({
      ...design,
      elements: [newDesignElement({ kind: "image", image: "https://untrusted.example/image.svg" })],
    }).success,
    false,
  );
  assert.equal(
    coverDesignSchema.safeParse({
      ...design,
      elements: Array.from({ length: 31 }, () => newDesignElement()),
    }).success,
    false,
  );
});
