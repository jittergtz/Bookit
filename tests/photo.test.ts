import test from "node:test";
import assert from "node:assert/strict";
import { preparePhoto } from "../src/lib/photo";

test("mobile photo decoding needs no ImageBitmap and shrinks PNG encoder fallback", async (t) => {
  const widths: number[] = [];
  let revoked = 0;
  class Photo {
    naturalWidth = 4032;
    naturalHeight = 3024;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => widths.push(canvas.width) }),
    toDataURL: () => `data:image/png;base64,${"A".repeat(canvas.width > 384 ? 310_000 : 100_000)}`,
  };
  t.mock.method(URL, "createObjectURL", () => "blob:photo-test");
  t.mock.method(URL, "revokeObjectURL", () => {
    revoked++;
  });
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "Image", { value: Photo, configurable: true });
  Object.defineProperty(globalThis, "document", {
    value: { createElement: () => canvas },
    configurable: true,
  });
  try {
    const result = await preparePhoto(new File(["photo"], "camera.heic", { type: "image/heic" }));
    assert.match(result, /^data:image\/png;base64,/);
    assert.ok(result.length <= 300_000);
    assert.deepEqual(widths, [768, 512, 384]);
    assert.equal(canvas.height, 288);
    assert.equal(revoked, 1);
    Photo.prototype.naturalWidth = 0;
    Object.defineProperty(Photo.prototype, "src", {
      set() {
        queueMicrotask(() => this.onerror?.());
      },
    });
    await assert.rejects(preparePhoto(new File(["bad"], "bad.jpg")), /JPG or PNG copy/);
    assert.equal(revoked, 2, "failed decodes release their temporary URL too");
  } finally {
    if (previousImage) Object.defineProperty(globalThis, "Image", previousImage);
    else Reflect.deleteProperty(globalThis, "Image");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("invalid and oversized uploads are rejected before decoding", async () => {
  await assert.rejects(
    preparePhoto(new File(["text"], "notes.txt", { type: "text/plain" })),
    /Choose an image/,
  );
  await assert.rejects(
    preparePhoto(new File([new Uint8Array(40_000_001)], "large.jpg", { type: "image/jpeg" })),
    /40 MB/,
  );
});
