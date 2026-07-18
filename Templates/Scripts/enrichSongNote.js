// Templater user script: enrich the ACTIVE song note's frontmatter with data
// pulled from MusicBrainz + the Cover Art Archive.
//
// Setup:
//   1. Install & enable the "Templater" community plugin.
//   2. In Templater settings, set "Script files folder location" to e.g. Templates/Scripts
//      (create that folder if it doesn't exist).
//   3. Save this file there as: Templates/Scripts/enrichSongNote.js
//   4. Either:
//      a) In Templater settings, enable "Templater Command" for this script (if your
//         version has it) — this creates a command you can bind a hotkey to directly, no
//         template file needed. OR
//      b) Create a tiny template file (e.g. Templates/Enrich Song.md) containing just:
//           <%* await tp.user.enrichSongNote(tp) %>
//         then run it via Cmd/Ctrl+P -> "Templater: Insert Templater Template" while your
//         song note is the active file.
//
// What it does:
//   - Requires Artist, Song, and Album to ALL already be set in the note's
//     frontmatter before it will search MusicBrainz. Searching by Artist + Song
//     alone turned out to be too unreliable — MusicBrainz's recording search
//     surfaces bootlegs, fan archives, and covers ahead of (or instead of) the
//     real studio recording often enough that it wasn't worth the noise. If
//     Artist/Album aren't both filled in yet, it does NOT prompt for them and
//     does NOT touch frontmatter — it just leaves things as they are.
//   - When Artist + Album ARE both set: searches MusicBrainz release-groups
//     (small, precise search space), lets you pick if there's more than one
//     match, then pulls Release Year, Genre, Label, Duration, cover art, and
//     streaming links (Spotify/Bandcamp/etc. from MusicBrainz URL
//     relationships, stored as a Listen list property — coverage is patchy,
//     so it's often empty).
//   - Writes everything into the CURRENT note's frontmatter (leaves Song, Tuning,
//     Capo, Favorite untouched).
//   - There's no machine-readable license on Cover Art Archive images (they're all
//     copyrighted by their respective owners), so a CoverSource link back to the
//     MusicBrainz page is stored too, and the header block shows a short
//     attribution caption under the cover instead of implying free use.
//   - Whenever Artist is set (even if Album isn't), also runs
//     tp.user.syncArtistPages in quiet mode, so a newly-referenced artist gets
//     its Artists/ page created as a side effect of enrichment.
//   - Always (re)inserts a datacorejsx header block right after the frontmatter,
//     even when MusicBrainz wasn't queried — it only shows the fields that are
//     actually present, so a bare-bones note still gets a clean Song/Artist
//     header instead of a bunch of "-" placeholders. Replaces any plain
//     "![Cover](...)" line left by an older version of this script. Pair this
//     with a CSS snippet hiding the native properties panel in reading mode:
//       .song-note { --metadata-display-reading: none; }

const USER_AGENT = "ObsidianTabVaultEnricher/1.0 (personal vault script)";

// When true, cover art is downloaded into the vault (COVERS_FOLDER) and the
// Cover property stores the vault-relative file path, so the vault stays a
// real archive instead of hot-linking the Cover Art Archive. When false, the
// remote URL is stored as before. The header/Guitarchive/artist views render
// either form. Downloads are for personal archiving — think twice before
// pushing the covers folder to a public repo (the images stay copyrighted).
const DOWNLOAD_COVERS = true;
const COVERS_FOLDER = "Attachments/Covers";

// Where song metadata comes from when a note doesn't say otherwise. A note
// can override with a "Metadata Source" frontmatter property:
//   - "musicbrainz" — the normal lookup path
//   - "none"        — unpublished/original music that no external database
//                     can know about: enrichment still refreshes the header
//                     and syncs the artist page, but never queries anything
// ("discogs" is a candidate future source; it would slot into the same
// switch in module.exports.)
const DEFAULT_METADATA_SOURCE = "musicbrainz";

// Downloads a cover image into COVERS_FOLDER and returns its vault path.
// Extension comes from the response Content-Type; filename from artist+album.
async function downloadCover(url, baseName) {
	const { data, contentType } = await httpBinary(url);
	const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : contentType.includes("webp") ? "webp" : "jpg";

	// create the folder chain one level at a time (createFolder isn't recursive)
	let parent = "";
	for (const segment of COVERS_FOLDER.split("/")) {
		parent = parent ? `${parent}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(parent)) {
			await app.vault.createFolder(parent).catch(() => {});
		}
	}

	const path = `${COVERS_FOLDER}/${baseName.replace(/[\\/:*?"<>|]/g, "-")}.${ext}`;
	await app.vault.adapter.writeBinary(path, data); // overwrites on re-enrich
	return path;
}

// Another song of the same album — matched by Album MBID, so artist-name
// spelling differences don't matter — that already has a local cover file.
// Lets repeat songs from one album skip the Cover Art Archive entirely.
function findExistingCover(rgid, currentPath) {
	if (!rgid) return null;
	for (const other of app.vault.getMarkdownFiles()) {
		if (!other.path.startsWith("Songs/") || other.path === currentPath) continue;
		const fm = app.metadataCache.getFileCache(other)?.frontmatter ?? {};
		if (fm["Album MBID"] !== rgid) continue;
		const cover = fm.Cover;
		if (typeof cover === "string" && cover && !/^https?:/.test(cover) && app.vault.getAbstractFileByPath(cover)) {
			return { cover, coverSource: fm.CoverSource ?? null };
		}
	}
	return null;
}

// The deterministic covers filename may already exist from an earlier song on
// the same album (downloadCover names files "<Artist> - <Album>.<ext>") —
// covers notes enriched before Album MBID tracking existed.
function coverFileOnDisk(baseName) {
	const base = `${COVERS_FOLDER}/${baseName.replace(/[\\/:*?"<>|]/g, "-")}`;
	for (const ext of ["jpg", "png", "webp", "gif"]) {
		const path = `${base}.${ext}`;
		if (app.vault.getAbstractFileByPath(path)) return { cover: path, coverSource: null };
	}
	return null;
}

// Obsidian's requestUrl does HTTP natively, bypassing the webview's CORS and
// mixed-content rules. This matters on MOBILE: fetch() there is subject to
// both, and the Cover Art Archive's redirect chain includes a hop with no
// CORS header (desktop Obsidian doesn't enforce CORS, which masked this).
// Falls back to fetch when require("obsidian") isn't available.
const obsidianRequestUrl = (() => {
	try {
		return typeof require === "function" ? require("obsidian").requestUrl : null;
	} catch {
		return null;
	}
})();

async function httpJson(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }, throw: false });
		if (res.status >= 400) throw new Error(`HTTP ${res.status} from ${url}`);
		return res.json;
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
	if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
	return res.json();
}

async function httpBinary(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT }, throw: false });
		if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
		return { data: res.arrayBuffer, contentType: res.headers?.["content-type"] ?? "" };
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return { data: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "" };
}

async function mbFetch(url) {
	return httpJson(url);
}

// Search release-groups (Artist + Album) — a small, precise search space (a
// handful of release-groups per album at most, vs. dozens of individual
// recordings per song). Tries a strict exact-phrase match first, then
// progressively loosens the query so a slightly-off capitalization/wording
// miss doesn't mean giving up entirely.
async function mbSearchReleaseGroups(artist, album) {
	// String-coerce (YAML can hand back numbers) and strip double quotes,
	// which would otherwise break the quoted Lucene phrases below
	artist = String(artist).replace(/"/g, "");
	album = String(album).replace(/"/g, "");
	const attempts = [
		`artist:"${artist}" AND releasegroup:"${album}"`,
		`artist:${artist} AND releasegroup:"${album}"`,
		`${artist} ${album}`,
	];

	for (const query of attempts) {
		const url = `https://musicbrainz.org/ws/2/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
		const data = await mbFetch(url);
		const results = data["release-groups"] ?? [];
		if (results.length > 0) return { results, query };
	}
	return { results: [], query: attempts[attempts.length - 1] };
}

// Genres/tags + linked releases for the chosen release-group.
async function getReleaseGroupDetails(rgid) {
	const url = `https://musicbrainz.org/ws/2/release-group/${rgid}?fmt=json&inc=genres+tags+releases+url-rels`;
	return mbFetch(url);
}

// Tracklist + label for a specific release, used to find this song's own
// recording (for Duration) within an album that's otherwise identified by its
// release-group.
async function getReleaseTracklist(releaseId) {
	const url = `https://musicbrainz.org/ws/2/release/${releaseId}?fmt=json&inc=recordings+labels+url-rels`;
	return mbFetch(url);
}

// URL relationships for a single recording — the only place MusicBrainz holds
// song-specific (rather than album-level) streaming links.
async function getRecordingUrlRels(recordingId) {
	const url = `https://musicbrainz.org/ws/2/recording/${recordingId}?fmt=json&inc=url-rels`;
	return mbFetch(url);
}

// Streaming/store services worth surfacing as "Listen" links. Everything else
// in MusicBrainz's URL relationships (Discogs, Wikidata, reviews, lyrics
// sites...) is deliberately ignored — the whitelist matches by domain rather
// than by relationship type, since the types ("streaming", "free streaming",
// "purchase for download") are applied inconsistently across entries.
const STREAMING_SERVICES = [
	{ domains: ["open.spotify.com"], name: "Spotify" },
	{ domains: ["music.apple.com", "itunes.apple.com"], name: "Apple Music" },
	{ domains: ["bandcamp.com"], name: "Bandcamp" },
	{ domains: ["youtube.com", "youtu.be"], name: "YouTube" },
	{ domains: ["soundcloud.com"], name: "SoundCloud" },
	{ domains: ["tidal.com"], name: "Tidal" },
	{ domains: ["deezer.com"], name: "Deezer" },
];

// Matches a URL against the whitelist by exact hostname (or subdomain), https
// only. MusicBrainz URL relationships are community-submitted, so a URL that
// merely CONTAINS a service's domain somewhere in the string must not pass —
// it would render in the header as a trusted-looking "Spotify" etc. link.
function matchStreamingService(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== "https:") return null;
	return (
		STREAMING_SERVICES.find((s) =>
			s.domains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))
		) ?? null
	);
}

// Map of service name -> URL for whichever whitelisted services appear in a
// relations array. First hit per service wins.
function streamingLinks(relations) {
	const found = new Map();
	for (const rel of relations ?? []) {
		const url = rel.url?.resource;
		if (!url) continue;
		const service = matchStreamingService(url);
		if (service && !found.has(service.name)) found.set(service.name, url);
	}
	return found;
}

// Tries the specific release's cover first (most accurate to the exact edition),
// then falls back to the release-group's chosen cover. Returns both the image
// URL and a human-browsable MusicBrainz page to link back to for attribution,
// since Cover Art Archive has no license field to pull programmatically.
async function coverArtUrl(releaseId, releaseGroupId) {
	for (const [type, id] of [["release", releaseId], ["release-group", releaseGroupId]]) {
		if (!id) continue;
		try {
			const data = await httpJson(`https://coverartarchive.org/${type}/${id}`);
			const front = (data.images ?? []).find((img) => img.front);
			if (front) {
				return {
					// CAA returns some image URLs as plain http:, which iOS
					// refuses outright — the archive serves https fine
					url: String(front.thumbnails?.large ?? front.image).replace(/^http:/, "https:"),
					sourcePage: `https://musicbrainz.org/${type}/${id}/cover-art`,
				};
			}
		} catch {
			// try the next type
		}
	}
	return null;
}

// MusicBrainz recording length comes back in milliseconds; format as m:ss.
function formatDuration(ms) {
	if (!ms) return null;
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Finds this song's own track within a release's tracklist (exact match first,
// then substring, to tolerate "Song (Remastered)" style listings).
function findTrack(releaseData, songTitle) {
	const allTracks = (releaseData.media ?? []).flatMap((m) => m.tracks ?? []);
	const lower = songTitle.toLowerCase();
	return (
		allTracks.find((t) => t.title?.toLowerCase() === lower) ??
		allTracks.find((t) => t.title?.toLowerCase().includes(lower))
	);
}

// The custom header block: cover art (+ attribution caption) on the left,
// Song title + a list of whatever fields are actually present on the right
// (Artist/Album/Label/Genre/Duration/Tuning/Capo — any that are empty are
// simply omitted rather than shown as "-", since this note may never have
// been run through MusicBrainz). Reads live from the note's own frontmatter.
// Built as an array-of-lines + join so we don't have to escape backticks for
// the ``` fence.
const SONG_HEADER_BLOCK = [
	"```datacorejsx",
	"return function View() {",
	"    const page = dc.useCurrentFile();",
	"",
	'    const cover = page.value("Cover");',
	"    // Cover is a remote URL or a vault-relative path (downloaded cover);",
	"    // local paths must resolve to an app:// resource URL for <img>",
	'    const coverSrc = cover && !/^https?:\\/\\//.test(cover) ? dc.app.vault.adapter.getResourcePath(cover) : cover;',
	'    const coverSource = page.value("CoverSource");',
	"",
	"    // hostname of a URL, or the raw string when it isn't a valid URL —",
	"    // a malformed frontmatter value must never crash the whole header",
	"    const hostnameOf = url => {",
	'        try { return new URL(url).hostname.replace(/^www\\./, ""); } catch { return String(url); }',
	"    };",
	"",
	"    // attribution label follows the CoverSource domain (enrichment uses the",
	"    // Cover Art Archive, but e.g. a hand-picked Unsplash cover links there)",
	"    const coverSourceLabel = coverSource",
	'        ? (String(coverSource).includes("musicbrainz") ? "Cover Art Archive"',
	'        : String(coverSource).includes("unsplash") ? "Unsplash"',
	"        : hostnameOf(coverSource))",
	"        : null;",
	'    const artist = dc.coerce.array(page.value("Artist") ?? []).join(", ");',
	'    const album = dc.coerce.array(page.value("Album") ?? []).join(", ");',
	'    const genre = dc.coerce.array(page.value("Genre") ?? []).join(", ");',
	'    const year = page.value("Release Year");',
	'    const label = page.value("Label");',
	'    const duration = page.value("Duration");',
	'    const tuning = page.value("Tuning");',
	'    const capo = page.value("Capo");',
	'    const favorite = page.value("Favorite") === true;',
	'    const listen = dc.coerce.array(page.value("Listen") ?? []).map(String);',
	'    const tabbedBy = page.value("Originally Tabbed By");',
	'    const tabSource = page.value("Tab Source");',
	'    const key = page.value("Key");',
	"    // which interpretation/arrangement this note holds, when the song has",
	'    // more than one note ("Drop D, simplified") — one note per interpretation',
	'    const version = page.value("Version");',
	"    const capoFret = parseInt(capo, 10) || 0;",
	'    const [keyStatus, setKeyStatus] = dc.useState("");',
	"",
	"    // in-note trigger for enrichment — same Templater command the hotkey",
	"    // fires, so it also works on mobile where there are no hotkeys. Hidden",
	"    // when the command isn't registered (Templater missing/unconfigured).",
	'    const ENRICH_COMMAND = "templater-obsidian:Templates/Scripts/Enrich Song.md";',
	"    const canEnrich = !!dc.app.commands?.findCommand?.(ENRICH_COMMAND);",
	"",
	"    // --- key detection (self-contained; runs on demand from the header link) ---",
	"    // Scores the note's chord progression against all 24 major/minor keys by",
	"    // diatonic membership; heuristic, so the result is written to frontmatter",
	"    // where it can simply be corrected by hand if the guess is off.",
	'    const PC = { C:0, "C#":1, Db:1, D:2, "D#":3, Eb:3, E:4, "E#":5, F:5, "F#":6, Gb:6, G:7, "G#":8, Ab:8, A:9, "A#":10, Bb:10, B:11, Cb:11, "B#":0 };',
	'    const KEY_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];',
	'    const KEY_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];',
	"",
	"    const parseChord = word => {",
	"        const m = /^([A-G][#b]?)([A-Za-z0-9#b+°]*)?(?:\\/[A-G][#b]?)?$/.exec(word);",
	"        if (!m || PC[m[1]] === undefined) return null;",
	'        const q = m[2] ?? "";',
	'        const cls = /^(dim|°|m7b5)/.test(q) ? "dim"',
	'            : /^(m|min)(?!aj)/.test(q) ? "min"',
	'            : /^(7|9|11|13)/.test(q) ? "dom"',
	'            : "maj";',
	'        return { pc: PC[m[1]], cls, acc: m[1].includes("#") ? 1 : m[1].includes("b") ? -1 : 0 };',
	"    };",
	"",
	"    // chord lines = lines in a ```chords block where most words parse as chords",
	"    const extractChords = content => {",
	"        const tokens = [];",
	"        for (const m of content.matchAll(/```chords\\n([\\s\\S]*?)```/g)) {",
	'            for (const line of m[1].split("\\n")) {',
	"                if (/^\\s*\\[/.test(line)) continue; // [Verse] section markers",
	"                const words = line.trim().split(/\\s+/).filter(Boolean);",
	"                if (words.length === 0) continue;",
	"                const parsed = words.map(parseChord).filter(Boolean);",
	"                if (parsed.length >= words.length * 0.6) tokens.push(...parsed);",
	"            }",
	"        }",
	"        return tokens;",
	"    };",
	"",
	"    // diatonic chord quality by semitone offset from the tonic",
	'    const MAJOR_KEY = { 0:"maj", 2:"min", 4:"min", 5:"maj", 7:"maj", 9:"min", 11:"dim" };',
	'    const MINOR_KEY = { 0:"min", 2:"dim", 3:"maj", 5:"min", 7:"min", 8:"maj", 10:"maj" };',
	"",
	"    const bestKey = tokens => {",
	"        // spell the result the way the sheet spells its chords (G#m, not Abm)",
	"        const flats = tokens.filter(t => t.acc < 0).length;",
	"        const sharps = tokens.filter(t => t.acc > 0).length;",
	"        const names = flats > sharps ? KEY_NAMES_FLAT : KEY_NAMES_SHARP;",
	"        let best = null, bestScore = -1;",
	"        for (let tonic = 0; tonic < 12; tonic++) {",
	'            for (const mode of ["maj", "min"]) {',
	'                const table = mode === "maj" ? MAJOR_KEY : MINOR_KEY;',
	"                let score = 0;",
	"                tokens.forEach((t, i) => {",
	"                    const off = (t.pc - tonic + 12) % 12;",
	"                    const expected = table[off];",
	"                    let points = 0;",
	"                    if (expected === t.cls) points = 2;",
	'                    else if (expected === "maj" && t.cls === "dom") points = 1.5; // dominant 7th on a major degree',
	'                    else if (mode === "min" && off === 7 && (t.cls === "maj" || t.cls === "dom")) points = 2; // harmonic-minor V',
	"                    else if (expected !== undefined) points = 0.5; // right root, unexpected quality",
	"                    if (off === 0 && (i === 0 || i === tokens.length - 1) && points >= 1.5) points += 3; // opening/closing tonic",
	"                    score += points;",
	"                });",
	'                if (score > bestScore) { bestScore = score; best = names[tonic] + (mode === "min" ? "m" : ""); }',
	"            }",
	"        }",
	"        return best;",
	"    };",
	"",
	"    const detectKey = async () => {",
	"        const file = dc.app.vault.getFileByPath(page.$path);",
	"        if (!file) return;",
	"        const content = await dc.app.vault.read(file);",
	"        const tokens = extractChords(content);",
	'        if (tokens.length < 3) { setKeyStatus("no chord lines found to analyze"); return; }',
	"        const detected = bestKey(tokens);",
	'        if (!detected) { setKeyStatus("couldn\'t determine a key"); return; }',
	"        // writing frontmatter re-renders the header: the Key row replaces this link",
	"        await dc.app.fileManager.processFrontMatter(file, fm => { fm.Key = detected; });",
	"    };",
	"",
	"    // what the shapes sound like once the capo is on",
	"    const soundingKey = (() => {",
	"        if (!key || !capoFret) return null;",
	"        const m = /^([A-G][#b]?)(m?)/.exec(String(key));",
	"        if (!m || PC[m[1]] === undefined) return null;",
	'        const names = m[1].includes("b") ? KEY_NAMES_FLAT : KEY_NAMES_SHARP;',
	"        return names[(PC[m[1]] + capoFret) % 12] + m[2];",
	"    })();",
	"",
	"    // human label for a streaming URL, matched by hostname — not substring,",
	"    // so a URL that merely contains a service's name isn't labeled as it",
	"    const serviceName = url => {",
	"        const host = hostnameOf(url); // already strips www.",
	'        const at = domain => host === domain || host.endsWith("." + domain);',
	'        return at("open.spotify.com") ? "Spotify" :',
	'            at("music.apple.com") || at("itunes.apple.com") ? "Apple Music" :',
	'            at("bandcamp.com") ? "Bandcamp" :',
	'            at("youtube.com") || at("youtu.be") ? "YouTube" :',
	'            at("soundcloud.com") ? "SoundCloud" :',
	'            at("tidal.com") ? "Tidal" :',
	'            at("deezer.com") ? "Deezer" :',
	"            host;",
	"    };",
	"",
	"    // only render rows for fields that actually have a value",
	"    const fields = [",
	'        ["Artist", artist],',
	'        ["Album", year ? `${album} (${year})` : album],',
	'        ["Label", label],',
	'        ["Genre", genre],',
	'        ["Duration", duration],',
	'        ["Tuning", tuning],',
	'        ["Capo", capo],',
	"        // with a capo on, also show what the shapes actually sound like",
	'        ["Key", key ? (soundingKey ? `${key} (sounds as ${soundingKey} with capo ${capoFret})` : key) : null],',
	"    ].filter(([, value]) => value);",
	"",
	"    return (",
	"        <>",
	'            <div style={{ display: "flex", gap: "1.5em", alignItems: "flex-start", marginBottom: "1.5em" }}>',
	"                {cover && (",
	'                    <div style={{ flexShrink: 0 }}>',
	"                        <img",
	"                            src={coverSrc}",
	'                            style={{ width: "160px", height: "160px", objectFit: "cover", borderRadius: "6px" }}',
	"                        />",
	'                        <div style={{ fontSize: "0.75em", color: "var(--text-muted)", marginTop: "0.25em", maxWidth: "160px" }}>',
	"                            Cover art © respective rights holder",
	"                            {coverSourceLabel && <>, via <a href={coverSource}>{coverSourceLabel}</a></>}",
	"                        </div>",
	"                    </div>",
	"                )}",
	'                <div style={{ display: "flex", flexDirection: "column", gap: "0.3em" }}>',
	'                    <h1 style={{ margin: 0, fontSize: "1.4em" }}>',
	'                        {favorite ? "❤️ " : ""}{page.value("Song") ?? page.$name}',
	"                    </h1>",
	"                    {version && (",
	'                        <div style={{ fontSize: "0.9em", color: "var(--text-muted)", fontStyle: "italic" }}>{version}</div>',
	"                    )}",
	"                    {fields.map(([fieldName, value]) => (",
	"                        <div key={fieldName}><strong>{fieldName}:</strong> {value}</div>",
	"                    ))}",
	"                    {listen.length > 0 && (",
	"                        <div>",
	'                            <strong>Listen:</strong>{" "}',
	"                            {listen.map((url, i) => (",
	'                                <span key={url}>{i > 0 ? " · " : ""}<a href={url}>{serviceName(url)}</a></span>',
	"                            ))}",
	"                        </div>",
	"                    )}",
	"                    {(tabbedBy || tabSource) && (",
	"                        <div>",
	'                            <strong>Original tab:</strong>{" "}',
	'                            {tabSource ? <a href={tabSource}>{tabbedBy || "source"}</a> : tabbedBy}',
	"                        </div>",
	"                    )}",
	'                    <div style={{ fontSize: "0.85em", color: "var(--text-muted)", marginTop: "0.2em", display: "flex", gap: "14px", flexWrap: "wrap" }}>',
	"                        {canEnrich && (",
	'                            <a onClick={() => dc.app.commands.executeCommandById(ENRICH_COMMAND)} style={{ cursor: "pointer" }}>⟳ Enrich metadata</a>',
	"                        )}",
	"                        {!key && (",
	"                            <span>",
	'                                <a onClick={detectKey} style={{ cursor: "pointer" }}>♪ Detect key from chords</a>',
	"                                {keyStatus ? <span> — {keyStatus}</span> : null}",
	"                            </span>",
	"                        )}",
	"                    </div>",
	"                </div>",
	"            </div>",
	"            <hr/>",
	"        </>",
	"    );",
	"}",
	"```",
	"",
].join("\n");

// Inserts (or leaves alone) the header block right after the frontmatter.
// Cleans up a plain "![Cover](...)" embed left by an older version of this
// script, and skips re-inserting if the header block is already present —
// it reads live from frontmatter, so it never goes stale and doesn't need
// to be rewritten on every run.
async function insertSongHeader(file) {
	await app.vault.process(file, (content) => {
		const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
		const fmEnd = fmMatch ? fmMatch[0].length : 0;
		let body = content.slice(fmEnd);

		if (body.includes("dc.useCurrentFile()")) return content;

		// Remove a leftover plain cover embed from an older version of this script.
		body = body.replace(/^!\[Cover\]\([^\n]*\)\n\n?/, "");

		return content.slice(0, fmEnd) + "\n" + SONG_HEADER_BLOCK + "\n" + body;
	});
}

async function resolveFromReleaseGroup(tp, artist, album, song) {
	const { results, query } = await mbSearchReleaseGroups(artist, album);
	if (results.length === 0) return { notFoundQuery: query };

	const choice =
		results.length === 1
			? results[0]
			: await tp.system.suggester(results.map((r) => `${r.title} (${r["first-release-date"]?.slice(0, 4) ?? "?"})`), results);
	if (!choice) return null;

	const rgDetails = await getReleaseGroupDetails(choice.id);
	const releases = (rgDetails.releases ?? []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
	const release = releases[0];

	// Only use MusicBrainz's curated "genres" list, not raw folksonomy "tags" —
	// tags are arbitrary free text anyone can submit and are frequently junk
	// (URLs, in-jokes, unrelated notes), whereas genres are drawn from a fixed,
	// curated vocabulary. Better to leave Genre blank than show garbage.
	const genres = (rgDetails.genres ?? [])
		.slice()
		.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
		.slice(0, 3)
		.map((g) => g.name)
		.filter((name) => name && !/[:/]/.test(name)); // extra guard against stray junk entries

	// Streaming links, gathered from three levels and merged with the most
	// song-specific source winning per service: recording > release >
	// release-group. Coverage on MusicBrainz is patchy (older physical releases
	// often carry none), so an empty result is normal and just means no
	// Listen property gets written.
	const listenByService = new Map();
	const mergeListen = (map) => {
		for (const [name, url] of map) if (!listenByService.has(name)) listenByService.set(name, url);
	};

	let label = null;
	let duration = null;
	if (release) {
		const releaseData = await getReleaseTracklist(release.id);
		label = releaseData["label-info"]?.[0]?.label?.name ?? null;
		const track = findTrack(releaseData, song);
		duration = formatDuration(track?.length);
		if (track?.recording?.id) {
			try {
				const recordingData = await getRecordingUrlRels(track.recording.id);
				mergeListen(streamingLinks(recordingData.relations));
			} catch {
				// recording lookup is best-effort; release/release-group rels still apply
			}
		}
		mergeListen(streamingLinks(releaseData.relations));
	}
	mergeListen(streamingLinks(rgDetails.relations));

	const year = release?.date?.slice(0, 4) ?? choice["first-release-date"]?.slice(0, 4) ?? "";
	const cover = await coverArtUrl(release?.id, choice.id);

	return { album: choice.title, year, genres, label, duration, cover, listen: [...listenByService.values()], rgid: choice.id };
}

module.exports = async function enrichSongNote(tp) {
	const file = app.workspace.getActiveFile();
	if (!file) return;

	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter ?? {};

	const existingArtist = Array.isArray(fm.Artist) ? fm.Artist[0] : fm.Artist;
	const existingAlbum = Array.isArray(fm.Album) ? fm.Album[0] : fm.Album;
	// String() because YAML parses titles like 1979 as numbers, and
	// findTrack/search code calls string methods on this
	const song = String(fm.Song ?? file.basename);

	// Keep Artists/ pages in sync as a side effect of enrichment: any artist
	// already in frontmatter gets its page created here (quiet mode — only
	// notifies when it actually creates one). Done up front, before the
	// Artist+Album completeness check, so it runs on every exit path.
	if (existingArtist) await tp.user.syncArtistPages(tp, { quiet: true });

	// per-note source override; unknown values are rejected rather than
	// silently treated as the default
	const source = String(fm["Metadata Source"] ?? DEFAULT_METADATA_SOURCE).trim().toLowerCase();
	if (source === "none") {
		await insertSongHeader(file);
		new Notice('Metadata Source is "none" — header refreshed, no external lookup.');
		return;
	}
	if (source !== "musicbrainz") {
		new Notice(`Unknown Metadata Source "${source}" — supported: "musicbrainz" or "none".`);
		return;
	}

	// Artist, Song, and Album all need to be set before we bother MusicBrainz —
	// searching on anything less turned out to be too unreliable. If they're not
	// all there yet, don't prompt and don't touch frontmatter; just make sure the
	// header block reflects whatever IS already filled in.
	if (!existingArtist || !existingAlbum || !song) {
		new Notice("Artist, Song, and Album must all be set to look up MusicBrainz data — leaving fields as-is.");
		await insertSongHeader(file);
		return;
	}

	new Notice(`Searching MusicBrainz for "${existingArtist} - ${existingAlbum}"…`);

	const result = await resolveFromReleaseGroup(tp, existingArtist, existingAlbum, song);

	if (!result) return; // user cancelled the picker
	if (result.notFoundQuery) {
		new Notice(`No MusicBrainz results. Last query tried: ${result.notFoundQuery}`);
		await insertSongHeader(file);
		return;
	}

	const { album, year, genres, label, duration, cover, listen, rgid } = result;

	// Cover resolution, cheapest first: (1) another song of the same album
	// (Album MBID match) with a local cover; (2) the deterministic covers file
	// already on disk; (3) download from the Cover Art Archive. Reuse also
	// rescues the case where the CAA is unreachable but the album's art
	// already lives in the vault. All of it happens before processFrontMatter,
	// whose callback must stay synchronous.
	let coverValue = cover?.url ?? null;
	let coverSourceValue = cover?.sourcePage ?? null;
	if (DOWNLOAD_COVERS) {
		const existing =
			findExistingCover(rgid, file.path) ??
			coverFileOnDisk(`${existingArtist} - ${album ?? existingAlbum}`);
		if (existing) {
			coverValue = existing.cover;
			coverSourceValue = existing.coverSource ?? coverSourceValue;
		} else if (cover) {
			try {
				coverValue = await downloadCover(cover.url, `${existingArtist} - ${album ?? existingAlbum}`);
			} catch (err) {
				new Notice(`Cover download failed (${err.message}) — keeping the remote URL.`);
			}
		}
	}

	await app.fileManager.processFrontMatter(file, (f) => {
		f.Artist = existingArtist;
		if (album) f.Album = album;
		if (year) f["Release Year"] = year;
		if (genres.length > 0) f.Genre = genres;
		if (label) f.Label = label;
		if (duration) f.Duration = duration;
		if (listen.length > 0) f.Listen = listen;
		if (coverValue) f.Cover = coverValue;
		if (coverSourceValue) f.CoverSource = coverSourceValue;
		if (rgid) f["Album MBID"] = rgid; // enables cover reuse across songs of one album
	});

	await insertSongHeader(file);

	new Notice(`Updated "${file.basename}" from MusicBrainz`);
};

// Exposed for the offline test suite (tools/tests/, plain Node, no Obsidian).
// Templater only ever calls the exported function, so extra properties on it
// are inert inside Obsidian.
module.exports.__test__ = {
	matchStreamingService,
	streamingLinks,
	formatDuration,
	findTrack,
	coverArtUrl,
	mbSearchReleaseGroups,
	resolveFromReleaseGroup,
	insertSongHeader,
	SONG_HEADER_BLOCK,
};