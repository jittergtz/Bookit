# Bookit

A mobile-first personal notebook app. Create books for a year, life lessons, quotes, or anything you want to keep. Customize cloth-like covers, serif or sans-serif titles, collections, and individual pages with white or tinted blank, lined, grid, or dotted paper.

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

Seven tests cover durable SQLite persistence, API saves, stale-write protection, collection/book deletion, invalid data rejection, and offline app-shell caching. Browser checks also verify customization, search, favorites, backup export, offline writing, reconnection sync, and reloading the app with its server stopped.

`npm audit --omit=dev` reports no production vulnerabilities. The Next.js ESLint toolchain currently has an upstream `braces`/glob development-only advisory with no patched `braces` release; it is not included in the running app.

Built with Next.js App Router, React, Tailwind CSS, Lucide icons, Lora and DM Sans (self-hosted), Zod, and SQLite.
