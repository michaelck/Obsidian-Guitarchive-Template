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
- [x] "More from this album" toggle — other vault songs sharing this note's
      `Album MBID`, queried live in the block. No network; hides when
      `Album MBID` is empty or nothing else matches. Deviation from plan: a
      full extra row read as noise for albums with many tracks, so instead
      it's a collapsed "· N more from this album ▸" toggle appended to the
      end of the existing Album row, expanding in place to a track-numbered
      list (self-excluded by path, so Version notes of the same song don't
      exclude each other).
- [x] `Track` (position, e.g. "4 of 11") — already present in the release
      tracklist response fetched for Duration.
- [x] `Album Type` (release-group primary type: Album/EP/Single/Live/
      Compilation) — already present in the release-group data; enables
      album-vs-EP grouping in artist tables later. Deviation: landed ahead
      of "More from this album" rather than batched with it — the
      `SONG_HEADER_BLOCK` migration ran twice as a result (once for Track/
      Album Type, again for "More from this album"). Both are now in, so a
      downstream private vault only needs one migration run to pick up the
      whole song-header pass.

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
- [x] Key-detection scorer tests: the scorer is self-contained inside
      `SONG_HEADER_BLOCK`; JSX-transform the extracted block and eval the
      scorer functions with a stubbed `dc`, then run golden cases — chord-line
      detection (≥60% rule), a few real progressions with known keys, and the
      sheet-accidental spelling rule (G#m not Abm). Deviation: the scorer
      region (`PC` through `bestKey`) has no `dc`/`page` references at all,
      so instead of stubbing Datacore's API it's sliced out by anchor and
      run standalone — no render harness needed for this one.
- [x] Graceful-failover regression tests for the BLOCK-side paths
      (`hostnameOf` on malformed URLs, Unknown Artist rows) — waits on the
      JSX-transform item above. The script-side failovers are already
      covered: numeric/null/list Artist values and filename sanitization in
      `syncArtistPages.test.js`, junk/lookalike URLs in the whitelist tests.
      Deviation: the Artist-explode flatMap (Guitarchive.md) is the one
      block region under test that calls into the `dc` API
      (`dc.coerce.array`), unlike the pure `hostnameOf`/key-detection
      regions — rather than a full render harness, it gets one minimal
      `dc.coerce.array` stub matching the documented Text-or-List contract.
      Also confirmed the numeric-Artist case (e.g. a band named "311") is
      string-coerced into a real row rather than falling back to Unknown
      Artist — only null/undefined/empty/whitespace-only values fall
      through.
- [x] `adoptSongNote` non-destructive merge test: fake `processFrontMatter`;
      covers defaults, never-overwrite, empty-string-counts-as-missing, and
      `cssclasses` merge.
- [x] Document the gate — CLAUDE.md's Test suite section.

Release chores for v1.1.0:
- [x] Stop export-ignoring `tools/` (or add a README "Upgrading" section) —
      zip users currently have no way to run the block migration on an
      existing vault. Deviation: did both halves. The export-ignore was
      narrowed rather than dropped — `migrate-blocks.js` and
      `extract-blocks.js` ship (dependency-free, plain Node) while
      `tools/tests/` and the npm package files stay out of the zip — AND
      the README gained an "Upgrading" walkthrough. `migrate-blocks.js`
      also grew a `--dry-run` flag so the walkthrough can say "preview
      first"; covered by `migrate-blocks.test.js` (temp-dir vault
      fixture, real child-process runs).
- [x] Release-notes caveat: `migrate-blocks.js` replaces embedded blocks
      wholesale, so hand-customized blocks lose their tweaks. Deviation:
      instead of living only in release notes (which scroll away), the
      warning's permanent home is now the README's Upgrading section;
      CHANGELOG's upgrade note echoes it and points there.

**v1.3.0 — planned feature batch (July 2026).** Two artist-page enrichment
features plus finishing the shared-component refactor. Ships as one release
straight after v1.2.0 (no v1.2.1 cut) — it also carries the already-merged
Label-as-list change. Hard contract (same as v1.1.0): `Metadata
Source: none` must suppress every new lookup and write below. Artist pages
already use the loader stub (v1.2.0), so render changes to
`artist-page-view.jsx` need NO migration. Suggested order: Guitarchive stub
first (isolated, low-risk), then photo + discography together (both touch
`enrichArtistPage.js` and the artist page, so one pass).

- [x] Artist photo from the Wikipedia lead image. (Done: no Commons imageinfo call needed — the summary URL shape gives Commons detection + file-page attribution directly.) The Wikipedia REST summary
      already fetched in `enrichArtistPage` carries `originalimage`/`thumbnail`
      (Commons URLs), so the photo URL is free — only license + photographer
      attribution needs an extra Commons `imageinfo` call
      (`iiprop=extmetadata`; read `LicenseShortName` + `Artist`, and STRIP HTML
      from the Artist field — it contains markup). Store to a NEW
      `Attachments/Photos/` folder — kept SEPARATE from covers (decision, July
      2026) — with the path in a `Photo` property and the Commons file-page URL
      in `PhotoSource` (mirrors Cover/CoverSource). Reuse the `downloadCover`
      machinery, generalized to `downloadImage(url, baseName, folder)`; on
      download failure or DOWNLOAD flag off, store the remote URL. Render in
      `artist-page-view.jsx` to the left of the Description/stat-tile row
      (mirror the song-header cover block), resolving local paths via the
      existing `coverSrc` helper, with an attribution caption "Photo: {author},
      {license}, via Wikimedia Commons" linking `PhotoSource`.
      `Photo`/`PhotoSource` → `text` in types.json; `Attachments/Photos/*`
      gitignored with a `.gitkeep` (never commit downloaded images — same rule
      as covers). Tests: Commons filename extraction from URL, extmetadata
      license/author parse + HTML strip, `Photo`/`PhotoSource` written, and
      `Metadata Source: none` suppresses it.
- [x] Discography on artist pages. Browse
      `release-group?artist=<mbid>&type=album|ep` (paginate via `offset` for
      prolific artists), filter to primary-type Album/EP with NO secondary
      types (drops comps/live/bootlegs), sort by first-release-date.
      Deviation from plan: first built as a static `## Discography` markdown
      section (Bio-style), then moved to a `Discography` frontmatter list
      (encoded `year|title|type|rgid`) rendered by the artist block — a static
      section can't host the expand-to-your-songs accordion the maintainer
      wanted, and the block matches in-vault albums live (rgid === a song's
      `Album MBID`) with the same `useState` toggle as the song header's "more
      from this album", so it's never stale. `Album Type` (v1.1.0) was added
      for exactly this. Tests: secondary-type filter, date sort, delimiter
      safety, pagination, and the frontmatter write end-to-end.
- [x] Finish the shared-component refactor: give `Guitarchive.md` the
      loader-stub treatment. Extract its inline block (from `return function
      View()`) into `Templates/Scripts/guitarchive-view.jsx` exporting
      `{ Guitarchive }` and taking a `dc` prop — same transform as the
      song/artist components — and replace the block with the 4-line stub. Edit
      Guitarchive.md DIRECTLY (single shipped file, not per-note content, so no
      migration needed here; downstream vaults get it by copying the updated
      file + the new `.jsx`). Repoint `graceful-failover.test.js`'s Guitarchive
      Artist-explode slice to `extractComponent("guitarchive-view.jsx")`; add
      the file to `block-syntax.test.js` and to the load-bearing-files note in
      README/CLAUDE. Optional: a Guitarchive.md entry in `migrate-blocks.js`
      for downstream symmetry (needs a Guitarchive-unique marker — the
      `toggleFavorite` comment or the `path("Artists")` query line). Also
      unblocks the render harness below.

Docs/release for v1.3.0: CLAUDE.md (schema `Photo`/`PhotoSource` + Discography;
`enrichArtistPage` + Guitarchive design summaries; add `guitarchive-view.jsx`
to the shared-components section), CHANGELOG v1.3.0, README feature list,
types.json, .gitignore. Then `node --test "tools/tests/*.test.js"` + one live
smoke test per enrichment feature.

Later / bigger (not in v1.3.0):
- Datacore render harness: stub the full `dc` API (`useQuery`, `useState`,
  `Table`, `Link`…) over preact and actually invoke the components against
  fixture pages — would let tests catch render-path regressions
  (compact-layout collapse, favorite toggle, unknown-artist rows), not just
  syntax. Now more tractable: `song-header-view.jsx` / `artist-page-view.jsx`
  (and `guitarchive-view.jsx` once split) export named components a harness
  can `require`-eval and invoke with a stubbed `dc` prop, instead of slicing
  regions out by anchor string. Big lift; only worth it if component bugs
  keep slipping past the syntax/scorer tests.
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
