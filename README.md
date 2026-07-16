# Guitarchive

An [Obsidian](https://obsidian.md) starter vault for keeping your own guitar
tab & chord archive — a personal songbook that organizes itself.

- **Live index dashboard** (`Guitarchive.md`): stat tiles, recently-added
  songs, and a searchable, sortable, filterable table of every song (live
  text search across song/artist/album/genre, plus tuning, capo, and
  favorites filters) with cover-art thumbnails and one-click favoriting.
- **One-hotkey metadata enrichment**: fill in Artist + Album on a song note,
  hit a hotkey, and pull release year, genre, label, track duration, cover
  art, and streaming links from [MusicBrainz](https://musicbrainz.org) /
  Cover Art Archive.
- **Artist pages** that build themselves: every artist gets a page with
  song/album/favorite counts and a live table of their songs — created
  automatically when you enrich a song, complete with an optional
  one-hotkey Wikipedia bio.
- **Key detection**: a "♪ Detect key from chords" link in the song header
  analyzes your chord sheet and writes the key to frontmatter (with the
  sounding key shown when a capo is set).
- **Plain Markdown all the way down.** Your archive is a folder of text
  files; every view is a query over frontmatter. No database, no lock-in.

## Requirements

Four community plugins (this vault ships with them pre-configured — you
just need to install them):

| Plugin | Purpose |
|---|---|
| [Templater](https://github.com/SilentVoid13/Templater) | new-song template + the enrichment scripts |
| [Datacore](https://github.com/blacksmithgu/datacore) | the live index, headers, and artist tables |
| [Chord Sheets](https://github.com/olvidalo/obsidian-chord-sheets) | chord highlighting in ` ```chords ` blocks (optional but recommended) |
| [Vextab](https://obsidian.md/plugins?id=vextab) | melody lines: standard notation + tablature rendered from ` ```vextab ` blocks (optional — chords-only vaults can skip it) |

Song and artist notes carry a `cssclasses` frontmatter property
(`song-note` / `artist-note`, written automatically by the templates), which
pairs with the bundled CSS snippet to hide the raw properties panel in
reading view — the custom header replaces it. No extra plugin needed; delete
the snippet from **Settings → CSS snippets** if you'd rather see the
properties panel.

> If Datacore isn't in the community-plugin browser yet, install it via
> [BRAT](https://github.com/TfTHacker/obsidian42-brat) (`blacksmithgu/datacore`).

## Setup

1. Clone this repo (or "Use this template" on GitHub, then clone yours).
2. In Obsidian: **Open folder as vault** → pick the cloned folder → trust and
   enable community plugins, installing the four above.
3. Hotkeys come pre-bound (none collide with Obsidian defaults):

   | Command | Key |
   |---|---|
   | Enrich Song | `Cmd/Ctrl+Shift+E` |
   | Enrich Artist | `Cmd/Ctrl+Shift+A` |
   | Adopt Song | `Cmd/Ctrl+Shift+M` |

   Change them in **Settings → Hotkeys** (search "Templater"). If you rebind,
   pick the **Insert** variant, not "Create new note from template" — Create
   spawns a new note instead of running against the open one. *Sync Artist
   Pages* is left unbound: it runs automatically as part of Enrich Song, and
   the command palette covers the rare manual run.
4. Open `Guitarchive.md` — it starts empty and fills in live as you add
   songs to `Songs/`.

## Workflow

1. Create a note in `Songs/` — you'll be prompted for the song title, and the
   frontmatter scaffold appears automatically. **Importing an existing tab
   file** (dragged in from outside Obsidian)? Open it and hit the **Adopt
   Song** hotkey — it merges in the full standard frontmatter without
   touching anything the note already has.
2. Fill in `Artist` (use `Last, First` for people — it matches MusicBrainz
   sort names) and `Album`, plus your tab/chords in the note body. If the tab
   came from somewhere, credit it: `Originally Tabbed By` (who transcribed
   the version you started from) and `Tab Source` (the URL) render as an
   attribution line in the song header — "originally" because your copy will
   likely evolve as you play it.
3. **Enrich Song** hotkey → confirms the album, fills metadata + cover +
   streaming links, inserts the header, and creates the artist's page if new.
   **Tracking your own unpublished music?** Add `Metadata Source: none` to
   the song (and your artist page) — enrichment keeps doing the local work
   (header, artist page) but never queries MusicBrainz.
4. On an artist page: **Enrich Artist** hotkey → pulls a Wikipedia bio into a
   `## Bio` section (with attribution; your `## Notes` are never touched).

## A note on copyright

This repo ships no song content — nothing in it reproduces a copyrighted
work. Your
own transcriptions of copyrighted songs are fine in your private vault, but
think twice before publishing them in a public repo or fork — tabs and lyric
sheets are derivative works. Cover art fetched at enrichment time comes from
the Cover Art Archive and remains © its respective rights holders (the
header shows an attribution caption and stores a `CoverSource` link for each
image). By default enrichment **downloads** covers into `Attachments/Covers/`
so your archive doesn't depend on hot-links — set `DOWNLOAD_COVERS = false`
at the top of `Templates/Scripts/enrichSongNote.js` if you'd rather store
just the URL. Keep downloaded covers out of any *public* repo (add
`Attachments/` to your `.gitignore` if you publish your archive).

## Credits

This vault stands on other people's excellent work:

- [Obsidian](https://obsidian.md) — the platform it all lives in
- [Datacore](https://github.com/blacksmithgu/datacore) by Michael Brenan
  (blacksmithgu) — powers every live view here
- [Templater](https://github.com/SilentVoid13/Templater) by SilentVoid13 —
  powers all the automation
- [Chord Sheets](https://github.com/olvidalo/obsidian-chord-sheets) by
  Marcel Schaeben (olvidalo) — chord rendering
- [Vextab](https://obsidian.md/plugins?id=vextab) by Luis Guzman —
  melody-line notation
- [MusicBrainz](https://musicbrainz.org) and the
  [Cover Art Archive](https://coverartarchive.org) (MetaBrainz Foundation,
  with the Internet Archive) — the open music metadata enrichment pulls from
- [Wikipedia](https://www.wikipedia.org) & Wikidata — artist bios (CC BY-SA)

## License

MIT for everything in this repo (scripts, views, and templates). See
`LICENSE`.
