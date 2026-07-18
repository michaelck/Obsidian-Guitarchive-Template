# Changelog

Release history for the Guitarchive template. The Unreleased section
collects notes for the next release; when the maintainer cuts a release,
retitle the section with the version and paste it into the GitHub release
description. Planned work lives in [ROADMAP.md](ROADMAP.md).

## Unreleased

### Added
- Offline test suite for the Templater scripts:
  `node --test "tools/tests/*.test.js"`. Plain Node — no Obsidian, no
  network, no dependencies. Covers the MusicBrainz enrichment pipeline
  (against synthetic responses), frontmatter adoption, artist-page sync,
  bio upsert, and consistency of the embedded datacorejsx blocks with
  their copies in `Templates/New Song.md`.
- `ROADMAP.md` and this changelog. The roadmap moved out of CLAUDE.md;
  neither file ships in the release zip.

### Changed
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
