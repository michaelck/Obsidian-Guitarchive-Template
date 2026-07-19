# Roadmap

Planned work for the Guitarchive template. Shipped changes move to
[CHANGELOG.md](CHANGELOG.md); design rationale and conventions live in
CLAUDE.md. Checked items are done but not yet released.

**v1.1.0 — planned feature batch (July 2026).** All additive/non-breaking:
new frontmatter fields only, blocks render rows only when values exist, old
blocks keep working unmigrated. Batched into one block migration per block
type. Hard contract: `Metadata Source: none` must suppress every new lookup
and write below.

Artist-page pass (one `ARTIST_PAGE_BLOCK` migration):
- [x] `Listen` links on artist pages — the artist `inc=url-rels` response
      (already fetched in `enrichArtistPage`, currently mined only for
      Wikipedia/Wikidata) carries streaming rels. Zero extra HTTP. Same
      `Listen` property name and domain whitelist as songs, plus the
      "official homepage" rel; deliberately no social links. Same
      `serviceName()`/`hostnameOf()` render patterns. Deviation from plan:
      MBID + Listen are now written as soon as the artist lookup succeeds,
      so a missing Wikipedia article no longer means nothing gets saved.
- [x] Wikipedia `description` (one-line descriptor, already in the REST
      summary response) as a muted subtitle — stored in a `Description`
      property; rendered above the stat tiles (the block has no name
      heading of its own; the note title sits directly above).

Song-header pass (one `SONG_HEADER_BLOCK` migration):
- [ ] "More from this album" row — other vault songs sharing this note's
      `Album MBID`, queried live in the block. No network; row hides when
      `Album MBID` is empty or nothing else matches.
- [ ] `Track` (position, e.g. "4 of 11") — already present in the release
      tracklist response fetched for Duration.
- [ ] `Album Type` (release-group primary type: Album/EP/Single/Live/
      Compilation) — already present in the release-group data; enables
      album-vs-EP grouping in artist tables later.

Testing pass (motivation: give dev sessions a cheap `node --test` gate so
changes are verified without a human opening Obsidian and reporting back —
the current verify loop is the single biggest token/time sink). Constraint:
tests run in plain Node, no Obsidian, no network; anything that needs real
Datacore rendering stays manual:
- [x] Test runner: Node's built-in `node:test`, invoked as
      `node --test "tools/tests/*.test.js"` (quoted glob — see CLAUDE.md's
      Test suite section) — zero new dependencies, no package.json needed.
      Tests live in `tools/tests/` (export-ignored, so nothing ships in the
      vault zip).
- [x] Expose script internals non-invasively: each Templater script gained a
      `module.exports.__test__` bag (`adoptSongNote` needs none — its main
      export is the testable function).
- [x] Enrichment pipeline test: `resolveFromReleaseGroup` driven end-to-end
      with stubbed `fetch`. Locks genres-not-tags (including the
      slice-before-junk-filter subtlety), earliest-release resolution,
      Listen merge precedence (recording > release > release-group), domain
      whitelist, and the CAA http→https upgrade. Deviation from plan:
      synthetic inline fixtures (the `mbRoutes()` helper in
      `enrichSongNote.test.js`), not recorded responses — record real ones
      only if a response-shape bug ever slips past the synthetic set.
- [x] Block syntax check: extract `SONG_HEADER_BLOCK` / `ARTIST_PAGE_BLOCK`
      and JSX-parse them, so a typo in a block fails the test run instead of
      surfacing as a broken embed only when a note is opened in Obsidian.
      This is the one place a dev dependency is justified — a small pure-JS
      JSX transformer (sucrase), scoped to `tools/package.json` only. (The
      New Song.md embed-consistency check was already folded in —
      `blocks.test.js`.)
- [ ] Key-detection scorer tests: the scorer is self-contained inside
      `SONG_HEADER_BLOCK`; JSX-transform the extracted block and eval the
      scorer functions with a stubbed `dc`, then run golden cases — chord-line
      detection (≥60% rule), a few real progressions with known keys, and the
      sheet-accidental spelling rule (G#m not Abm).
- [ ] Graceful-failover regression tests for the BLOCK-side paths
      (`hostnameOf` on malformed URLs, Unknown Artist rows) — waits on the
      JSX-transform item above. The script-side failovers are already
      covered: numeric/null/list Artist values and filename sanitization in
      `syncArtistPages.test.js`, junk/lookalike URLs in the whitelist tests.
- [x] `adoptSongNote` non-destructive merge test: fake `processFrontMatter`;
      covers defaults, never-overwrite, empty-string-counts-as-missing, and
      `cssclasses` merge.
- [x] Document the gate — CLAUDE.md's Test suite section.

Release chores for v1.1.0:
- [ ] Stop export-ignoring `tools/` (or add a README "Upgrading" section) —
      zip users currently have no way to run the block migration on an
      existing vault.
- [ ] Release-notes caveat: `migrate-blocks.js` replaces embedded blocks
      wholesale, so hand-customized blocks lose their tweaks. (Drafted in
      CHANGELOG.md's Unreleased section — carry it into the GitHub release
      description.)

Later / bigger (not in v1.1.0):
- Datacore render harness: stub the full `dc` API (`useQuery`, `useState`,
  `Table`, `Link`…) over preact and actually invoke the blocks' `View()`
  functions against fixture pages — would let tests catch render-path
  regressions (compact-layout collapse, favorite toggle, unknown-artist
  rows), not just syntax. Big lift; only worth it if block bugs keep
  slipping past the 1.1.0 syntax/scorer tests.
- Artist photo from the Wikipedia lead image — needs a Commons `imageinfo`
  call for license + photographer attribution (`Photo`/`PhotoSource`
  properties, same discipline as `CoverSource`; reuse the
  download-to-Attachments machinery).
- `## Discography` section on artist pages — browse the artist's MB
  release-groups (filter to primary-type Album/EP with no secondary types
  to exclude bootlegs/compilations; paginate), insert above `## Notes`
  Bio-style, mark which albums have songs in the vault.
- Discogs as an alternative `Metadata Source` — see CLAUDE.md's schema
  section.
- Ship `.obsidian/app.json` with `showInlineTitle: false` — the song/artist
  header blocks already render the title, so the inline filename title
  duplicates it. Held back because app.json silently accumulates whatever
  is touched in Settings → Editor/Files, so shipping it means pruning it
  to deliberate settings before every release. Until then the README's
  Setup section suggests toggling it off manually.
- Deliberately NOT planned: catalog numbers, barcodes, country, MB ratings
  (collector metadata, not player metadata); Wikidata infobox facts (years
  active, members, origin — the Bio prose covers this for human readers).
