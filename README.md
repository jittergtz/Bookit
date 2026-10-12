# Bookit

A mobile-first personal notebook app. Create books for a year, life lessons, quotes, or anything you want to keep. Design straight book covers with draggable text, emoji or uploaded stickers, any hex color, linear or radial gradients, patterns, optional borders, and cloth texture. Choose serif, sans, typewriter, or handwritten lettering with independent sizes and styles. Keep a cover completely blank while its library name stays visible. Pages support flowing writing or a free canvas for centered quotes, text, and stickers, with white or custom-tinted blank, lined, grid, or dotted paper.

## Run locally

Requires **Node.js 24+**. SQLite uses Node’s built-in `node:sqlite` module, with no database service or native addon to install.

```sh
npm install
npm run dev
```

Open http://localhost:3007. Bookit uses its own local port to avoid service workers from other local apps. The interface stays phone-sized on desktop. Books open with swipe navigation, a page index, and automatic saving. The four starter books are editable examples, seeded only when a new database is first created.

## PWA / production

```sh
npm run build
npm start
```

The production build registers the service worker, caches the app shell and local fonts/assets, and supports offline reading and writing after the first online visit. Install through the browser menu, the library’s settings, or Safari’s **Share → Add to Home Screen**. The manifest includes regular and maskable PNG icons, Apple touch icons, standalone display, portrait orientation, and safe-area support. PWA installation and service workers need HTTPS, except on localhost. To test on a physical phone, serve over HTTPS; Next.js also provides `npm run dev -- --experimental-https` for development (the phone must trust the certificate).

Service workers are intentionally disabled during development to prevent stale development bundles. Bump the cache version in `public/sw.js` when changing the production app shell. Offline sync resumes while the app is open; background sync after the app closes is not implemented.

## Cover and page studio

- **Cover studio:** name your book, choose a starting point (including blank), and open Background for custom colors, gradients, six pattern choices, border, and texture. Add text, preset or custom symbols, or a PNG/JPG/WebP sticker. Select a layer to edit its text, typeface, color, size, weight, alignment, width, and rotation. Drag it, use arrow keys (Shift for larger moves), or enter positions. Center guides snap while dragging; the Center button places a layer exactly in the middle. Layers can be duplicated, reordered, removed, and undone/redone.
- **Default paper:** choose the layout, color, and pattern for newly created pages. Each existing page retains its own settings.
- **Page style → Free layout → Arrange this page:** use the same canvas tools on paper. Normal writing keeps a title and flowing text; only the first writing page shows prompts. Switching layouts keeps text and sticker artwork. Long entries are best suited to normal writing.
- Artwork positions and font sizes scale with the canvas. There are no mandatory cover icons, labels, or page branding. Image stickers are resized to 512 pixels before storage, retain transparency, and travel with JSON backups and offline drafts. Each canvas supports up to 30 layers; total library and device storage limits still apply.
- Existing SQLite files and older backups remain compatible. Design fields are optional JSON properties in the existing books/pages tables; reading an older library does not rewrite it.

## Storage and backup

- SQLite file: `data/bookit.sqlite` (created automatically and ignored by Git).
- Override with `BOOKIT_DB_PATH=/absolute/path/bookit.sqlite` in `.env.local`.
- Normalized SQLite tables: collections, books, pages, and revision metadata. Transactions, foreign keys, WAL, prepared statements, and schema validation protect writes.
- The browser keeps a local draft in `localStorage` on each edit and syncs after a short pause. Offline edits sync on reconnect. A server revision check prevents stale devices from silently overwriting newer writing; the user chooses a version, and the other version is exported first.
- Export and restore JSON backups from library settings. Restoring validates the data and exports the current library before replacing it.
- Limits: 200 books, 500 pages per book, 50 collections, 100,000 characters per page, and 5 MB per sync/backup. Available browser storage may be lower; a storage-full notice asks you to sync or export.

This version is a **single personal library without accounts**: anyone who can reach the server can access the same library. Deploy to a private Node.js server with a persistent disk; add authentication and separate user libraries before opening it to multiple users. Ephemeral serverless disks are unsuitable for this SQLite file. Keep the SQLite file and its WAL/SHM together for backups, or stop the server before copying the database.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Eleven tests cover durable SQLite persistence, API saves, stale-write protection, collection/book deletion, invalid data rejection, offline app-shell caching, rich artwork persistence and backup restoration, older-library compatibility, and lossless page-layout changes. Browser checks also verify customization, search, favorites, backup export, offline writing, reconnection sync, and reloading the app with its server stopped.

`npm audit --omit=dev` reports no production vulnerabilities. The Next.js ESLint toolchain currently has an upstream `braces`/glob development-only advisory with no patched `braces` release; it is not included in the running app.

Built with Next.js App Router, React, Tailwind CSS, Lucide icons, Lora, DM Sans, and Caveat (self-hosted), Zod, and SQLite.
