// Templater user script: enrich the ACTIVE artist page — streaming/homepage
// links from MusicBrainz, plus a Wikipedia bio and one-line descriptor.
//
// Setup (same pattern as the other scripts):
//   - Save as Templates/Scripts/enrichArtistPage.js
//   - Trigger template Templates/Scripts/Enrich Artist.md containing:
//       <%* await tp.user.enrichArtistPage(tp) %>
//     run via "Templater: Insert Templater Template" (or bind a hotkey).
//
// How it resolves the bio — MusicBrainz has no prose bios of its own, so:
//   1. Search MusicBrainz artists by the page's Name property. Names here are
//      "Last, First" for people, which matches MB's *sort-name* field, so the
//      query searches both `artist:` and `sortname:`. You pick via suggester
//      if there's more than one plausible match.
//   2. Look up that artist's URL relationships and follow the Wikipedia link
//      directly if there is an English one, otherwise go via Wikidata
//      (QID -> sitelinks -> enwiki title).
//   3. Fetch the article's plain-text summary from Wikipedia's REST API and
//      upsert it into a "## Bio" section (created above "## Notes", so
//      hand-written notes stay separate; re-running replaces the Bio section
//      in place rather than duplicating it).
//
// Frontmatter written: MBID (so re-runs skip the artist search), Listen
// (streaming links from the artist's MB URL relationships — same domain
// whitelist as songs, plus the official homepage; written even when the
// Wikipedia chain dead-ends, since they only need MusicBrainz), Wikipedia
// (the article URL), and Description (Wikipedia's one-line descriptor, shown
// as a subtitle by the artist page block). Wikipedia text is CC BY-SA, so
// the bio ends with a source + license attribution line.

const USER_AGENT = "ObsidianTabVaultEnricher/1.0 (personal vault script)";
const ARTISTS_FOLDER = "Artists";

// Artist photos are downloaded into their own folder, kept separate from song
// cover art (Attachments/Covers). Same personal-archiving caveat as covers:
// the images stay copyrighted (CC BY-SA etc.), so don't push this folder to a
// public repo. Set DOWNLOAD_PHOTOS = false to store just the remote URL.
const DOWNLOAD_PHOTOS = true;
const PHOTOS_FOLDER = "Attachments/Photos";

// Obsidian's requestUrl does HTTP natively, bypassing the webview's CORS and
// mixed-content rules (needed on mobile); falls back to fetch elsewhere.
const obsidianRequestUrl = (() => {
	try {
		return typeof require === "function" ? require("obsidian").requestUrl : null;
	} catch {
		return null;
	}
})();

async function jsonFetch(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT, "Accept": "application/json" }, throw: false });
		if (res.status >= 400) throw new Error(`${res.status} from ${new URL(url).hostname}`);
		return res.json;
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
	if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
	return res.json();
}

// Streaming/store services worth surfacing as "Listen" links — same list and
// matching rules as enrichSongNote.js (each script stays self-contained:
// Templater user scripts can't reliably require each other inside Obsidian).
// MB URL relationships are community-submitted, so match by exact hostname
// (or subdomain), https only — a URL that merely CONTAINS a service's domain
// must not get labeled as that service.
const STREAMING_SERVICES = [
	{ domains: ["open.spotify.com"], name: "Spotify" },
	{ domains: ["music.apple.com", "itunes.apple.com"], name: "Apple Music" },
	{ domains: ["bandcamp.com"], name: "Bandcamp" },
	{ domains: ["youtube.com", "youtu.be"], name: "YouTube" },
	{ domains: ["soundcloud.com"], name: "SoundCloud" },
	{ domains: ["tidal.com"], name: "Tidal" },
	{ domains: ["deezer.com"], name: "Deezer" },
];

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

// Listen links for an artist, from its MB URL relationships: whitelisted
// streaming services (first URL per service wins) plus the "official
// homepage" rel. Deliberately no social links — MB carries rels for every
// social network, and an artist page full of those is noise, not a songbook.
function artistListenLinks(relations) {
	const found = new Map();
	for (const rel of relations ?? []) {
		const url = rel.url?.resource;
		if (!url) continue;
		if (rel.type === "official homepage") {
			if (url.startsWith("https://") && !found.has("homepage")) found.set("homepage", url);
			continue;
		}
		const service = matchStreamingService(url);
		if (service && !found.has(service.name)) found.set(service.name, url);
	}
	return [...found.values()];
}

async function mbSearchArtists(name) {
	const quoted = `"${name.replace(/"/g, "")}"`;
	const query = `artist:${quoted} OR sortname:${quoted}`;
	const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
	return (await jsonFetch(url)).artists ?? [];
}

// English Wikipedia article title for an artist, from its MusicBrainz URL
// relationships: a direct en.wikipedia link if present (older entries),
// otherwise via the artist's Wikidata entity's enwiki sitelink.
async function wikipediaTitle(relations) {
	const rels = relations ?? [];

	const wp = rels.find((r) => r.type === "wikipedia" && /en\.wikipedia\.org\/wiki\//.test(r.url?.resource ?? ""));
	if (wp) return decodeURIComponent(wp.url.resource.split("/wiki/")[1]).replace(/_/g, " ");

	const wd = rels.find((r) => r.type === "wikidata" && r.url?.resource);
	const qid = wd?.url.resource.match(/(Q\d+)/)?.[1];
	if (!qid) return null;
	const data = await jsonFetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
	return data.entities?.[qid]?.sitelinks?.enwiki?.title ?? null;
}

async function wikipediaSummary(title) {
	const slug = encodeURIComponent(title.replace(/ /g, "_"));
	return jsonFetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`);
}

// Binary download (mirrors enrichSongNote's httpBinary — each script stays
// self-contained). requestUrl on mobile, fetch elsewhere.
async function binaryFetch(url) {
	if (obsidianRequestUrl) {
		const res = await obsidianRequestUrl({ url, headers: { "User-Agent": USER_AGENT }, throw: false });
		if (res.status >= 400) throw new Error(`${res.status} from ${new URL(url).hostname}`);
		return { data: res.arrayBuffer, contentType: res.headers?.["content-type"] ?? "" };
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
	return { data: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "" };
}

// Downloads an image into `folder` and returns its vault path. Extension from
// Content-Type; filename sanitized. Overwrites on re-enrich. (Mirrors
// enrichSongNote's downloadCover, generalized over the target folder.)
async function downloadImage(url, baseName, folder) {
	const { data, contentType } = await binaryFetch(url);
	const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : contentType.includes("webp") ? "webp" : "jpg";

	// create the folder chain one level at a time (createFolder isn't recursive)
	let parent = "";
	for (const segment of folder.split("/")) {
		parent = parent ? `${parent}/${segment}` : segment;
		if (!app.vault.getAbstractFileByPath(parent)) {
			await app.vault.createFolder(parent).catch(() => {});
		}
	}

	const path = `${folder}/${baseName.replace(/[\\/:*?"<>|]/g, "-")}.${ext}`;
	await app.vault.adapter.writeBinary(path, data);
	return path;
}

// The Commons File name embedded in an upload.wikimedia.org URL, for both
// full-size (…/commons/x/xx/Name.ext) and thumbnail
// (…/commons/thumb/x/xx/Name.ext/NNNpx-Name.ext) forms.
function commonsFileName(url) {
	try {
		const { pathname } = new URL(url);
		const m = pathname.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
		return m ? decodeURIComponent(m[1]) : null;
	} catch {
		return null;
	}
}

// Resolves the artist's lead image from a Wikipedia REST summary. The summary
// already carries the image URL (originalimage/thumbnail), so no extra API
// call is needed: a URL under /wikipedia/commons/ is Commons-hosted, which
// makes its File description page a reliable attribution target (author +
// license live there). Non-Commons (local-wiki) images are skipped rather than
// mis-attributed. Returns { image, source } or null. The thumbnail is
// preferred for storage (a page photo doesn't need the multi-megapixel
// original); the File name is derived from whichever URL is Commons-hosted.
async function resolveArtistPhoto(summary, baseName) {
	const original = summary.originalimage?.source;
	const thumb = summary.thumbnail?.source;
	const commonsUrl = [original, thumb].find((u) => u && /\/wikipedia\/commons\//.test(u));
	if (!commonsUrl) return null; // no image, or a non-Commons image

	const fileName = commonsFileName(commonsUrl);
	if (!fileName) return null;
	const source = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`;

	let image = thumb ?? original; // store the smaller rendition
	if (DOWNLOAD_PHOTOS) {
		try {
			image = await downloadImage(image, baseName, PHOTOS_FOLDER);
		} catch {
			// download best-effort; fall back to the remote URL
		}
	}
	return { image, source };
}

// Managed sections, in the order they should appear on the page. Everything
// below the last of these (## Notes) is hand-written and untouched. The
// discography is NOT a body section — it's a frontmatter list rendered by the
// artist page block (so it can offer a live expand-to-your-songs toggle, the
// same pattern as the song header's "more from this album").
const SECTION_ORDER = ["## Bio", "## Notes"];

// Replaces an existing `heading` section in place, or inserts it in the right
// spot: before the first later section in SECTION_ORDER that's present (so Bio
// lands above Notes regardless of write order), falling back to appending at
// the end. Must stay synchronous — it runs inside app.vault.process().
function upsertSection(content, heading, body) {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const existing = new RegExp(`${escaped}\\n[\\s\\S]*?(?=\\n## |\\s*$)`);
	if (existing.test(content)) return content.replace(existing, body.trimEnd() + "\n");

	const idx = SECTION_ORDER.indexOf(heading);
	const followers = idx === -1 ? ["## Notes"] : SECTION_ORDER.slice(idx + 1);
	for (const follower of followers) {
		const at = content.indexOf(follower);
		if (at !== -1) return content.slice(0, at) + body.trimEnd() + "\n\n" + content.slice(at);
	}
	return content.trimEnd() + "\n\n" + body.trimEnd() + "\n";
}

// Bio is one such section; kept as a named wrapper for readability at the call
// site (and the test suite).
function upsertBioSection(content, bioSection) {
	return upsertSection(content, "## Bio", bioSection);
}

// All of an artist's Album/EP release-groups from MusicBrainz, paginated. The
// `type` browse filter narrows to primary-type Album/EP server-side; the
// client-side primary-type check is a belt-and-suspenders guard in case the
// filter is ignored.
async function getArtistReleaseGroups(mbid) {
	const groups = [];
	const LIMIT = 100;
	for (let offset = 0; offset < 1000; offset += LIMIT) {
		const url = `https://musicbrainz.org/ws/2/release-group?artist=${mbid}&type=album|ep&fmt=json&limit=${LIMIT}&offset=${offset}`;
		const data = await jsonFetch(url);
		const batch = data["release-groups"] ?? [];
		groups.push(...batch);
		const total = data["release-group-count"] ?? groups.length;
		if (batch.length === 0 || offset + LIMIT >= total) break;
	}
	return groups;
}

// Encodes an artist's Album/EP release-groups as compact "year|title|type|rgid"
// strings for the `Discography` frontmatter list: primary-type Album/EP with
// NO secondary types (drops compilations, live albums, remixes, bootlegs),
// sorted by first-release-date. The artist page block parses these and, for
// release-groups the vault has songs from (matched on `rgid` === a song's
// `Album MBID`), renders a live expand-to-your-songs toggle. Pipes in titles
// are swapped for "/" so they can't break the delimiter.
function buildDiscographyList(groups) {
	return (groups ?? [])
		.filter((rg) => ["Album", "EP"].includes(rg["primary-type"]))
		.filter((rg) => (rg["secondary-types"] ?? []).length === 0)
		.map((rg) => ({
			year: (rg["first-release-date"] ?? "").slice(0, 4),
			title: String(rg.title ?? "").replace(/\|/g, "/"),
			type: rg["primary-type"],
			id: rg.id,
		}))
		.sort((a, b) => (a.year || "9999").localeCompare(b.year || "9999") || a.title.localeCompare(b.title))
		.map((e) => `${e.year}|${e.title}|${e.type}|${e.id}`);
}

module.exports = async function enrichArtistPage(tp) {
	const file = app.workspace.getActiveFile();
	if (!file || !file.path.startsWith(`${ARTISTS_FOLDER}/`)) {
		new Notice("Open an artist page (Artists/) first.");
		return;
	}

	const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
	const name = String(fm.Name ?? file.basename); // String(): YAML can hand back numbers

	// same opt-out as song notes: an unpublished/original artist won't be in
	// MusicBrainz or Wikipedia, so don't go looking
	if (String(fm["Metadata Source"] ?? "").trim().toLowerCase() === "none") {
		new Notice(`"${name}" has Metadata Source: none — skipping the MusicBrainz/Wikipedia lookup.`);
		return;
	}

	// a stored MBID (from a previous run) skips the search + picker entirely
	let mbid = fm.MBID;
	if (!mbid) {
		new Notice(`Searching MusicBrainz artists for "${name}"…`);
		const results = await mbSearchArtists(name);
		if (results.length === 0) {
			new Notice(`No MusicBrainz artist found for "${name}".`);
			return;
		}
		const choice =
			results.length === 1
				? results[0]
				: await tp.system.suggester(
						results.map((r) =>
							[r.name, r.disambiguation, r.area?.name].filter((part) => part).join(" — ")
						),
						results
				  );
		if (!choice) return; // user cancelled the picker
		mbid = choice.id;
	}

	const details = await jsonFetch(`https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=url-rels`);

	// MBID is confirmed and the url-rels are already fetched, so save the MBID
	// and any streaming links now — they don't depend on the Wikipedia chain
	// below panning out. An artist with no whitelisted links writes no Listen.
	const listen = artistListenLinks(details.relations);
	await app.fileManager.processFrontMatter(file, (f) => {
		f.MBID = mbid;
		if (listen.length > 0) f.Listen = listen;
	});

	// Discography — MB Album/EP release-groups, stored as a frontmatter list
	// the artist page block renders (with a live expand-to-your-songs toggle
	// per owned album). Depends only on the MBID, not the Wikipedia chain
	// below, so an artist with no article still gets one. Best-effort.
	let savedDiscography = "";
	try {
		const discography = buildDiscographyList(await getArtistReleaseGroups(mbid));
		if (discography.length > 0) {
			await app.fileManager.processFrontMatter(file, (f) => {
				f.Discography = discography;
			});
			savedDiscography = " + discography";
		}
	} catch {
		// a discography failure shouldn't block the bio/photo below
	}

	// what's already been saved from MusicBrainz alone, for the notices on the
	// Wikipedia-less exit paths below
	const mbSaved = [listen.length > 0 ? `${listen.length} listen link(s)` : null, savedDiscography ? "discography" : null].filter(Boolean).join(" + ");

	const title = await wikipediaTitle(details.relations);
	if (!title) {
		new Notice(`MusicBrainz has no Wikipedia/Wikidata link for ${details.name ?? name}.${mbSaved ? ` Saved ${mbSaved}.` : ""}`);
		return;
	}

	const summary = await wikipediaSummary(title);
	if (summary.type !== "standard" || !summary.extract) {
		new Notice(`Wikipedia page "${title}" has no usable summary (${summary.type}).${mbSaved ? ` Saved ${mbSaved}.` : ""}`);
		return;
	}

	// The extract is plain text, but plain text can still contain a literal
	// code fence — which Datacore would EXECUTE if it claimed to be
	// datacorejsx. Neutralize backtick/tilde fence runs before inserting
	// remote content into the note body.
	const extract = summary.extract.replace(/[`~]{3,}/g, "'''");

	const pageUrl = summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;
	const bioSection = [
		"## Bio",
		"",
		extract,
		"",
		`*Source: [Wikipedia](${pageUrl}), text under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).*`,
		"",
	].join("\n");

	await app.vault.process(file, (content) => upsertBioSection(content, bioSection));

	await app.fileManager.processFrontMatter(file, (f) => {
		f.Wikipedia = pageUrl;
		// Wikipedia's one-line descriptor ("American singer-songwriter") —
		// rendered by the artist page block as a subtitle under the title
		if (summary.description) f.Description = summary.description;
	});

	// Artist photo from the Wikipedia lead image (Commons-hosted). Stored in
	// Photo + a PhotoSource link to the Commons file page (author/license live
	// there — same attribution discipline as song CoverSource). Best-effort:
	// no lead image, or a non-Commons one, just means no photo gets written.
	const photo = await resolveArtistPhoto(summary, name);
	let savedPhoto = "";
	if (photo) {
		await app.fileManager.processFrontMatter(file, (f) => {
			f.Photo = photo.image;
			f.PhotoSource = photo.source;
		});
		savedPhoto = " + photo";
	}

	const savedLinks = listen.length > 0 ? ` + ${listen.length} listen link(s)` : "";
	new Notice(`Enriched "${file.basename}": Wikipedia bio${savedLinks}${savedDiscography}${savedPhoto}.`);
};

// Exposed for the offline test suite (tools/tests/) — inert inside Obsidian.
module.exports.__test__ = {
	mbSearchArtists,
	wikipediaTitle,
	upsertBioSection,
	upsertSection,
	artistListenLinks,
	commonsFileName,
	resolveArtistPhoto,
	getArtistReleaseGroups,
	buildDiscographyList,
};
