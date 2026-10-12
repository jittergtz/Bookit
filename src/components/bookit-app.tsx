"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Folder,
  Heart,
  LibraryBig,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sun,
  Moon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  librarySchema,
  newId,
  pageText,
  relativeDate,
  wordCount,
  type Book,
  type Collection,
} from "@/lib/model";
import { downloadLibrary, useLibrary } from "@/lib/use-library";
import { BookForm } from "./book-form";
import { BookReader } from "./book-reader";
import { BookCover, EmptyState, Sheet } from "./ui";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type Tab = "library" | "collections" | "favorites";

export function BookitApp() {
  const { library, ready, error, conflict, update, resolveConflict, clearError } = useLibrary();
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<Book | "new" | null>(null);
  const [panel, setPanel] = useState<"settings" | "collection" | "install" | "import" | null>(null);
  const [collectionDraft, setCollectionDraft] = useState<Collection | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof librarySchema.parse> | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("bookit-theme-v1");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", nextTheme === "dark" ? "#101010" : "#ffffff");
    const readHash = () =>
      setOpenedId(new URLSearchParams(window.location.hash.slice(1)).get("book"));
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const installed = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      setNotice("Bookit is now on your home screen.");
    };
    queueMicrotask(() => {
      setTheme(nextTheme);
      readHash();
      setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    });
    window.addEventListener("hashchange", readHash);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
    return () => {
      window.removeEventListener("hashchange", readHash);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const changeTheme = (nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("bookit-theme-v1", nextTheme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", nextTheme === "dark" ? "#101010" : "#ffffff");
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  const openBook = (book: Book) => {
    setOpenedId(book.id);
    window.location.hash = `book=${encodeURIComponent(book.id)}`;
    window.scrollTo(0, 0);
  };
  const closeBook = () => {
    setOpenedId(null);
    history.replaceState(null, "", window.location.pathname);
    window.scrollTo(0, 0);
  };
  const saveBook = (book: Book, newCollection?: Collection) => {
    if (!library.books.some((item) => item.id === book.id) && library.books.length >= 200) {
      setNotice("Your library has reached its 200-book limit. Export or remove a book first.");
      return;
    }
    if (newCollection && library.collections.length >= 50) {
      setNotice("Your library has reached its 50-collection limit. Choose an existing collection.");
      return;
    }
    update((previous) => ({
      collections: newCollection ? [...previous.collections, newCollection] : previous.collections,
      books: previous.books.some((item) => item.id === book.id)
        ? previous.books.map((item) => (item.id === book.id ? book : item))
        : [...previous.books, book],
    }));
    setEditingBook(null);
    if (editingBook === "new") {
      setNotice("A new chapter, just for you.");
      openBook(book);
    }
  };
  const openedBook = library.books.find((book) => book.id === openedId);
  const pageTitle =
    tab === "collections"
      ? "Collections"
      : tab === "favorites"
        ? "Favorites"
        : filter !== "all"
          ? library.collections.find((collection) => collection.id === filter)?.name || "Home"
          : "Home";
  const totalPages = library.books.reduce((sum, book) => sum + book.pages.length, 0);
  const totalWords = library.books.reduce(
    (sum, book) => sum + book.pages.reduce((count, page) => count + wordCount(pageText(page)), 0),
    0,
  );
  const latestBook = [...library.books].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const visibleBooks = library.books.filter((book) => {
    if (tab === "favorites" && !book.favorite) return false;
    if (filter !== "all" && book.collectionId !== filter) return false;
    const search = query.trim().toLowerCase();
    return (
      !search ||
      [
        book.title,
        book.subtitle,
        ...book.pages.flatMap((page) => [page.title, pageText(page)]),
      ].some((text) => text.toLowerCase().includes(search))
    );
  });
  const createCollection = (event: React.FormEvent) => {
    event.preventDefault();
    const name = collectionName.trim();
    if (!name) return;
    if (!collectionDraft && library.collections.length >= 50) {
      setNotice("Your library has reached its 50-collection limit.");
      return;
    }
    if (
      library.collections.some(
        (item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== collectionDraft?.id,
      )
    ) {
      setNotice("You already have a collection with that name.");
      return;
    }
    const collection = { id: collectionDraft?.id || newId(), name };
    update((previous) => ({
      ...previous,
      collections: collectionDraft
        ? previous.collections.map((item) => (item.id === collection.id ? collection : item))
        : [...previous.collections, collection],
    }));
    setPanel(null);
    setNotice(collectionDraft ? "Collection updated." : "A new home for your books.");
  };
  const editCollection = (collection?: Collection) => {
    setCollectionDraft(collection || null);
    setCollectionName(collection?.name || "");
    setPanel("collection");
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Backup exceeds the 5 MB library limit.");
      const parsed = JSON.parse(await file.text());
      setPendingImport(librarySchema.parse(parsed.library ?? parsed));
      setPanel("import");
    } catch {
      setNotice("This file isn’t a valid Bookit backup. Choose an exported .json file under 5 MB.");
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="app-frame">
      <div className="mobile-app">
        {!ready ? (
          <div className="loading-screen">
            <BookOpen size={34} strokeWidth={1.4} />
            <span className="wordmark">
              bookit<span>.</span>
            </span>
            <p>Opening your library…</p>
          </div>
        ) : openedBook ? (
          <BookReader
            key={openedBook.id}
            book={openedBook}
            onChange={(book) =>
              update((previous) => ({
                ...previous,
                books: previous.books.map((item) => (item.id === book.id ? book : item)),
              }))
            }
            onClose={closeBook}
            onCustomize={() => setEditingBook(openedBook)}
            onDelete={() => {
              update((previous) => ({
                ...previous,
                books: previous.books.filter((item) => item.id !== openedBook.id),
              }));
              closeBook();
              setNotice("Book removed from your library.");
            }}
          />
        ) : (
          <>
            <header className="app-header">
              <h1 className="page-heading">{pageTitle}</h1>
              <div className="header-actions">
                <button
                  className="icon-button"
                  onClick={() => setPanel("settings")}
                  aria-label="Library settings"
                >
                  <Settings2 size={20} strokeWidth={1.6} />
                </button>
              </div>
            </header>
            <main className="library-main">
              <div className="library-stats">
                <span>
                  <strong>{library.books.length}</strong> books
                </span>
                <span className="stat-divider" />
                <span>
                  <strong>{totalPages}</strong> pages
                </span>
              </div>
              {tab === "library" && !query && filter === "all" && latestBook && (
                <section className="continue-section">
                  <div className="section-heading">
                    <h2>Continue writing</h2>
                  </div>
                  <button className="continue-card" onClick={() => openBook(latestBook)}>
                    <div className="continue-cover">
                      <BookCover book={latestBook} size="small" />
                    </div>
                    <div className="continue-copy">
                      <h3>{latestBook.title.replace(/\n/g, " ")}</h3>
                      <p>{latestBook.subtitle || "Your story is still unfolding."}</p>
                      <span className="continue-cta">
                        Keep writing
                        <ArrowRight size={15} />
                      </span>
                    </div>
                  </button>
                </section>
              )}
              {tab === "collections" ? (
                <section className="collections-section">
                  <div className="section-heading">
                    <h2>
                      Your collections <span>{library.collections.length}</span>
                    </h2>
                    <button className="text-button" onClick={() => editCollection()}>
                      <Plus size={16} />
                      New
                    </button>
                  </div>
                  <div className="collections-list">
                    {library.collections.map((collection) => {
                      const books = library.books.filter(
                        (book) => book.collectionId === collection.id,
                      );
                      return (
                        <div className="collection-card" key={collection.id}>
                          <button
                            className="collection-main"
                            onClick={() => {
                              setTab("library");
                              setFilter(collection.id);
                            }}
                          >
                            <span className="collection-icon">
                              <Folder size={23} strokeWidth={1.3} />
                            </span>
                            <div>
                              <h3>{collection.name}</h3>
                              <span>
                                {books.length} {books.length === 1 ? "book" : "books"} ·{" "}
                                {books.reduce((sum, book) => sum + book.pages.length, 0)} pages
                              </span>
                            </div>
                            <ChevronRight size={18} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${collection.name} collection`}
                            onClick={() => editCollection(collection)}
                          >
                            <MoreHorizontal size={19} />
                          </button>
                        </div>
                      );
                    })}
                    {!library.collections.length && (
                      <EmptyState
                        icon={<Folder size={30} />}
                        title="A place to belong"
                        description="Bring related books together in a collection."
                        action={
                          <button className="primary-button" onClick={() => editCollection()}>
                            <Plus size={17} />
                            Create a collection
                          </button>
                        }
                      />
                    )}
                  </div>
                </section>
              ) : (
                <section className="books-section">
                  <div className="section-heading">
                    <h2>
                      {tab === "favorites" ? "Favorite books" : "Your bookshelf"}
                      <span>{visibleBooks.length}</span>
                    </h2>
                    <button
                      className={`icon-button search-toggle ${searching ? "active" : ""}`}
                      onClick={() => {
                        setSearching(!searching);
                        if (searching) setQuery("");
                        else setTimeout(() => searchInput.current?.focus(), 50);
                      }}
                      aria-label={searching ? "Close search" : "Search books"}
                    >
                      {searching ? <X size={18} /> : <Search size={19} strokeWidth={1.6} />}
                    </button>
                  </div>
                  {searching && (
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        ref={searchInput}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search books and the words inside…"
                        aria-label="Search library"
                      />
                    </div>
                  )}
                  <div className="filter-scroll" aria-label="Filter by collection">
                    <button
                      className={filter === "all" ? "active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      All books
                    </button>
                    {library.collections.map((collection) => (
                      <button
                        className={filter === collection.id ? "active" : ""}
                        key={collection.id}
                        onClick={() => setFilter(collection.id)}
                      >
                        {collection.name}
                      </button>
                    ))}
                  </div>
                  <div className="books-grid">
                    {visibleBooks.map((book) => (
                      <div className="book-card" key={book.id}>
                        <button
                          className="book-open"
                          onClick={() => openBook(book)}
                          aria-label={`Open ${book.title.replace(/\n/g, " ")}`}
                        >
                          <BookCover book={book} />
                          <h3>{book.title.replace(/\n/g, " ")}</h3>
                        </button>
                        <div className="book-caption">
                          <span>
                            {book.pages.length} {book.pages.length === 1 ? "page" : "pages"}
                            <span className="caption-dot">·</span>
                            {relativeDate(book.updatedAt)}
                          </span>
                          <button
                            className={`favorite-button ${book.favorite ? "is-favorite" : ""}`}
                            aria-label={`${book.favorite ? "Unfavorite" : "Favorite"} ${book.title.replace(/\n/g, " ")}`}
                            aria-pressed={book.favorite}
                            onClick={() =>
                              update((previous) => ({
                                ...previous,
                                books: previous.books.map((item) =>
                                  item.id === book.id
                                    ? { ...item, favorite: !item.favorite }
                                    : item,
                                ),
                              }))
                            }
                          >
                            <Heart
                              size={15}
                              strokeWidth={1.5}
                              fill={book.favorite ? "currentColor" : "none"}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!visibleBooks.length && (
                    <EmptyState
                      icon={
                        tab === "favorites" ? (
                          <Heart size={28} />
                        ) : query ? (
                          <Search size={28} />
                        ) : (
                          <BookOpen size={28} />
                        )
                      }
                      title={
                        query
                          ? "No matching chapters"
                          : tab === "favorites"
                            ? "Keep your favorites close"
                            : "Your next chapter starts here"
                      }
                      description={
                        query
                          ? "Try a different word, title, or collection."
                          : tab === "favorites"
                            ? "Tap the heart on a book to keep it here."
                            : "Create a book and give your thoughts a home."
                      }
                    />
                  )}
                  <button className="new-book-card" onClick={() => setEditingBook("new")}>
                    <span className="new-book-icon">
                      <Plus size={22} strokeWidth={1.5} />
                    </span>
                    <div>
                      <strong>Create a new book</strong>
                      <span>Add to your library</span>
                    </div>
                    <ArrowRight size={19} strokeWidth={1.3} />
                  </button>
                </section>
              )}
            </main>
            <nav className="bottom-nav" aria-label="Main navigation">
              <div
                className="bottom-tabs"
                style={
                  {
                    "--active-tab": tab === "library" ? 0 : tab === "collections" ? 1 : 2,
                  } as CSSProperties
                }
              >
                <span className="nav-selection" aria-hidden="true" />
                <button
                  className={tab === "library" ? "active" : ""}
                  aria-current={tab === "library" ? "page" : undefined}
                  onClick={() => {
                    setTab("library");
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  <LibraryBig size={21} strokeWidth={1.6} />
                  <span>Home</span>
                </button>
                <button
                  className={tab === "collections" ? "active" : ""}
                  aria-current={tab === "collections" ? "page" : undefined}
                  onClick={() => {
                    setTab("collections");
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  <Folder size={21} strokeWidth={1.6} />
                  <span>Collections</span>
                </button>
                <button
                  className={tab === "favorites" ? "active" : ""}
                  aria-current={tab === "favorites" ? "page" : undefined}
                  onClick={() => {
                    setTab("favorites");
                    setFilter("all");
                    setQuery("");
                  }}
                >
                  <Heart size={21} strokeWidth={1.6} />
                  <span>Favorites</span>
                </button>
              </div>
              <button
                className="nav-create"
                onClick={() => setEditingBook("new")}
                aria-label="Create a new book"
              >
                <Plus size={23} />
              </button>
            </nav>
          </>
        )}
        {editingBook && (
          <BookForm
            key={editingBook === "new" ? "new" : editingBook.id}
            book={editingBook === "new" ? undefined : editingBook}
            collections={library.collections}
            onSave={saveBook}
            onClose={() => setEditingBook(null)}
          />
        )}
        {panel === "settings" && (
          <Sheet
            title="Your little world"
            eyebrow="LIBRARY SETTINGS"
            onClose={() => setPanel(null)}
          >
            <div className="settings-summary">
              <BookOpen size={28} strokeWidth={1.3} />
              <div>
                <strong>
                  {library.books.length} books. {totalWords.toLocaleString()} words.
                </strong>
                <p>All the little things that make you, you.</p>
              </div>
            </div>
            <fieldset className="appearance-setting">
              <legend>Appearance</legend>
              <div className="appearance-options">
                <button
                  type="button"
                  className={`appearance-option${theme === "light" ? " selected" : ""}`}
                  aria-label="Light mode"
                  aria-pressed={theme === "light"}
                  onClick={() => changeTheme("light")}
                >
                  <Sun size={17} strokeWidth={1.7} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={`appearance-option${theme === "dark" ? " selected" : ""}`}
                  aria-label="Dark mode"
                  aria-pressed={theme === "dark"}
                  onClick={() => changeTheme("dark")}
                >
                  <Moon size={17} strokeWidth={1.7} />
                  <span>Dark</span>
                </button>
              </div>
            </fieldset>
            <div className="menu-list">
              {!isStandalone && (
                <button onClick={() => setPanel("install")}>
                  <ArrowDownToLine size={19} />
                  <span>Add Bookit to your home screen</span>
                  <ChevronRight size={16} />
                </button>
              )}
              <button
                onClick={() => {
                  downloadLibrary(library);
                  setNotice("Your library backup is ready.");
                }}
              >
                <ArrowDownToLine size={19} />
                <span>Export a library backup</span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => fileInput.current?.click()}>
                <Upload size={19} />
                <span>Restore a library backup</span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => editCollection()}>
                <Folder size={19} />
                <span>Create a collection</span>
                <ChevronRight size={16} />
              </button>
            </div>
            <p className="settings-footer">
              Bookit · A home for your thoughts.
              <br />
              <span>Made to be personal. Made to be yours.</span>
            </p>
          </Sheet>
        )}
        {panel === "collection" && (
          <Sheet
            title={collectionDraft ? "A home for these books" : "Bring your books together"}
            eyebrow={collectionDraft ? "EDIT COLLECTION" : "NEW COLLECTION"}
            onClose={() => setPanel(null)}
          >
            <form onSubmit={createCollection} className="sheet-content">
              <label className="field-label">
                Collection name
                <input
                  value={collectionName}
                  onChange={(event) => setCollectionName(event.target.value)}
                  maxLength={40}
                  placeholder="e.g. Reflections, 2026, Inspiration"
                  required
                />
              </label>
              <p className="small-note">
                Choose this collection when creating or customizing a book.
              </p>
              {collectionDraft && (
                <button
                  type="button"
                  className="danger-link"
                  onClick={() => {
                    update((previous) => ({
                      collections: previous.collections.filter(
                        (item) => item.id !== collectionDraft.id,
                      ),
                      books: previous.books.map((book) =>
                        book.collectionId === collectionDraft.id
                          ? { ...book, collectionId: null }
                          : book,
                      ),
                    }));
                    setFilter("all");
                    setPanel(null);
                    setNotice("Collection removed. Your books are still in your library.");
                  }}
                >
                  <Trash2 size={16} />
                  Remove collection (keep books)
                </button>
              )}
              <div className="sheet-footer">
                <button className="primary-button" type="submit">
                  <Check size={17} />
                  {collectionDraft ? "Save collection" : "Create collection"}
                </button>
              </div>
            </form>
          </Sheet>
        )}
        {panel === "install" && (
          <Sheet
            title="Always close at hand"
            eyebrow="TAKE BOOKIT WITH YOU"
            onClose={() => setPanel(null)}
          >
            <div className="sheet-content">
              <div className="install-illustration">
                <BookOpen size={42} strokeWidth={1.2} />
              </div>
              <p className="body-copy">
                A little space for your thoughts, right on your home screen.
              </p>
              {installPrompt ? (
                <button
                  className="primary-button"
                  onClick={async () => {
                    await installPrompt.prompt();
                    const result = await installPrompt.userChoice;
                    setInstallPrompt(null);
                    if (result.outcome === "accepted") setPanel(null);
                  }}
                >
                  <Plus size={18} />
                  Install Bookit
                </button>
              ) : (
                <div className="install-instructions">
                  <p>
                    <strong>On iPhone or iPad</strong>
                    <br />
                    Open in Safari → Share → Add to Home Screen.
                  </p>
                  <p>
                    <strong>On Android</strong>
                    <br />
                    Open the browser menu → Install app or Add to Home screen.
                  </p>
                </div>
              )}
            </div>
          </Sheet>
        )}
        {panel === "import" && pendingImport && (
          <Sheet
            title="Welcome your words back"
            eyebrow="RESTORE BACKUP"
            onClose={() => {
              setPanel(null);
              setPendingImport(null);
            }}
          >
            <div className="sheet-content">
              <p className="body-copy">
                Restore {pendingImport.books.length} books and {pendingImport.collections.length}{" "}
                collections? This replaces the current library. We’ll download a backup of your
                current library first.
              </p>
              <div className="confirm-actions">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setPanel(null);
                    setPendingImport(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    downloadLibrary(library);
                    update(() => pendingImport);
                    setPanel(null);
                    setPendingImport(null);
                    closeBook();
                    setNotice("Your books are back in their place.");
                  }}
                >
                  Restore books
                </button>
              </div>
            </div>
          </Sheet>
        )}
        {conflict && (
          <Sheet
            title="Two chapters of your library"
            eyebrow="CHOOSE A LIBRARY"
            onClose={() => setNotice("Choose which version of your library to keep.")}
          >
            <div className="sheet-content">
              <p className="body-copy">
                There are two versions of your library. Choose the version to keep. A backup of the
                other version will download first.
              </p>
              <div className="conflict-choices">
                <button className="primary-button" onClick={() => resolveConflict("device")}>
                  Keep this device’s library
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    resolveConflict("server");
                    closeBook();
                  }}
                >
                  Use the other library
                </button>
              </div>
            </div>
          </Sheet>
        )}
        {error && (
          <div className="error-notice" role="alert">
            <CircleAlert size={18} />
            <p>{error}</p>
            <button className="icon-button" onClick={clearError} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <Check size={16} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        )}
        <input
          className="sr-only"
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Import library backup"
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
          }}
        />
      </div>
    </div>
  );
}
