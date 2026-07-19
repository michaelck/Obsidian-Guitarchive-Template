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
	"",
	"// returns \"-\" for empty values; joins list values with \", \"",
	"const orDash = value =>",
	'    value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)',
	'        ? "-"',
	"        : Array.isArray(value)",
	'        ? value.join(", ")',
	"        : value;",
	"",
	"// Cover may be a remote URL or a vault-relative path (downloaded cover)",
	"const coverSrc = cover =>",
	'    cover && !/^https?:\\/\\//.test(cover) ? dc.app.vault.adapter.getResourcePath(cover) : cover;',
	"",
	"// hostname of a URL, or the raw string when it isn't a valid URL —",
	"// a malformed frontmatter value must never crash the whole block",
	"const hostnameOf = url => {",
	'    try { return new URL(url).hostname.replace(/^www\\./, ""); } catch { return String(url); }',
	"};",
	"",
	"// human label for a streaming URL, matched by hostname — not substring,",
	"// so a URL that merely contains a service's name isn't labeled as it",
	"// (the official-homepage link falls through to its bare hostname)",
	"const serviceName = url => {",
	"    const host = hostnameOf(url); // already strips www.",
	'    const at = domain => host === domain || host.endsWith("." + domain);',
	'    return at("open.spotify.com") ? "Spotify" :',
	'        at("music.apple.com") || at("itunes.apple.com") ? "Apple Music" :',
	'        at("bandcamp.com") ? "Bandcamp" :',
	'        at("youtube.com") || at("youtu.be") ? "YouTube" :',
	'        at("soundcloud.com") ? "SoundCloud" :',
	'        at("tidal.com") ? "Tidal" :',
	'        at("deezer.com") ? "Deezer" :',
	"        host;",
	"};",
	"",
	"// flips the Favorite frontmatter property on a page (same as Guitarchive)",
	"const toggleFavorite = async (page) => {",
	"    const file = dc.app.vault.getFileByPath(page.$path);",
	"    if (!file) return;",
	"    await dc.app.fileManager.processFrontMatter(file, fm => {",
	"        fm.Favorite = !(fm.Favorite === true);",
	"    });",
	"};",
	"",
	"// one dashboard stat: big value over a muted label (same style as Guitarchive)",
	"const StatTile = ({ value, label }) => (",
	"    <div style={{",
	'        background: "var(--background-secondary)",',
	'        border: "1px solid var(--background-modifier-border)",',
	'        borderRadius: "8px",',
	'        padding: "10px 16px",',
	'        minWidth: "100px",',
	"    }}>",
	'        <div style={{ fontSize: "1.6em", fontWeight: 600, lineHeight: 1.2 }}>{value}</div>',
	'        <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>{label}</div>',
	"    </div>",
	");",
	"",
	"return function View() {",
	"    const current = dc.useCurrentFile();",
	'    const name = String(current.value("Name") ?? current.$name);',
	"    // Wikipedia's one-line descriptor, written by Enrich Artist — shown as",
	"    // a muted subtitle, mirroring the Version subtitle on song headers",
	'    const description = current.value("Description");',
	'    const listen = dc.coerce.array(current.value("Listen") ?? []).map(String);',
	"",
	"    // compact (two-column) layout whenever the pane is actually narrow —",
	"    // measured with a ResizeObserver on the block's own container, so a",
	"    // squeezed desktop window collapses just like a phone does",
	"    const COMPACT_WIDTH = 600; // px — roughly where the five columns stop fitting",
	"    const [compact, setCompact] = dc.useState(dc.app.isMobile);",
	"    const measureRef = el => {",
	"        if (!el || el._measured) return; // callback refs re-fire on every render",
	"        el._measured = true;",
	"        const update = () => {",
	"            if (el.isConnected && el.clientWidth > 0) setCompact(el.clientWidth < COMPACT_WIDTH);",
	"        };",
	"        new ResizeObserver(update).observe(el); // also fires once on observe",
	"    };",
	"",
	"    // in-note trigger for artist enrichment (listen links, bio, descriptor)",
	"    // — same Templater command the hotkey fires, so it also works on mobile",
	"    // where there are no hotkeys",
	'    const ENRICH_COMMAND = "templater-obsidian:Templates/Scripts/Enrich Artist.md";',
	"    const canEnrich = !!dc.app.commands?.findCommand?.(ENRICH_COMMAND);",
	"",
	"    const pages = dc.useQuery('@page and path(\"Songs\")');",
	"",
	"    // this artist's songs, sorted by release year then title (then Version,",
	"    // so multiple takes of one song keep a deterministic order)",
	"    const songs = dc.useArray(",
	"        pages,",
	"        array => array",
	"            // String-coerce both sides so numeric names (\"311\") still match",
	'            .filter(page => dc.coerce.array(page.value("Artist") ?? []).map(String).includes(name))',
	'            .sort(page => String(page.value("Version") ?? ""))',
	'            .sort(page => String(page.value("Song") ?? page.$name))',
	'            .sort(page => String(page.value("Release Year") ?? "9999")),',
	"        [name]",
	"    );",
	"",
	"    // headline counts for the stat tiles: songs, distinct albums, favorites.",
	"    // Computed from the plain pages array (not the songs DataArray) so plain",
	"    // JS methods and Set are safe to use.",
	"    const stats = dc.useMemo(() => {",
	'        const mine = pages.filter(page => dc.coerce.array(page.value("Artist") ?? []).map(String).includes(name));',
	'        const albums = new Set(mine.flatMap(page => dc.coerce.array(page.value("Album") ?? []).filter(album => album)));',
	"        // several Version notes of one song still count as one song",
	'        const distinctSongs = new Set(mine.map(page => String(page.value("Song") ?? page.$name).trim().toLowerCase()));',
	"        return {",
	"            songs: distinctSongs.size,",
	"            albums: albums.size,",
	'            favorites: mine.filter(page => page.value("Favorite") === true).length,',
	"        };",
	"    }, [pages, name]);",
	"",
	"    const COLUMNS = [",
	"        {",
	'            id: "Song",',
	'            value: page => page.value("Song") ?? page.$name,',
	"            // muted Version suffix tells multiple takes of one song apart",
	"            render: (value, page) => {",
	'                const version = page.value("Version");',
	"                return (",
	"                    <>",
	"                        <dc.Link link={page.$link.withDisplay(value)} />",
	'                        {version && <span style={{ fontSize: "0.85em", color: "var(--text-muted)" }}> · {version}</span>}',
	"                    </>",
	"                );",
	"            }",
	"        },",
	"        {",
	'            id: "Favorite",',
	'            title: "♡",',
	'            value: page => page.value("Favorite") === true,',
	"            render: (isFavorite, page) => (",
	'                <span onClick={() => toggleFavorite(page)} style={{ cursor: "pointer" }}>',
	'                    {isFavorite ? "❤️" : "♡"}',
	"                </span>",
	"            )",
	"        },",
	"        {",
	'            id: "Album",',
	"            value: page => {",
	'                const album = orDash(page.value("Album"));',
	'                const year = page.value("Release Year");',
	"                return year ? `${album} (${year})` : album;",
	"            },",
	"            // 16px cover thumbnail in a fixed grid track (same as Guitarchive)",
	"            render: (value, page) => {",
	'                const cover = page.value("Cover");',
	"                if (!cover) return <>{value}</>;",
	"                return (",
	'                    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", columnGap: "4px", alignItems: "start" }}>',
	"                        <img",
	"                            src={coverSrc(cover)}",
	'                            style={{ width: "16px", height: "16px", objectFit: "cover", borderRadius: "3px", marginTop: "3px" }}',
	"                        />",
	"                        <span>{value}</span>",
	"                    </div>",
	"                );",
	"            }",
	"        },",
	'        { id: "Tuning", value: page => orDash(page.value("Tuning")), render: value => <>{value}</> },',
	'        { id: "Capo", value: page => orDash(page.value("Capo")), render: value => <>{value}</> }',
	"    ];",
	"",
	"    // in a narrow pane (phones, but also squeezed desktop windows) the",
	"    // five-column table forces horizontal scrolling; collapse to two",
	"    // columns — a composite cell (song link over a muted detail line) plus",
	"    // the ♡ toggle — same pattern as Guitarchive",
	"    const COMPACT_COLUMNS = [",
	"        {",
	'            id: "Song",',
	'            value: page => page.value("Song") ?? page.$name,',
	"            render: (value, page) => {",
	'                const cover = page.value("Cover");',
	'                const version = page.value("Version");',
	'                const album = orDash(page.value("Album"));',
	'                const year = page.value("Release Year");',
	'                const tuning = orDash(page.value("Tuning"));',
	'                const capo = orDash(page.value("Capo"));',
	"                // album (with year) when set; tuning only when non-Standard;",
	"                // capo when set — keeps the detail line short on small screens",
	"                const details = [",
	'                    album !== "-" ? (year ? `${album} (${year})` : album) : null,',
	'                    tuning !== "-" && tuning !== "Standard" ? tuning : null,',
	'                    capo !== "-" ? `capo ${capo}` : null,',
	'                ].filter(Boolean).join(" · ");',
	"                return (",
	'                    <div style={{ display: "grid", gridTemplateColumns: cover ? "16px 1fr" : "1fr", columnGap: "6px", alignItems: "start" }}>',
	"                        {cover && (",
	"                            <img",
	"                                src={coverSrc(cover)}",
	'                                style={{ width: "16px", height: "16px", objectFit: "cover", borderRadius: "3px", marginTop: "3px" }}',
	"                            />",
	"                        )}",
	"                        <div>",
	"                            <dc.Link link={page.$link.withDisplay(value)} />",
	'                            {version && <span style={{ fontSize: "0.85em", color: "var(--text-muted)" }}> · {version}</span>}',
	'                            <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>{details}</div>',
	"                        </div>",
	"                    </div>",
	"                );",
	"            }",
	"        },",
	'        COLUMNS.find(column => column.id === "Favorite"), // ♡ toggle, unchanged',
	"    ];",
	"",
	"    return (",
	"        <div ref={measureRef}>",
	"            {description && (",
	'                <div style={{ fontSize: "0.9em", color: "var(--text-muted)", fontStyle: "italic", marginBottom: "10px" }}>{description}</div>',
	"            )}",
	'            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>',
	'                <StatTile value={stats.songs} label={stats.songs === 1 ? "Song" : "Songs"} />',
	'                <StatTile value={stats.albums} label={stats.albums === 1 ? "Album" : "Albums"} />',
	'                <StatTile value={stats.favorites} label={stats.favorites === 1 ? "Favorite" : "Favorites"} />',
	"            </div>",
	"            {listen.length > 0 && (",
	'                <div style={{ marginBottom: "10px" }}>',
	'                    <strong>Listen:</strong>{" "}',
	"                    {listen.map((url, i) => (",
	'                        <span key={url}>{i > 0 ? " · " : ""}<a href={url}>{serviceName(url)}</a></span>',
	"                    ))}",
	"                </div>",
	"            )}",
	"            {canEnrich && (",
	'                <div style={{ fontSize: "0.85em", color: "var(--text-muted)", marginBottom: "10px" }}>',
	'                    <a onClick={() => dc.app.commands.executeCommandById(ENRICH_COMMAND)} style={{ cursor: "pointer" }}>⟳ Enrich artist metadata</a>',
	"                </div>",
	"            )}",
	"            {/* overflow-x keeps any residual overflow scrollable inside the",
	"                note instead of clipping at the pane edge */}",
	'            <div style={{ overflowX: "auto" }}>',
	"                <dc.Table columns={compact ? COMPACT_COLUMNS : COLUMNS} rows={songs} />",
	"            </div>",
	"        </div>",
	"    );",
	"}",
	"",
	"```",
].join("\n");

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
