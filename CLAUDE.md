# Guitarchive Template — Project Memory

Public Obsidian starter-vault repo ("Guitarchive") for a guitar tab / chord
archive. Uses the **Datacore** plugin for live-updating views and the
**Templater** plugin for automation. This repo is the **primary development
home** for all Guitarchive machinery; the machinery is also consumed by
private downstream vaults (see below). This file captures decisions,
gotchas, and rejected approaches so a fresh session doesn't have to
rediscover them.

## Repo layout — the repo root IS the Obsidian vault root

Every in-vault path (Templater config, `app.vault` paths, Datacore `path()`
queries) is relative to the repo root itself — the vault is not nested in a
subfolder.

```
guitarchive-template/            # ← repo root = vault root
├── Guitarchive.md               # dashboard: stat tiles, recently added, live index table
├── Songs/                       # ships EMPTY (.gitkeep) — see ground rules
├── Artists/                     # ships EMPTY (.gitkeep)
├── Attachments/Covers/          # ships EMPTY — downloaded covers are never committed
├── Templates/
│   ├── New Song.md              # Templater folder template for Songs/ (embeds the header block)
│   └── Scripts/                 # Templater "Script files folder location"
│       ├── enrichSongNote.js    # user script: MusicBrainz enrichment
│       ├── Enrich Song.md       # trigger template: <%* await tp.user.enrichSongNote(tp) %>
│       ├── syncArtistPages.js   # user script: create missing Artists/ pages
│       ├── Sync Artist Pages.md # trigger template
│       ├── enrichArtistPage.js  # user script: Wikipedia bio for an artist page
│       ├── Enrich Artist.md     # trigger template
│       ├── adoptSongNote.js     # user script: merge standard frontmatter into an imported note
│       └── Adopt Song.md        # trigger template
├── docs/                        # one-pager site (index.html + style.css) — export-ignored
├── tools/                       # node maintenance scripts (block migration) — export-ignored
├── .obsidian/                   # SHIPPED config: community-plugins list, Templater data.json,
│                                #   hotkeys.json, song-note.css snippet; plugin binaries gitignored
├── README.md · LICENSE (MIT, attributed to "michaelck")
├── .gitattributes               # export-ignore: docs/, tools/, CLAUDE.md, .claude/
└── .gitignore                   # .obsidian session state + plugin main.js/manifest/styles
```

## Public-repo ground rules

- **The maintainer commits manually — never run `git commit` or `git
  push`.** Prepare changes and (when asked) commit messages; the
  maintainer does the rest.
- **No song content, ever.** Transcriptions of copyrighted songs belong in a
  private vault, not this repo. `Songs/`, `Artists/`, `Attachments/Covers/`
  ship empty with `.gitkeep` (Songs/ must exist for the Templater
  folder-template mapping). Even public-domain example songs were removed
  pre-launch (deliberate: simpler story than explaining PD provenance).
- **Never commit downloaded cover art** — CAA images are © their rights
  holders; local covers are for personal archiving only.
- Attribute public work to the GitHub handle **michaelck**, not the full
  name (license, README, docs authorship, JSON-LD).
- Credit upstream projects in the README, **not** in commit messages.
- Public-facing prose (README, docs site, release notes) must not read
  AI-generated — no filler superlatives, no bullet-point salad, no
  "delve"/"seamless"/"powerful".
- Release archives: `.gitattributes` `export-ignore` keeps `docs/`,
  `tools/`, `CLAUDE.md`, and `.claude/` out of the GitHub "Source code"
  zip, so **the release zip IS a clean, openable vault**. Any new
  non-vault file/dir added to the repo needs an `export-ignore` line.
- Releases are cut manually by the maintainer; tag scheme `vX.Y.Z` (first release
  `v0.1.0`, matching the initial commit's "Guitarchive v0.1" naming). The
  docs hero CTA links to `/releases/latest`, so a published release must
  always exist once that link is live.

## Downstream vaults

Private vaults consume this repo's machinery: when it changes here, the
`Templates/` scripts get copied over and the block migration re-run there
(`tools/migrate-blocks.js` accepts the vault path as an argument for
exactly this). Assume a downstream vault has **no git safety net** —
anything run against one must be non-destructive — and that its
hotkeys.json may deliberately differ from the shipped one.

## Song note frontmatter schema

`Artist` (Text or List — supports multi-artist songs), `Song` (Text), `Album`
(Text or List — supports a song appearing on multiple albums), `Version`
(Text, optional, manual only — added July 2026 for multiple interpretations
of one track: **one note per interpretation** (they routinely differ in
Tuning/Capo/Key, which are per-note frontmatter, and mixing arrangements in
one note would also skew key detection), filename disambiguated
(`Hallelujah (Drop D).md`) but `Song` kept as the clean title so MusicBrainz
track matching still works. Version holds the freeform descriptor ("Drop D,
simplified"); the header shows it as an italic muted subtitle under the
title, Guitarchive/artist tables append a muted "· version" suffix to the
song link (both full and compact layouts), it's included in the index text
search, and Songs stat tiles count distinct songs — Artist+Song, lowercased
— rather than notes. Minor variations that share tuning/capo stay as extra
sections in one note. The canonical-note-plus-`Variant Of`-children design
was rejected as needless parent/child bookkeeping), `Tuning` (Text,
default "Standard"), `Capo` (Text, default "None"), `Favorite` (Checkbox),
`Cover` (Text — either a remote URL or a vault-relative path like
`Attachments/Covers/<Artist> - <Album>.jpg`; Obsidian has no native Image
property type), `CoverSource`
(Text — link to the MusicBrainz cover-art page, since Cover Art Archive has no
machine-readable license field), `Genre` (List), `Release Year` (Text), `Label`
(Text), `Duration` (Text, "m:ss"), `Listen` (List of streaming URLs —
Spotify/Bandcamp/etc., written by enrichment when MusicBrainz has them),
`Originally Tabbed By` (Text — who transcribed the tab this note started
from; "Originally" because the note's tab is expected to drift from the
source as edits accumulate) and `Tab Source` (Text — URL it came from; the
header renders both as one "Original tab:" row, name linked to source). The
tab-credit fields are manual only — enrichment never writes them. `Album MBID`
(Text — MusicBrainz release-group id, written by enrichment; keys cover reuse
across songs of the same album). `Key` (Text —
e.g. "G" or "G#m"; manual or auto-detected via the header's "♪ Detect key
from chords" link, which appears only while Key is empty. Detection is a
self-contained scorer inside the header block: chord lines are parsed out of
the ` ```chords ` blocks — a line counts as a chord line when ≥60% of its
words parse as chords — and scored against all 24 major/minor keys by
diatonic membership, with dominant-V and opening/closing-tonic bonuses;
result spelling follows the sheet's own accidentals, so G#m not Abm. tonal.js
was considered and rejected: datacore blocks have no module system and a CDN
fetch would break offline; tonal has no progression→key detection anyway.
With Capo set, the Key row also shows the sounding key). `Metadata
Source` (Text, optional) controls where enrichment looks: absent/
`musicbrainz` = normal lookup, `none` = unpublished/original music — the
Enrich hotkey still refreshes the header and syncs the artist page but never
queries anything, and `enrichArtistPage` honors the same value on artist
pages. Unknown values are rejected with a notice, not treated as the default.
The vault-wide default lives in `DEFAULT_METADATA_SOURCE` at the top of
`enrichSongNote.js`. **Roadmap (deliberately not built yet):** `discogs` as
an additional source — it would slot into the same switch; note Discogs'
API requires a personal access token (must live outside the repo), unlike
MusicBrainz; rate limit 60 req/min authenticated.

Artist pages (`Artists/`) have their own schema: `Name` (Text — the EXACT
artist string as it appears in song frontmatter), plus, once enriched, `MBID`
(Text — MusicBrainz artist id, lets re-runs skip the search/picker) and
`Wikipedia` (Text — article URL). Song matching is done against `Name`, never
against the filename, because filenames are sanitized (`/`, `:` etc.
replaced) while `Name` stays literal.

Obsidian property types are limited to Text, List, Number, Checkbox, Date, Date
& time, Tags — nothing else. Properties never render Markdown: a bare `-`
string shown via a Datacore column's raw `value` gets parsed as an empty bullet
list item and needs `render: value => <>{value}</>` to bypass that.

## Datacore plugin — API notes and gotchas

- Codeblocks start with ` ```datacorejsx ` and must `return function View() { ... }`.
- `dc.useQuery('@page and path("Songs")')` queries pages.
- `dc.useArray(source, fn, deps)` wraps a `DataArray`. Sorting is `.sort(key, direction?, comparator?)` — **not** `.sortby()`. `.sort()` is stable, so when chaining multiple `.sort()` calls, the **last** one wins as the primary key (chain in reverse priority order).
- `dc.useState` / `dc.useMemo` behave as expected.
- `dc.Table` takes `columns` (`{id, title?, value, render?}`) and `rows`.
- A raw `Link` object only auto-renders when it's the **sole** return value of a `render` function. Wrapping it in a `<>...</>` fragment with sibling content (e.g. an emoji) silently breaks it — use the `<dc.Link link={...} />` component instead.
- `dc.fileLink(path)` has **no** display-text parameter (unlike Dataview's `dv.fileLink`). Use `page.$link.withDisplay(text)` for custom link text.
- `page.value("Field")` is case-insensitive frontmatter access.
- `dc.coerce.array(value)` normalizes a Text-or-List property into an array — needed anywhere a property might be either type (Artist, Album, Genre).
- `dc.Switch`, `dc.VanillaSelect`, `dc.Checkbox` are Datacore's basic UI components. `dc.Switch` has no built-in label — wrap it in your own `<label>`.
- Native `array.groupBy(keyFn, comparator)` renders as a large, visually heavy separate header row. For "collapse repeated values inline" (e.g. not repeating an artist name on every row), do it manually with a boolean flag per row instead; reserve `groupBy` for genuine section headers (e.g. A/B/C alphabetical grouping).
- **List-type properties must be "exploded" before sorting/grouping.** If Artist is a List, `flatMap` each page into one `{page, artist}` row per artist first — otherwise code that assumes a plain string (e.g. `artist[0].toUpperCase()` for a first-letter group key) grabs the first array element, not the first character.

## Templater plugin notes

- User scripts live in the configured "Script files folder location" and export `module.exports = async function name(tp) { ... }`, invoked as `tp.user.name(tp)`.
- There is no "Templater Command" toggle in some versions. The supported mechanism is **Template Hotkeys**: create a tiny template file containing `<%* await tp.user.enrichSongNote(tp) %>` and bind a hotkey to that file, not to the script directly.
- When binding, use the **"Insert"** Templater command, not "Create" — Create generates a brand-new note using the file as a template rather than running it against the active note.
- Folder Templates auto-apply to new notes created in a given folder, but require "Trigger Templater on new file creation" to be enabled first.
- **This repo ships `.obsidian/hotkeys.json`** binding Enrich Song
  `Mod+Shift+E`, Enrich Artist `Mod+Shift+A`, Adopt Song `Mod+Shift+M` —
  chosen to avoid all Obsidian defaults (`Mod+Shift+F/V/I` are taken; plain
  `Mod+E/P/O/N` untouched). Sync Artist Pages is deliberately unbound
  (auto-runs inside Enrich Song).

## `Guitarchive.md` design summary

The index note is named `Guitarchive.md` (was called `tablature-index.md` in
early planning). Above the table it shows a dashboard row of stat tiles
(Songs / Artists / Favorites / Tunings — Songs counts distinct Artist+Song,
so multiple Version notes of one track count once; plain value-over-label tiles styled
with Obsidian theme variables `--background-secondary`,
`--background-modifier-border`, `--text-muted`, so they follow light/dark mode
for free) and a "Recently added" line — the five newest song notes by
`page.$ctime` (a Luxon DateTime; compare via `.toMillis()`). The stats are
deliberately unfiltered: they describe the whole vault even when the
table filters below are active.

In a narrow pane the six-column table collapses to two columns: a composite
cell (song link over a muted "artist · album · tuning · capo" detail line,
cover thumbnail kept) plus the ♡ toggle — the full table forces horizontal
scrolling otherwise. "Narrow" is the **measured width of the block's own
container** (a callback ref + `ResizeObserver`, threshold 750px; initial
state `dc.app.isMobile` until the first measurement), not just a device
check — a desktop window squeezed by sidebars or a split collapses too, and
un-collapses live when widened. The table is additionally wrapped in an
`overflow-x: auto` div so borderline widths scroll inside the note instead
of clipping at the pane edge. The A/B/C grouping and artist-sort header
toggle work in both layouts (the compact header is the sort toggle). The
callback-ref pattern matters: `dc.useRef`/`dc.useEffect` aren't documented
Datacore API, so the ref function guards itself with an `el._measured` flag
(callback refs re-fire every render) and bails out via `el.isConnected`
after unmount.

The filter row has a live search box — a plain JSX `<input>` (Datacore has
no turnkey search component; plain inputs inherit Obsidian's theme styling)
with both `onInput` and `onChange` wired to the same state setter, since
Datacore renders via preact where `onInput` is the per-keystroke event.
Matching is case-insensitive substring across Song/Version/Artist/Album/Genre,
applied page-level before the explode so multi-artist songs match on any
artist; it composes with the Favorites/Tuning/Capo filters. Stat tiles stay
unfiltered by design.

The table is sorted by Song then Artist (stable sort, so Artist ends up
primary since it's sorted last). Rows are exploded per-artist first to handle multi-artist songs,
then grouped into A/B/C sections by first letter of artist, with repeated
artist names blanked out except on each artist's first row. The Favorite
column is a clickable heart that writes straight back to frontmatter via
`app.fileManager.processFrontMatter`; the column header itself is the
unfavorited glyph (♡) instead of text. Artist names link to their `Artists/`
page when one exists (a `Map` from each artist page's `Name` property to its
`$link`, built from a second `dc.useQuery('@page and path("Artists")')`);
names without a page render as plain text rather than as broken links. Album/Tuning/Capo use an `orDash()`
helper for a `-` placeholder plus `render: value => <>{value}</>` to stop that
placeholder from being parsed as a Markdown bullet.

The Album column also prepends a tiny (16px) cover thumbnail when `Cover` is
set, using CSS **Grid** (`gridTemplateColumns: "16px 1fr"`) rather than flex —
flexbox's `alignItems: flex-start` did not reliably keep wrapped titles
indented beside the thumbnail in testing; wrapped lines fell back to the
container's left edge instead. Grid tracks fixed it.

The note carries `cssclasses: wide-page` frontmatter plus a rule in the
`song-note.css` snippet (`.wide-page { --file-line-width: 100%;
--metadata-display-reading: none; }`) to opt out of Obsidian's
readable-line-length cap (and hide the noise cssclasses-only properties
panel in reading view). Giving the table's own container `width: 100%` does
nothing on its own — the note's outer content width is the actual
bottleneck. **Gotcha (July 2026):** both the frontmatter and the snippet
rule were once found silently missing despite being documented — if the
desktop table looks starved for width, check these two pieces first.

## `enrichSongNote.js` design summary and rationale

**Only searches MusicBrainz if Artist, Song, and Album are ALL already set in
frontmatter.** It does not prompt for missing fields and does not touch
frontmatter if they're incomplete — it just makes sure the header block
reflects whatever is already there. This was a deliberate simplification after
an Artist+Song-only "recording search" fallback repeatedly failed to reliably
surface the correct result (see Rejected approaches below).

Search path when all three fields are present: search MusicBrainz
release-groups by Artist + Album (a small, precise search space) → user picks
via `tp.system.suggester` if more than one match → richer lookup on the chosen
release-group (`inc=genres+tags+releases`) → resolve the earliest linked
release → look up that release's tracklist (`inc=recordings+labels`) to get
Label and this specific song's Duration.

**Genre only ever comes from MusicBrainz's curated `genres` field — never from
the free-text `tags` field.** Tags are user-submitted folksonomy and turned out
to include garbage (URLs, in-jokes) often enough that showing them wasn't
acceptable; better to leave Genre blank than show noise.

Streaming links come from MusicBrainz URL relationships (`inc=url-rels`),
gathered at three levels and merged with the most song-specific source winning
per service: recording (one extra lookup, only when the track was found) >
release > release-group. Links are whitelisted **by domain** (Spotify, Apple
Music, Bandcamp, YouTube, SoundCloud, Tidal, Deezer), not by relationship
type — MB's rel types ("streaming", "free streaming", "purchase for download")
are applied too inconsistently to filter on. Coverage is patchy (the script
resolves the *earliest* release, often a physical edition with no links), so
an empty `Listen` is normal and nothing gets written in that case. The header
block labels each URL by domain via a small `serviceName()` helper duplicated
inside the block (the block must stay self-contained).

All HTTP goes through `httpJson`/`httpBinary` helpers that use **Obsidian's
`requestUrl` when available** (via a guarded `require("obsidian")`), falling
back to `fetch`. This is a MOBILE requirement, found the hard way: desktop
Obsidian doesn't enforce CORS on fetch, but the mobile webview does, and the
Cover Art Archive's image redirect chain includes an archive.org 301 hop with
no CORS header — so cover downloads silently failed on phones while
everything else worked. CAA also returns some image URLs as plain `http:`,
which iOS refuses (ATS); they're force-upgraded to `https:`.

Cover resolution is cheapest-first: (1) another song with the same `Album
MBID` that already has a local cover file — spelling-proof reuse across
songs of one album; (2) the deterministic `Attachments/Covers/<Artist> -
<Album>.<ext>` file already on disk (covers pre-MBID notes); (3) Cover Art
Archive download. Cover art tries the release-level Cover Art Archive
endpoint first, falling back to release-group level. A `DOWNLOAD_COVERS` flag at the top of the
script (default `true`) downloads the image into `Attachments/Covers/`
(filename `<Artist> - <Album>.<ext>`, extension from Content-Type, overwrites
on re-enrich) and stores the vault-relative path in `Cover`; on download
failure it falls back to storing the remote URL. All three views (song
header, Guitarchive, artist pages) render either form via a `coverSrc`
helper: local paths must be resolved with
`dc.app.vault.adapter.getResourcePath(path)` before use in an `<img src>` —
a raw vault path renders as a broken image. The header's attribution caption
derives its label from the `CoverSource` domain (musicbrainz → "Cover Art
Archive", unsplash → "Unsplash", else the hostname), so hand-picked non-CAA
covers attribute correctly. There's no license/copyright field in the CAA
API, so a `CoverSource` property (link to the MusicBrainz cover-art page) is
stored, and the header block shows a small "Cover art © respective rights
holder" caption rather than implying free use.

The datacorejsx header block is always (re)inserted after the frontmatter,
even when MusicBrainz wasn't queried, and only renders rows for fields that
actually have values — a bare note with just Artist/Song/Tuning/Capo gets a
clean 4-line header instead of a wall of "-" placeholders, and fills in more
rows automatically as fields get populated later.

Gotcha: `insertSongHeader` skips notes whose body already contains
`dc.useCurrentFile()`, so **changing `SONG_HEADER_BLOCK` does not update
existing notes** — any header redesign needs the block migration (see
`tools/` below) run against every vault that has existing notes, AND
`Templates/New Song.md`, which embeds a copy of the block (added July 2026 so
brand-new notes carry the header — and its tappable action links — before
ever being enriched; important on mobile).

The header has an actions row of tappable links (hotkeys don't exist on
mobile): "⟳ Enrich metadata" runs the same Templater command the hotkey
fires, via `dc.app.commands.executeCommandById("templater-obsidian:Templates/
Scripts/Enrich Song.md")`, guarded with `findCommand` so it hides when the
command isn't registered. Artist pages get the same pattern for "⟳ Fetch
Wikipedia bio". Adopt Song deliberately has no in-note trigger (it targets
notes that don't have our blocks yet) — on mobile it goes in the toolbar.

## `syncArtistPages.js` design summary

Templater user script (trigger template: `Templates/Scripts/Sync Artist
Pages.md`, same hotkey pattern as Enrich Song). Scans all `Songs/` frontmatter
for distinct Artist values and creates one page per artist in `Artists/` —
frontmatter `Name: "<exact artist string>"`, an embedded datacorejsx block —
a stat-tile row (distinct Songs / distinct Albums / Favorites, same tile style as
Guitarchive; counts computed from the plain `pages` array rather than the
`songs` DataArray so `Set`/`flatMap` are safe) above a table of that artist's
songs (matched via `Name`, sorted by Release Year then Song then Version, with the same
cover-thumbnail/♡-toggle patterns as Guitarchive) — and a `## Notes` heading
for hand-written content. Deliberate choices: existing pages are **never
regenerated or touched** (they accumulate manual notes below the table);
filenames are sanitized for filesystem-hostile characters but matching always
uses the literal `Name` property; no network calls. It also runs
automatically at the start of every `enrichSongNote` run where Artist is set
(quiet mode — an optional `{ quiet: true }` second arg suppresses the
"already up to date" notice; creations always notify), so in the normal
workflow artist pages appear as a side effect of enriching. The standalone
template remains for songs that never get enriched. Artist strings are
normalized to "Last, First" for people ("Young, Neil"; band names like
"Radiohead" stay as-is) — pages match song frontmatter by exact string, so
two spellings of one artist would make two pages. A rename means updating
song frontmatter, the page's `Name`, and the page filename together.

Like Guitarchive, the song table collapses in narrow panes to two columns: a
composite cell (song link over a muted "album (year) · tuning · capo" detail
line, cover thumbnail kept) plus the ♡ toggle, keyed off the same
ResizeObserver-measured container width (threshold 600px here — no Artist
column) with the same `overflow-x: auto` fallback wrapper. Any future
Datacore table in this project should get the same `COMPACT_COLUMNS` +
measured-width treatment — full tables force horizontal scrolling in narrow
panes, and `dc.app.isMobile` alone can't see a squeezed desktop window.

Because existing artist pages are never regenerated, **changing
`ARTIST_PAGE_BLOCK` needs the same one-off block migration as the song
header** — that's what `tools/migrate-blocks.js` does.

## Block migration — `tools/`

The two embedded datacorejsx blocks (`SONG_HEADER_BLOCK` in
`enrichSongNote.js`, `ARTIST_PAGE_BLOCK` in `syncArtistPages.js`) are the
single source of truth. Because existing notes are never auto-updated, any
block redesign needs:

- `node tools/migrate-blocks.js [vault-path]` — rewrites the embedded block
  in every `Songs/*.md` and `Artists/*.md` of the target vault (defaults to
  this repo; pass a downstream vault's path to migrate that instead) **and**
  refreshes the embed in `Templates/New Song.md`. It evals the block array
  literals straight out of the scripts via `tools/extract-blocks.js`, so
  there's no pasted copy to drift.
- `node tools/extract-blocks.js <scripts-dir> [<New Song.md>]` — standalone
  check that the `New Song.md` embed matches `SONG_HEADER_BLOCK` (useful as
  a test/CI step).

## `adoptSongNote.js` design summary

For imported tabs (files dragged into `Songs/` from outside Obsidian, or
notes moved in after creation — the two cases the New Song folder template
doesn't cover, since folder templates only fire on in-folder creation).
Trigger template: `Templates/Scripts/Adopt Song.md`. Merges the full standard
song frontmatter into the active note via `processFrontMatter`, strictly
non-destructively: only missing/empty keys are added (Song defaults to the
filename, Tuning to "Standard", Favorite to false), and `song-note` is merged
into any existing `cssclasses` list rather than replacing it. Frontmatter
only — the header block comes from the subsequent Enrich Song run. The notice
lists exactly which keys were added.

## `enrichArtistPage.js` design summary

Adds a Wikipedia bio to the active artist page (trigger template:
`Templates/Scripts/Enrich Artist.md`). MusicBrainz stores no prose bios —
its own site shows Wikipedia extracts — so the chain is: MB artist search →
url-rels → English Wikipedia title (direct `wikipedia` rel if en.wikipedia,
else `wikidata` rel → QID → enwiki sitelink) → Wikipedia REST summary
(`/api/rest_v1/page/summary/`, plain-text `extract`). Key decisions:

- The vault's "Last, First" artist names match MB's **sort-name** field, so
  the search queries `artist:"X" OR sortname:"X"`. Suggester on >1 result;
  summaries with `type !== "standard"` (e.g. disambiguation pages) are
  rejected rather than inserted.
- Bio goes in its own `## Bio` section inserted **above `## Notes`** (so
  hand-written notes stay separate); re-running replaces the section in
  place. Wikipedia text is CC BY-SA, so the section ends with a
  source-plus-license attribution line (same spirit as the cover-art
  caption).
- Writes `MBID` and `Wikipedia` to frontmatter; a stored MBID makes re-runs
  skip the search entirely.
- If MB has no Wikipedia/Wikidata rel for the artist, the script notices and
  writes nothing — there is deliberately no name-based Wikipedia search
  fallback, since matching articles by bare name risks grabbing the wrong
  subject. Workaround: add the missing URL relationship to MusicBrainz
  itself, then re-run.

## `docs/` one-pager site

`docs/index.html` + `docs/style.css`, no build step, fully self-contained
(no CDNs, no webfonts, no rasters). Served via GitHub Pages; **canonical URL
is `https://michaelckappeler.com/Obsidian-Guitarchive-Template/`** (custom
domain — NOT michaelck.github.io; canonical link, og:url, and the JSON-LD
url all use it, while `codeRepository`/author links stay on github.com).
Design decisions:

- **Theming is token-level:** dark-wine defaults on `:root`
  (`color-scheme: dark`), blush-light overrides under
  `:root[data-theme="light"]`. Theme is a **site choice** (toggle persisted
  in localStorage key `guitarchive-theme`, stamped pre-paint by a tiny head
  script) — deliberately no `prefers-color-scheme` media query. The toggle
  script also keeps `meta name="theme-color"` in sync (`#211a20` dark /
  `#fbf2f6` light — hex values computed from the oklch tokens).
- **Icon grammar:** every icon is inline SVG on a shared 24px viewBox,
  `fill="none" stroke="currentColor" stroke-width="1.8"` with round
  caps/joins, `aria-hidden="true"`. Text glyphs as icons are banned
  (inconsistent optical size) — EXCEPT inside the CSS "app sketches", where
  `⟳`/`♪` deliberately mimic the real in-app action links.
- **App sketches** are CSS-drawn mockups: real UI furniture text, anonymous
  bars for names/lyrics (no copyrighted content), light-paper in both
  themes; `.sketch-grid` columns are equal-height.
- **SEO:** canonical + Open Graph + Twitter `summary` card + JSON-LD
  `SoftwareSourceCode` (author michaelck). No `og:image` yet — the one
  asset worth adding is a 1200×630 card; until then link previews are
  text-only.
- **A11y:** skip-link, global `:focus-visible` ring, `scroll-margin-top`
  under the sticky header, `text-wrap: balance` on headings,
  `prefers-reduced-motion` honored.
- The hero CTA points at `releases/latest` (the release zip is the vault,
  since docs/ and tools/ are export-ignored).

## Rejected approaches (don't redo these without a new idea)

- **Artist+Song-only "recording" search fallback** (no Album required): tried
  extensively and never made reliable. MusicBrainz recording search surfaces
  bootlegs, fan/Patreon archives, and cover versions ahead of (or instead of)
  the real studio recording. Tried in order — `status:Official` filter
  (insufficient: fan archives are frequently mistagged Official too);
  `primarytype:Album` filter (still insufficient); client-side re-ranking by
  exact artist-credit match plus oldest release date (still didn't surface
  the correct studio recording for test tracks whose fan-archive releases
  outnumber the official ones). Abandoned in favor
  of requiring Album up front — see current design above.
- **CSS `.metadata-container` float hack** to lay cover art beside note
  properties: works, but relies on an undocumented internal Obsidian class.
  Replaced by the self-contained Datacore header block.
- **Native Image property type**: doesn't exist in Obsidian. Cover is a Text
  property holding a URL.
- **obsidian-music-search community plugin**: reviewed its source for safety
  (came back clean), but a custom Templater script was chosen instead for full
  control over the enrichment and header layout.
- **Composer/songwriter credits**: explicitly declined when offered as an
  enrichment option; not implemented.
- **Auto-chaining "New Song" creation into MusicBrainz enrichment**:
  deliberately kept as two separate manual steps, since the Album often isn't
  known yet when a transcription is started.
- **Auto Class plugin dependency**: works (it can auto-apply a CSS class to
  every note in a folder), but deliberately not used here, to cut a plugin
  dependency —
  every song/artist note is generated by a template or script anyway, so
  the native per-note `cssclasses` property is written at creation time
  instead (`song-note` via `New Song.md`/`adoptSongNote`, `artist-note` via
  `artistPageContent`). The snippet targets both classes.
- **Shipping example songs**: four public-domain songs and a fictional
  sample artist were built and then removed pre-launch; the vault ships
  empty. (PD research, if ever revisited: Wagon Wheel, Guthrie's catalog,
  Lead Belly's arrangements, and You Are My Sunshine are all NOT usable.)

## Other plugin research (background, not all adopted)

obsidian-chord-sheets supports chord charts only, no tab/ASCII notation. jTab
and Vextab were considered as tab-focused alternatives — neither is truly
monospaced ASCII, but Vextab can run alongside Chord Sheets without conflict.
Obsidian supports native YouTube embeds. The "Wikipedia Data" plugin was
chosen (of several Wikipedia-pulling options) for reference lookups.
README's requirements table: Templater + Datacore (BRAT note for Datacore),
Chord Sheets optional-but-recommended, Vextab optional.

## Graceful-failover conventions (July 2026 review)

All three datacorejsx views must tolerate hand-made/imported notes with
missing or malformed frontmatter — YAML hands back `null` for empty keys and
**numbers** for values like `Artist: 311` or `Song: 1979`, so:

- String-coerce and trim every Artist value before sorting/grouping/matching;
  a song with no usable Artist gets an "Unknown Artist" index row instead of
  silently vanishing from Guitarchive (flatMap over an empty list = invisible
  note, the worst failure mode).
- `Song` falls back to `page.$name` everywhere it's displayed.
- Never call `new URL()` bare in a render — a malformed Listen/CoverSource
  URL throws and kills the entire block. Use the `hostnameOf()` helper
  (try/catch, returns the raw string on failure).
- Scripts String-coerce frontmatter before calling string methods
  (`.toLowerCase()`, `.replace()`), and strip `"` from values interpolated
  into quoted MusicBrainz Lucene phrases.

## Error log (avoid repeating these)

`array.sortby is not a function` — the method is `.sort()`. `.sort()` is
stable, so the *last* call in a chain wins as the primary sort key.
`dc.fileLink(path)` has no display-text argument — use
`page.$link.withDisplay(text)`. A raw `Link` returned inside a JSX fragment
with siblings fails to render — wrap it in `<dc.Link link={...} />`. A bare
`-` shown via a column's `value` (not `render`) gets Markdown-parsed into an
empty bullet. `app.vault.process()`'s callback must be synchronous. Any
"already contains X" duplicate-check must scope to the note **body**, not the
whole file — frontmatter can contain the same string and cause false
positives. Flexbox did not reliably keep wrapped text beside a fixed-width
sibling image in this environment; CSS Grid (`gridTemplateColumns: "16px 1fr"`)
fixed it. MusicBrainz free-text `tags` are unreliable for Genre — use the
curated `genres` field only. **`fetch()` in scripts works on desktop but not
reliably on mobile** — desktop Obsidian skips CORS enforcement, the mobile
webview doesn't (CAA's redirect chain has a CORS-less hop; iOS also blocks
plain-http URLs). Use `require("obsidian").requestUrl` with a fetch fallback
for all script HTTP. **Never create a Templater trigger-template
`.md` file (one containing `<%* ... %>`) from outside Obsidian with content
already in it** — "Trigger Templater on new file creation" is enabled
vault-wide (needed for the Songs folder template), so when Obsidian discovers
the new file it *executes* the template block and replaces the file's content
with its output, silently blanking it. This ate `Enrich Artist.md` and
`Sync Artist Pages.md` on first creation. Safe paths: create the file empty
and add content in a second write, or (re)write content into a file Obsidian
already knows about — modifications don't re-trigger.

## Setup checklist (what the README walks users through)

Install and enable the Datacore and Templater community plugins (the shipped
`.obsidian` config pre-registers them; users install the binaries). Templater
script folder is `Templates/Scripts`; "Trigger Templater on new file
creation" is enabled so `Templates/New Song.md` fires for new notes in
`Songs/`. Hotkeys ship pre-bound (see Templater notes above); rebinding must
use the "Insert" Templater command, not "Create". The `song-note.css`
snippet hides the native properties panel in reading mode on song notes
(`.song-note`/`.artist-note`), opts `.wide-page` out of the
readable-line-length cap, and carries a mobile-only fix: under `.is-mobile`,
`.metadata-input-longtext.mod-truncate` and `.multi-select-pill-content` get
`white-space: normal; overflow-wrap: anywhere` so long URL property values
wrap instead of truncating to a single un-tappable line. These are
undocumented internal Obsidian classes — acceptable because failure degrades
to stock truncation instead of breaking anything.
