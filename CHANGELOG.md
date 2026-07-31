# Changelog

Release history for the Guitarchive template. The Unreleased section
collects notes for the next release; when the maintainer cuts a release,
retitle the section with the version and paste it into the GitHub release
description. Planned work lives in [ROADMAP.md](ROADMAP.md).

## v1.3.1 — 2026-07-30

### Changed
- Setup now calls out a required manual step. On current Templater (2.24+),
  **Trigger Templater on new file creation** is a per-device setting behind a
  confirmation dialog, so the vault can no longer ship it pre-enabled — you
  turn it on yourself after installing the plugins, once on each machine you
  use the vault. Until it's on, creating a note in `Songs/` won't prompt for a
  title or add the header block (the new note comes out blank). The README
  setup steps now include this.
- Requirements are clearer about what's optional: only **Templater** and
  **Datacore** are required. **Chord Sheets** (recommended) and **Vextab** are
  optional — Vextab's notation is the most involved to write and is fine to
  skip for a chords-only vault.

## v1.3.0 — 2026-07-28

### Added
- The song header's **Artist** now links to that artist's page when one
  exists (plain text otherwise) — the same cross-linking the index table
  already does, so you can jump from a song to its artist in one click.
- Artist photos: Enrich Artist now pulls the artist's Wikipedia lead image
  (Wikimedia Commons–hosted), stores it in a new `Photo` property, and shows
  it on the artist page beside the descriptor and stats. Attribution follows
  the same discipline as cover art — a `PhotoSource` link to the Commons file
  page (where author and license live). Downloaded images go to
  `Attachments/Photos/`, kept separate from song covers; set
  `DOWNLOAD_PHOTOS = false` at the top of `enrichArtistPage.js` to store just
  the URL. As with covers, keep that folder out of any public repo.
- Discography on artist pages: Enrich Artist lists the artist's studio albums
  and EPs from MusicBrainz (compilations, live albums, and remixes excluded),
  oldest first. Any album you already have songs from expands, right there in
  the list, to links to your songs — the same toggle as the song header's
  "more from this album". Works even for artists with no Wikipedia article.

### Changed
- Song, artist, and now the `Guitarchive.md` dashboard all load their view
  from a shared component via `dc.require` — the dashboard's view moved to
  `Templates/Scripts/guitarchive-view.jsx`, completing the shared-component
  pattern started in v1.2.0. As with the others, this file is load-bearing:
  when upgrading, copy the **whole** `Templates/Scripts/` folder.
- `Label` is now a List property (`multitext`). Enrich Song writes every
  distinct label a release-group appeared on (an album issued on 4AD and
  reissued on Saddle Creek both), ordered original-label-first, always as a
  list — same as Genre. Re-run Enrich Song on existing notes to convert a
  single-string `Label` to the list form.

### Fixed
- Enrich Song no longer writes `[no label]` as a song's Label. That's
  MusicBrainz's special-purpose entity for self-published / white-label
  releases, not a real label — it's now omitted. Previously, when several
  releases shared the earliest date, the script read one release's label
  arbitrarily and could surface `[no label]` even when a sibling release on
  the same date named the real label (e.g. Adrianne Lenker's "Hours Were the
  Birds", where the CD is `[no label]` but the same-day digital release is on
  4AD). Re-run Enrich Song on affected notes to pick up the corrected labels.

## v1.2.0 — 2026-07-28

### Changed
- Song and artist notes no longer embed the full header/page block. Each
  note's body is now a small loader stub that pulls the component in at
  render time from `Templates/Scripts/song-header-view.jsx` /
  `artist-page-view.jsx`. Editing a note is pleasant again (a few lines
  instead of ~280), and a header/page redesign is now a single-file edit
  that every note picks up on the next reload — no per-note migration.

  **This makes the two `.jsx` files load-bearing:** a song or artist note
  shows a broken block if its vault is missing them, so when upgrading,
  copy the **whole** `Templates/Scripts/` folder, not just the scripts you
  recognize (README's Upgrading section says the same).

  Existing notes still carrying the old inline block need a one-time
  migration to the stub: preview with
  `node tools/migrate-blocks.js --dry-run [vault-path]`, then run it
  without `--dry-run`. Notes created after this change use the stub
  automatically. (Editing a component doesn't hot-reload into already-open
  notes — reopen the note or reload Obsidian to pick up changes.)

## v1.1.0 — 2026-07-19

### Added
- Artist pages gained two enriched fields, both rendered by the page
  block and filled in by Enrich Artist:
  - `Listen` — streaming links plus the official homepage, from the
    artist's MusicBrainz URL relationships (same https-only domain
    whitelist as song notes; deliberately no social links). Saved even
    when the artist has no linked Wikipedia article.
  - `Description` — Wikipedia's one-line descriptor ("American
    singer-songwriter"), shown as a muted subtitle above the stats.

  Existing artist pages need the block migration to show the new rows:
  `node tools/migrate-blocks.js [vault-path]` (see the upgrade note
  below). Pages created after this change include them automatically.
- Song notes gained two enriched fields, filled in by Enrich Song from data
  already fetched for Genre/Label/Duration (no extra HTTP):
  - `Track` — this song's position on the release, e.g. "4 of 11".
  - `Album Type` — the release-group's MusicBrainz type: Album, EP,
    Single, Live, or Compilation.

  Both fold into the header's existing Album row ("Norm (2023) · Album ·
  Track 1 of 12") rather than getting their own lines — three rows for one
  album's worth of facts read as noise. Existing song notes need the block
  migration to show them (same `tools/migrate-blocks.js` as above). Notes
  created after this change include them automatically.
- "More from this album" toggle on the song header: a "· N more from this
  album ▸" link appended to the Album row, expanding in place to a
  track-numbered list of the vault's other songs sharing this note's
  `Album MBID` (live query, no network). Hidden entirely when `Album MBID`
  is empty or nothing else matches. Same block migration as above.
- Offline test suite for the Templater scripts:
  `node --test "tools/tests/*.test.js"`. Plain Node, no Obsidian, no
  network. Covers the MusicBrainz enrichment pipeline (against synthetic
  responses), frontmatter adoption, artist-page sync, bio upsert, and
  consistency of the embedded datacorejsx blocks with their copies in
  `Templates/New Song.md`. Also JSX-parses `SONG_HEADER_BLOCK` and
  `ARTIST_PAGE_BLOCK` (via `sucrase`, the one dev dependency in the suite —
  scoped to `tools/package.json`, run `npm install` there first) so a typo
  fails the test run instead of surfacing only when a note is opened in
  Obsidian. Golden-case tests for the header's key-detection scorer (the
  ≥60% chord-line rule, a couple of known progressions, and the
  sheet-accidental spelling rule — a sharp-heavy progression spells
  `D#m`, a flat-heavy one spells `Ebm`) round out the suite. Graceful-
  failover regression tests cover the BLOCK-side paths too: `hostnameOf` on
  malformed/non-URL values in both `SONG_HEADER_BLOCK` and
  `ARTIST_PAGE_BLOCK`, and the Guitarchive index's Unknown Artist fallback
  (null/empty/whitespace-only Artist values collapse to one row instead of
  vanishing, while a bare-numeric Artist like a band named "311" is
  string-coerced into a real row rather than falling back).
- The block-migration tooling now ships in the release zip:
  `tools/migrate-blocks.js` and `tools/extract-blocks.js` run on plain
  Node with no dependencies, so zip users can upgrade an existing vault
  without cloning the repo. `migrate-blocks.js` gained a `--dry-run`
  flag that prints the per-file report without writing anything. The
  README's new "Upgrading" section walks through the whole flow:
  back up, copy the new scripts over, preview with `--dry-run`, apply.
  (The test suite and its npm packaging stay out of the zip.)
- `ROADMAP.md` and this changelog. The roadmap moved out of CLAUDE.md;
  neither file ships in the release zip.

### Changed
- The artist page's in-note action link is now "⟳ Enrich artist metadata"
  (was "⟳ Fetch Wikipedia bio") — it saves streaming links too, not just
  the bio. Included in the same artist-page block migration as above.
- Enrich Song now shows a notice when the Cover Art Archive can't be
  reached (it's hosted on archive.org, which has outages), instead of
  silently leaving Cover empty as if the album had no art. A genuine
  "no cover art exists" still stays quiet. Re-run Enrich Song once the
  archive is back to pick up the cover.
- Each Templater script exposes its internals to the test suite through a
  `__test__` property on its export. No behavior change inside Obsidian.

### Upgrade note
- `tools/migrate-blocks.js` replaces embedded datacorejsx blocks
  wholesale. If you customized a block inside a song or artist note, the
  migration overwrites those edits — back up customized notes first.
  The README's "Upgrading" section is the permanent home of this warning
  and of the step-by-step upgrade flow; release notes only echo it.

## v1.0.1 — 2026-07-18

- Hardened handling of third-party data: Wikipedia extracts get code-fence
  runs neutralized before they land in a note (a fence claiming to be
  `datacorejsx` would otherwise execute), and Listen links must be https
  URLs on whitelisted hosts — a URL that merely contains a service's
  domain somewhere in the string no longer matches.
- Repo restructuring; CLAUDE.md (the project's working notes) is now
  tracked in the repo for transparency.

## v1.0.0 — 2026-07-17

First release: an Obsidian starter vault for a guitar tab archive.

- Live Datacore views: the Guitarchive dashboard (stat tiles, search,
  filters, A–Z index table), generated per-artist pages, and a per-song
  header block that only shows fields with values.
- Templater scripts: MusicBrainz enrichment (album metadata, cover art
  with attribution, streaming links), artist-page sync, Wikipedia bios,
  and frontmatter adoption for imported tabs.
- Mobile support: tables collapse in narrow panes, in-note tappable action
  links, HTTP via Obsidian's `requestUrl` so lookups work in the mobile
  webview.
- `Version` frontmatter field for keeping multiple takes on one song as
  separate notes.
- Docs one-pager and release packaging: the source zip is a clean,
  openable vault (docs and tooling are export-ignored).
