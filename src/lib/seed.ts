import type { Book, Library, Page } from "./model";

export function seedLibrary(): Library {
  const now = new Date().toISOString();
  const page = (
    id: string,
    title: string,
    content: string,
    pattern: Page["paperPattern"] = "lined",
  ): Page => ({
    id,
    title,
    content,
    paperColor: "#faf7ee",
    paperPattern: pattern,
    font: "serif",
    createdAt: now,
    updatedAt: now,
  });
  const book = (
    id: string,
    title: string,
    subtitle: string,
    color: Book["coverColor"],
    collectionId: string,
    pages: Page[],
    coverStyle: Book["coverStyle"] = "classic",
  ): Book => ({
    id,
    title,
    subtitle,
    coverColor: color,
    collectionId,
    pages,
    coverStyle,
    font: "serif",
    paperColor: "#faf7ee",
    paperPattern: pages[0].paperPattern,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  });
  return {
    collections: [
      { id: "personal", name: "Personal" },
      { id: "reflections", name: "Reflections" },
      { id: "inspiration", name: "Inspiration" },
    ],
    books: [
      book(
        "year-2026",
        "2026",
        "A year of becoming",
        "#68755a",
        "reflections",
        [
          page(
            "year-1",
            "A place to begin",
            "This book is for the things I want to remember. The small discoveries. The difficult days. The moments that made me feel a little more like myself.\n\nI don’t need to have it all figured out. I just need to keep showing up.\n\nHere’s to a year of paying attention.",
          ),
          page(
            "year-2",
            "What I’m learning",
            "Some questions to come back to:\n\nWhat surprised me this week?\nWhat felt hard, and what helped?\nWhat am I quietly proud of?\nWhat would I like to carry into tomorrow?",
          ),
          page("year-3", "", ""),
        ],
        "frame",
      ),
      book("life-lessons", "Little\nlessons", "Things life is teaching me", "#b97760", "personal", [
        page(
          "lessons-1",
          "A little reminder",
          "Rest is part of the work.\n\nYou can change your mind.\n\nThe people who make you feel at home are worth making time for.\n\nSmall steps still move you forward.",
        ),
        page("lessons-2", "", ""),
      ]),
      {
        ...book(
          "quotes",
          "Words\nto keep",
          "A collection of good words",
          "#5d7182",
          "inspiration",
          [
            page(
              "quotes-1",
              "On beginning",
              "“How we spend our days is, of course, how we spend our lives.”\n— Annie Dillard\n\nA reminder to make room for the things that matter, even on ordinary days.",
              "blank",
            ),
            page("quotes-2", "Your next favorite quote", "", "blank"),
          ],
          "minimal",
        ),
        favorite: true,
      },
      book(
        "moments",
        "Places &\nmoments",
        "The lovely, ordinary things",
        "#b49a68",
        "personal",
        [
          page(
            "moments-1",
            "An ordinary kind of lovely",
            "The first sip of coffee on a slow morning.\nA long walk without a destination.\nA conversation that lasted longer than planned.\n\nSome things are too small for a photograph, but too good to forget.",
            "dotted",
          ),
        ],
        "frame",
      ),
    ],
  };
}
