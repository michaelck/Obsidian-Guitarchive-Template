// Templater user script: create an artist page in Artists/ for every distinct
// Artist value found in Songs/ frontmatter that doesn't have one yet.
//
// Setup (same pattern as enrichSongNote.js):
//   - Save as Templates/Scripts/syncArtistPages.js
//   - Create a tiny template file (Templates/Sync Artist Pages.md) containing:
//       <%* await tp.user.syncArtistPages(tp) %>
//     and run it via "Templater: Insert Templater Template" (or bind a hotkey).
//
// Design notes:
//   - The artist page stores the EXACT artist string in a `Name` frontmatter
//     property, and its datacorejsx block matches songs against that — not
//     against the filename — so artist names with filesystem-hostile
//     characters (e.g. "AC/DC") still work; only the filename is sanitized.
//   - Existing artist pages are never touched or regenerated: they're meant
//     to accumulate hand-written notes (bio via the Wikipedia Data plugin,
//     gear/technique notes, etc.) below the generated song table.
//   - Purely local — no network calls. Run it whenever new songs introduce
//     new artists.

const ARTISTS_FOLDER = "Artists";
const SONGS_FOLDER = "Songs";

// The live song table embedded in each artist page. Reads the artist name
// from the page's own Name property, so the block itself is identical for
// every artist. Array-of-lines + join to avoid escaping the ``` fence.
const ARTIST_PAGE_BLOCK = [
	"```datacorejsx",
	'const { ArtistPage } = await dc.require(dc.fileLink("Templates/Scripts/artist-page-view.jsx"));',
	"return function View() {",
	"    return <ArtistPage dc={dc} />;",
	"}",
	"```",
].join("\n")

function artistPageContent(artist) {
	// quote the YAML value: artist strings like "Smith, Elliott" stay literal
	const quoted = artist.replace(/"/g, '\\"');
	// cssclasses (native, per-note) pairs with the CSS snippet to hide the raw
	// properties panel in reading view — no Auto Class plugin needed
	return `---\nName: "${quoted}"\ncssclasses:\n  - artist-note\n---\n\n${ARTIST_PAGE_BLOCK}\n\n## Notes\n`;
}

// `quiet: true` (used when piggybacked on enrichSongNote) suppresses the
// "already up to date" notice — creations are always announced.
module.exports = async function syncArtistPages(tp, { quiet = false } = {}) {
	// collect every distinct Artist value across all song notes
	const artists = new Set();
	for (const file of app.vault.getMarkdownFiles()) {
		if (!file.path.startsWith(`${SONGS_FOLDER}/`)) continue;
		const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const raw = fm.Artist;
		const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
		for (const artist of list) {
			// String() so numeric names ("311") still get a page
			const normalized = String(artist ?? "").trim();
			if (normalized) artists.add(normalized);
		}
	}

	if (!app.vault.getAbstractFileByPath(ARTISTS_FOLDER)) {
		await app.vault.createFolder(ARTISTS_FOLDER);
	}

	const created = [];
	for (const artist of [...artists].sort()) {
		// filename only — the page matches songs via its Name property
		const fileName = artist.replace(/[\\/:*?"<>|]/g, "-");
		const path = `${ARTISTS_FOLDER}/${fileName}.md`;
		if (app.vault.getAbstractFileByPath(path)) continue;
		await app.vault.create(path, artistPageContent(artist));
		created.push(artist);
	}

	if (created.length > 0) {
		new Notice(`Created ${created.length} artist page(s): ${created.join(", ")}`);
	} else if (!quiet) {
		new Notice(`Artist pages already up to date (${artists.size} artists).`);
	}
};

// Exposed for the offline test suite (tools/tests/) — inert inside Obsidian.
module.exports.__test__ = {
	artistPageContent,
	ARTIST_PAGE_BLOCK,
};
