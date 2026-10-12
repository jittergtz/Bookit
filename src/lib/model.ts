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
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hex color");
export const designFonts = ["serif", "sans", "mono", "handwritten"] as const;
export const designElementSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["text", "sticker", "image"]),
    source: z.enum(["title", "subtitle", "custom"]),
    text: z.string().max(100_000),
    image: z
      .string()
      .max(300_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(10).max(95),
    fontSize: z.number().min(10).max(96),
    font: z.enum(designFonts),
    color: colorSchema,
    bold: z.boolean(),
    italic: z.boolean(),
    underline: z.boolean(),
    align: z.enum(["left", "center", "right"]),
    rotation: z.number().min(-180).max(180),
  })
  .superRefine((element, ctx) => {
    if (element.kind === "image" && !element.image)
      ctx.addIssue({ code: "custom", message: "An image layer needs an image" });
  });
export const designElementsSchema = z
  .array(designElementSchema)
  .max(30)
  .superRefine((elements, ctx) => {
    if (new Set(elements.map((item) => item.id)).size !== elements.length)
      ctx.addIssue({ code: "custom", message: "Layer IDs must be unique on a canvas" });
  });
export const coverPatterns = ["none", "dots", "grid", "stripes", "checkers", "waves"] as const;
export const coverDesignSchema = z.object({
  fill: z.enum(["solid", "linear", "radial"]),
  gradientColor: colorSchema,
  gradientAngle: z.number().min(0).max(360),
  pattern: z.enum(coverPatterns),
  patternColor: colorSchema,
  patternOpacity: z.number().min(0).max(1),
  texture: z.boolean(),
  frame: z.enum(["none", "single", "double"]),
  elements: designElementsSchema,
});
export type DesignElement = z.infer<typeof designElementSchema>;
export type CoverDesign = z.infer<typeof coverDesignSchema>;

export const pageSchema = z.object({
  id: idSchema,
  title: z.string().max(160),
  content: z.string().max(100_000),
  paperColor: colorSchema,
  paperPattern: z.enum(paperPatterns),
  font: z.enum(["serif", "sans"]),
  layout: z.enum(["writing", "canvas"]).optional(),
  elements: designElementsSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const bookSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().max(120),
  coverColor: colorSchema,
  coverStyle: z.enum(["classic", "minimal", "frame"]),
  coverDesign: coverDesignSchema.optional(),
  font: z.enum(["serif", "sans"]),
  paperColor: colorSchema,
  paperPattern: z.enum(paperPatterns),
  pageLayout: z.enum(["writing", "canvas"]).optional(),
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

export function newPage(
  book: Pick<Book, "paperColor" | "paperPattern" | "font" | "pageLayout">,
): Page {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: "",
    content: "",
    paperColor: book.paperColor,
    paperPattern: book.paperPattern,
    font: book.font,
    layout: book.pageLayout ?? "writing",
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newDesignElement(patch: Partial<DesignElement> = {}): DesignElement {
  return {
    id: newId(),
    kind: "text",
    source: "custom",
    text: "",
    x: 50,
    y: 50,
    width: 80,
    fontSize: 24,
    font: "serif",
    color: "#171717",
    bold: false,
    italic: false,
    underline: false,
    align: "center",
    rotation: 0,
    ...patch,
  };
}

// Older books remain valid. Their title and subtitle become movable layers only
// when edited; no automatic rewrite of the SQLite library or device cache.
export function getCoverDesign(book: Book): CoverDesign {
  return (
    book.coverDesign ?? {
      fill: "solid",
      gradientColor: "#525252",
      gradientAngle: 135,
      pattern: "none",
      patternColor: "#ffffff",
      patternOpacity: 0.15,
      texture: true,
      frame: book.coverStyle === "frame" ? "single" : "none",
      elements: [
        {
          id: "cover-title",
          kind: "text",
          source: "title",
          text: "",
          x: 50,
          y: 43,
          width: 80,
          fontSize: 42,
          font: book.font,
          color: "#ffffff",
          bold: false,
          italic: false,
          underline: false,
          align: "center",
          rotation: 0,
        },
        ...(book.subtitle
          ? [
              {
                id: "cover-subtitle",
                kind: "text" as const,
                source: "subtitle" as const,
                text: "",
                x: 50,
                y: 65,
                width: 78,
                fontSize: 14,
                font: "sans" as const,
                color: "#ffffff",
                bold: false,
                italic: false,
                underline: false,
                align: "center" as const,
                rotation: 0,
              },
            ]
          : []),
      ],
    }
  );
}

export function pageText(page: Page): string {
  return page.layout === "canvas"
    ? (page.elements ?? [])
        .filter((item) => item.kind === "text" && item.source === "custom")
        .map((item) => item.text)
        .join("\n\n")
    : page.content;
}

export function setPageLayout(page: Page, layout: "writing" | "canvas"): Page {
  if ((page.layout ?? "writing") === layout) return page;
  if (layout === "writing") return { ...page, layout, content: pageText(page) };
  const existing = page.elements ?? [];
  // Reuse a composed layout unless its flowing text has since been rewritten.
  // Retain stickers and title layers when rebuilding the changed body text.
  const reuse = existing.length > 0 && pageText({ ...page, layout: "canvas" }) === page.content;
  const elements = reuse
    ? existing
    : [
        ...existing.filter((item) => item.kind !== "text" || item.source !== "custom"),
        ...(page.title && !existing.some((item) => item.source === "title")
          ? [newDesignElement({ source: "title", y: 18, font: page.font, fontSize: 26 })]
          : []),
        ...(page.content
          ? [
              newDesignElement({
                text: page.content,
                font: page.font,
                fontSize: 16,
                align: "left",
                width: 84,
              }),
            ]
          : []),
      ];
  if (elements.length > 30)
    throw new Error(
      "This page has too many layers. Remove an unused layer from the saved free layout before switching.",
    );
  return { ...page, layout, elements };
}

export function coverFill(color: string, design: CoverDesign): string | undefined {
  if (design.fill === "linear")
    return `linear-gradient(${design.gradientAngle}deg, ${color}, ${design.gradientColor})`;
  if (design.fill === "radial")
    return `radial-gradient(circle at 30% 25%, ${design.gradientColor}, ${color})`;
}

export function coverPattern(design: CoverDesign): {
  backgroundImage?: string;
  backgroundSize?: string;
} {
  const c = design.patternColor;
  switch (design.pattern) {
    case "dots":
      return {
        backgroundImage: `radial-gradient(${c} .5cqw, transparent .5cqw)`,
        backgroundSize: "6cqw 6cqw",
      };
    case "grid":
      return {
        backgroundImage: `linear-gradient(${c} .33cqw, transparent .33cqw), linear-gradient(90deg, ${c} .33cqw, transparent .33cqw)`,
        backgroundSize: "8cqw 8cqw",
      };
    case "stripes":
      return {
        backgroundImage: `repeating-linear-gradient(135deg, ${c} 0 .66cqw, transparent .66cqw 4.66cqw)`,
      };
    case "checkers":
      return {
        backgroundImage: `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`,
        backgroundSize: "10.66cqw 10.66cqw",
      };
    case "waves":
      return {
        backgroundImage: `radial-gradient(ellipse at 50% 100%, transparent 58%, ${c} 59% 63%, transparent 64%)`,
        backgroundSize: "12cqw 6.66cqw",
      };
    default:
      return {};
  }
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
