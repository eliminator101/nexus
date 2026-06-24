# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Nexus** is a static, multi-page link-sharing site ("the crew" submit links, search them, and vote). There is no build step, no package manager, and no server-side code in this repo — it's plain HTML, CSS, and vanilla JavaScript that talks directly to a hosted Supabase REST API and Google Identity Services from the browser.

## Running / developing

Serve the directory over HTTP (the pages `fetch()` local JSON config, which fails under `file://`):

```bash
python -m http.server 8000
# then open http://localhost:8000/index.html
```

Google Sign-In only works on origins registered for the OAuth client; guest login (see below) works anywhere. There are no tests, linters, or build commands.

## Architecture

### Pages (each is a standalone entry point)
- `index.html` — landing page; search box redirects to `engine.html?q=...`. Has its own inline script.
- `engine.html` — search + results + voting. The **only** page that loads the shared `engine.js`.
- `submit.html` — submit-a-link form with keyword toggles. Self-contained: its auth/Supabase logic is **inlined and duplicated** in a `<script>` block, not shared from `engine.js`.
- `login.html` — sign-in page; reads `?redirect=` and returns there after login. Auth logic is also inlined here.
- `intro.html` — static About/Mission content.

### Important duplication
Auth (Google + guest), `parseJwt`, `supabaseRequest`, `showAlert`, `escapeHtml`, and the config-loading IIFE are **copy-pasted** across `engine.js`, `submit.html`, and `login.html`. A change to any of these (e.g. the Supabase schema, the login flow, the user object shape) must be applied in all copies. The `GOOGLE_CLIENT_ID`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` constants are likewise repeated in each file.

### Data layer (Supabase)
- All persistence is direct REST calls to `${SUPABASE_URL}/rest/v1/links` using the anon key as both `apikey` and bearer token. There is no backend of our own.
- A **link** record: `{ id (Date.now() string), title, url, keywords[], timestamp, upvotes[], downvotes[], submitterName, submitterEmail }`.
- Votes are stored as **arrays of voter emails** on the link row. Voting reads the array, mutates it client-side, then PATCHes the whole `upvotes`/`downvotes` arrays back. Vote score = `upvotes.length - downvotes.length`.
- `engine.js` keeps a `localStorage` mirror (`link_manager_backup`) and falls back to it when the database is unreachable.

### Auth model
- Two paths: Google Identity Services (decodes the JWT client-side into a user object) and a **guest** login gated by `guestPassword` from `nexus-config.json`.
- The signed-in user is stored in `localStorage` under `google_user`. Pages that require login redirect to `login.html?redirect=<page>` when it's absent.
- This is presentation-only auth: the Supabase anon key in client code is the real access boundary, and any visitor can call the REST API directly.

### Runtime configuration (no rebuild needed)
- `nexus-config.json` — `guestPassword`, plus `logo`, `searchIcon`, and `font` overrides. Every page fetches it with a `?v=<timestamp>` cache-buster and applies logo/font at runtime via a near-identical IIFE.
- `keywords.json` — the `keywords[]` list rendered as the toggle buttons on `submit.html`. Editing this file changes the available submission keywords.
- `nexus.css` — single shared stylesheet; theming is driven by CSS custom properties (e.g. `--app-font`, `--space-*`).

### Search (engine.js)
`scoreLink()` implements weighted relevance scoring (exact title match, prefix, word-boundary regex, substring; keyword exact/prefix/substring; all-terms bonus; popularity tie-breaker). When a query is present, results keep relevance order; with no query they sort by vote score then recency. Results are paged client-side (`RESULTS_PAGE_SIZE` 10, capped at `MAX_RESULTS` 100).

## Conventions
- All user-supplied strings are passed through `escapeHtml()` before being injected into `innerHTML` — preserve this when adding rendered content.
- New page-level behavior tends to live in inline `<script>` blocks; only `engine.html` externalizes its logic. Match the pattern of the page you're editing.
