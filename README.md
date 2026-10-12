# Bookit

A mobile-first personal notebook app. Create books for a year, life lessons, quotes, or anything you want to keep. Design straight book covers with draggable text, emoji or uploaded stickers, any hex color, linear or radial gradients, patterns, optional borders, and cloth texture. Choose serif, sans, typewriter, or handwritten lettering with independent sizes and styles. Keep a cover completely blank while its library name stays visible. Pages support flowing writing or a free canvas for centered quotes, text, and stickers, with white or custom-tinted blank, lined, grid, or dotted paper.

## Run locally

Requires **Node.js 24+**. The legacy SQLite import uses Node’s built-in `node:sqlite` module. Everyday library storage runs in IndexedDB on the device; it needs no database service.

```sh
npm install
npm run dev
```

Open http://localhost:3007. Bookit uses its own local port to avoid service workers from other local apps. The interface stays phone-sized on desktop. Books open with swipe navigation, a page index, and automatic saving. The four starter books are editable examples, added only when creating a device library without existing data.

## PWA / production

```sh
npm run build
npm start
```

The production build registers the service worker, caches the app shell and local fonts/assets, and supports offline reading and writing after the first online visit. Install through the browser menu, the library’s settings, or Safari’s **Share → Add to Home Screen**. The manifest includes regular and maskable PNG icons, Apple touch icons, standalone display, portrait orientation, and safe-area support. PWA installation and service workers need HTTPS, except on localhost. To test on a physical phone, serve over HTTPS; Next.js also provides `npm run dev -- --experimental-https` for development (the phone must trust the certificate).

Service workers are intentionally disabled during development to prevent stale development bundles. Bump the cache version in `public/sw.js` when changing the production app shell. Once the app shell is cached, opening, editing, creating, deleting, customizing, and restoring books work without the server. Reconnecting does not replace device data or trigger automatic library syncing.

## Cover and page studio

- **Cover studio:** name your book, choose a starting point (including blank), and open Background for custom colors, gradients, six pattern choices, border, and texture. Add text, preset or custom symbols, or a PNG/JPG/WebP sticker. Select a layer to edit its text, typeface, color, size, weight, alignment, width, and rotation. Drag it, use arrow keys (Shift for larger moves), or enter positions. Center guides snap while dragging; the Center button places a layer exactly in the middle. Layers can be duplicated, reordered, removed, and undone/redone.
- **Default paper:** choose the layout, color, and pattern for newly created pages. Each existing page retains its own settings.
- **Book options (three dots) → Page style → Free layout → Arrange this page:** use the same canvas tools on paper. Normal writing keeps a title and flowing text; only the first writing page shows prompts. Switching layouts keeps text and sticker artwork. Long entries are best suited to normal writing.
- Artwork positions and font sizes scale with the canvas. There are no mandatory cover icons, labels, or page branding. Image stickers are resized to 512 pixels before storage, retain transparency, and travel with JSON backups and offline drafts. Each canvas supports up to 30 layers; total library and device storage limits still apply.
- Existing SQLite files, device drafts, and older JSON backups remain compatible. Covers, artwork, stickers, and page formatting are included in device saves and backups.

## Storage and backup

- **Device database:** IndexedDB `bookit-device-v1`, with atomic writes, strict durability where supported, and a revision check to protect against stale tabs. The browser is asked for persistent storage where supported.
- Each edit also creates an immediate recovery copy in `localStorage` until its database transaction commits. Transaction failures produce an actionable error; interrupted saves are recovered on reopening. Committed recovery copies cannot overwrite later edits.
- Existing `bookit-library-v1` drafts migrate first, including edits that never reached SQLite. A clean legacy cache checks for newer SQLite data once during migration, using the cache if the server is unavailable. A fresh device without local data attempts a one-time import from `/api/library`, falling back to editable starter books if unavailable. Subsequent library reads and writes never require HTTP.
- Tabs receive updates from the same device database. Conflicting edits stay recoverable, and choosing a version downloads a backup of the other version first.
- Export and restore JSON backups from library settings. Restoring validates the library and exports the current library before replacing it. Older indented backups and unwrapped library JSON are accepted.
- Limits: 200 books, 500 pages per book, 50 collections, 100,000 characters per page, and 5 MB of UTF-8 library data. Backup files may be up to 20 MB to accommodate older indented JSON, but their parsed library must fit the same 5 MB limit.
- Browser site-data clearing or private-session cleanup can remove device storage. Keep exported backups of important writing. Browser storage belongs to the current origin, browser, and device; different domains or ports have independent libraries.

**Retained SQLite compatibility:** `data/bookit.sqlite` is created automatically and ignored by Git. Override it with `BOOKIT_DB_PATH=/absolute/path/bookit.sqlite` in `.env.local`. Its normalized collections, books, pages, and revision tables use foreign keys, WAL, FULL synchronization, prepared statements, atomic write transactions, and consistent read snapshots. The existing file is preserved for migration; new device edits do not update that server file. There are no accounts or automatic cross-device syncing. The compatibility API exposes a single legacy library to anyone who can reach the server, so keep a server containing personal legacy data private.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover SQLite and IndexedDB persistence, API saves, UTF-8 limits, transaction rollback, stale-tab protection, migration of unsent drafts, interrupted-write recovery, rapid edits, full localStorage, backup compatibility, collection/book deletion, invalid data rejection, offline app-shell caching, artwork persistence, and lossless page-layout changes. Browser verification uses a separate temporary library and checks writing and reloading with its server stopped.

`npm audit --omit=dev` reports no production vulnerabilities. The Next.js ESLint toolchain currently has an upstream `braces`/glob development-only advisory with no patched `braces` release; it is not included in the running app.

Built with Next.js App Router, React, Tailwind CSS, Lucide icons, Lora, DM Sans, and Caveat (self-hosted), Zod, IndexedDB, and a retained SQLite migration API.
