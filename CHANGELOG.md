# Changelog

Release history for the Guitarchive template. The Unreleased section
collects notes for the next release; when the maintainer cuts a release,
retitle the section with the version and paste it into the GitHub release
description. Planned work lives in [ROADMAP.md](ROADMAP.md).

## Unreleased

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

### Upgrade note (carry into the next release's notes)
- `tools/migrate-blocks.js` replaces embedded datacorejsx blocks
  wholesale. If you customized a block inside a song or artist note, the
  migration overwrites those edits — back up customized notes first.

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
