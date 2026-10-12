import { z } from "zod";

export const coverColors = [
  "#68755a",
  "#b97760",
  "#5d7182",
  "#b49a68",
  "#75637c",
  "#383d36",
  "#a36d7b",
  "#5d8177",
] as const;
export const paperColors = ["#faf7ee", "#ffffff", "#eaf0e5", "#f4e7df", "#e8eef4"] as const;
export const paperPatterns = ["blank", "lined", "grid", "dotted"] as const;
export type PaperPattern = (typeof paperPatterns)[number];
export type FontStyle = "serif" | "sans";

const idSchema = z.string().min(1).max(100);
export const pageSchema = z.object({
  id: idSchema,
  title: z.string().max(160),
  content: z.string().max(100_000),
  paperColor: z.enum(paperColors),
  paperPattern: z.enum(paperPatterns),
  font: z.enum(["serif", "sans"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const bookSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().max(120),
  coverColor: z.enum(coverColors),
  coverStyle: z.enum(["classic", "minimal", "frame"]),
  font: z.enum(["serif", "sans"]),
  paperColor: z.enum(paperColors),
  paperPattern: z.enum(paperPatterns),
  collectionId: idSchema.nullable(),
  favorite: z.boolean(),
  pages: z.array(pageSchema).min(1).max(500),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const collectionSchema = z.object({ id: idSchema, name: z.string().trim().min(1).max(40) });
export const librarySchema = z
  .object({
    books: z.array(bookSchema).max(200),
    collections: z.array(collectionSchema).max(50),
  })
  .superRefine((library, ctx) => {
    const ids = new Set<string>();
    for (const entity of [
      ...library.books,
      ...library.collections,
      ...library.books.flatMap((book) => book.pages),
    ]) {
      if (ids.has(entity.id))
        ctx.addIssue({ code: "custom", message: "IDs must be unique across the library" });
      ids.add(entity.id);
    }
    const collections = new Set(library.collections.map((c) => c.id));
    for (const book of library.books) {
      if (book.collectionId && !collections.has(book.collectionId)) {
        ctx.addIssue({ code: "custom", message: "Book collection does not exist" });
      }
    }
  });
export const syncSchema = z.object({
  revision: z.number().int().nonnegative(),
  library: librarySchema,
});
export type Page = z.infer<typeof pageSchema>;
export type Book = z.infer<typeof bookSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Library = z.infer<typeof librarySchema>;
export type Snapshot = { revision: number; library: Library };

export function newId(): string {
  // getRandomValues also works on a phone visiting a local HTTP dev server.
  // randomUUID is restricted to secure contexts on some mobile browsers.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newPage(book: Pick<Book, "paperColor" | "paperPattern" | "font">): Page {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: "",
    content: "",
    paperColor: book.paperColor,
    paperPattern: book.paperPattern,
    font: book.font,
    createdAt: now,
    updatedAt: now,
  };
}

export function wordCount(content: string) {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

export function relativeDate(date: string) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en", { month: "short", day: "numeric" });
}
