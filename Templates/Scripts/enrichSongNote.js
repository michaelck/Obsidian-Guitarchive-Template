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
//     match, then pulls Release Year, Album Type, Genre, Label, Duration,
//     Track (this song's position on the release, "4 of 11"), cover art, and
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

// Thrown for HTTP error responses; carries .status so callers can tell a
// genuine 404 ("this thing doesn't exist") from an outage (5xx etc.).
class HttpError extends Error {
	constructor(status, url) {
		super(`HTTP ${status} from ${url}`);
		this.status = status;
	}
}

async function httpJson(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }, throw: false });
		if (res.status >= 400) throw new HttpError(res.status, url);
		return res.json;
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
	if (!res.ok) throw new HttpError(res.status, url);
	return res.json();
}

async function httpBinary(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT }, throw: false });
		if (res.status >= 400) throw new HttpError(res.status, url);
		return { data: res.arrayBuffer, contentType: res.headers?.["content-type"] ?? "" };
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok) throw new HttpError(res.status, url);
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

// All distinct labels a release-group appeared on, gathered in one browse call
// across every release in the group. "[no label]" is MusicBrainz's special
// self-published / white-label entity, not a real label name — it's omitted,
// so a group with only "[no label]" releases yields an empty list. Labels are
// ordered by the earliest release date each appears on (original label first,
// reissue labels after), ties alphabetical — MB's browse order isn't
// date-sorted, so this keeps the list deterministic across re-runs instead of
// reshuffling the frontmatter each time.
async function getReleaseGroupLabels(rgid) {
	const url = `https://musicbrainz.org/ws/2/release?release-group=${rgid}&fmt=json&inc=labels&limit=100`;
	const data = await mbFetch(url);
	const earliestByLabel = new Map();
	for (const release of data.releases ?? []) {
		const date = release.date || "9999"; // undated releases sort last
		for (const info of release["label-info"] ?? []) {
			const name = info.label?.name;
			if (!name || name === "[no label]") continue;
			if (!earliestByLabel.has(name) || date < earliestByLabel.get(name)) earliestByLabel.set(name, date);
		}
	}
	return [...earliestByLabel.keys()].sort((a, b) => earliestByLabel.get(a).localeCompare(earliestByLabel.get(b)) || a.localeCompare(b));
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
	// A CAA 404 means "no cover art exists for this entity" — normal, stay
	// quiet. Anything else (5xx, network failure) means the archive is
	// unreachable, which must not look identical to "no art": say so, so the
	// user knows to re-run Enrich Song later instead of assuming a blank.
	let outage = null;
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
		} catch (err) {
			if (err?.status !== 404) outage = err; // try the next type either way
		}
	}
	if (outage) {
		const reason = outage.status ? `HTTP ${outage.status}` : outage.message;
		new Notice(`Cover Art Archive unreachable (${reason}) — no cover saved. Re-run Enrich Song later.`);
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
// then substring, to tolerate "Song (Remastered)" style listings). Each track
// carries its medium's track-count alongside its own position, so callers can
// build a "4 of 11" label without a second lookup.
function findTrack(releaseData, songTitle) {
	const allTracks = (releaseData.media ?? []).flatMap((m) =>
		(m.tracks ?? []).map((t) => ({ ...t, mediumTrackCount: m["track-count"] ?? (m.tracks ?? []).length }))
	);
	const lower = songTitle.toLowerCase();
	return (
		allTracks.find((t) => t.title?.toLowerCase() === lower) ??
		allTracks.find((t) => t.title?.toLowerCase().includes(lower))
	);
}

// The note body is just a tiny loader stub: it dc.requires the real header
// component from Templates/Scripts/song-header-view.jsx and renders it,
// passing the block's own `dc` so every hook (useCurrentFile, useQuery, and
// so on) resolves against THIS note. Keeping the component in one shared
// .jsx file means notes no longer each embed ~280 lines of JSX (unpleasant
// to edit) and a header redesign is a single-file edit instead of a per-note
// block migration. The tradeoff: every song note depends on that .jsx
// existing at this path. Still an array-of-lines + join so extract-blocks /
// migrate-blocks keep working and so we don't have to escape the ``` fence.
const SONG_HEADER_BLOCK = [
	"```datacorejsx",
	'const { SongHeader } = await dc.require(dc.fileLink("Templates/Scripts/song-header-view.jsx"));',
	"return function View() {",
	"    return <SongHeader dc={dc} />;",
	"}",
	"```",
	"",
].join("\n")

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

		// skip if our block is already present — either the new loader stub
		// (references the shared .jsx) or a legacy inline block (useCurrentFile)
		if (body.includes("song-header-view.jsx") || body.includes("dc.useCurrentFile()")) return content;

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

	// Label is a group-level fact, not a release-level one: an album can come
	// out on several labels (4AD + Saddle Creek…), so gather every distinct
	// real label across the group rather than picking one release's label and
	// discarding the rest. (The earliest release below still supplies the
	// per-release facts — Duration/Track/streaming/cover — that genuinely are
	// release-specific.)
	const labels = await getReleaseGroupLabels(choice.id);

	let duration = null;
	let trackPosition = null;
	if (release) {
		const releaseData = await getReleaseTracklist(release.id);
		const track = findTrack(releaseData, song);
		duration = formatDuration(track?.length);
		if (track?.position && track?.mediumTrackCount) trackPosition = `${track.position} of ${track.mediumTrackCount}`;
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
	// release-group primary type (Album/EP/Single/Live/Compilation); secondary
	// types (e.g. "Compilation" alongside "Album") are deliberately ignored —
	// primary type alone is enough for album-vs-EP grouping
	const albumType = rgDetails["primary-type"] ?? null;

	return { album: choice.title, year, genres, labels, duration, track: trackPosition, albumType, cover, listen: [...listenByService.values()], rgid: choice.id };
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

	const { album, year, genres, labels, duration, track, albumType, cover, listen, rgid } = result;

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
		// Always a list, like Genre/Listen — Label is registered "multitext" in
		// .obsidian/types.json, so writing a bare string for a single label
		// would trip Obsidian's "expected Text/List" type-mismatch warning
		if (labels.length > 0) f.Label = labels;
		if (duration) f.Duration = duration;
		if (track) f.Track = track;
		if (albumType) f["Album Type"] = albumType;
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
	getReleaseGroupLabels,
	resolveFromReleaseGroup,
	insertSongHeader,
	SONG_HEADER_BLOCK,
};