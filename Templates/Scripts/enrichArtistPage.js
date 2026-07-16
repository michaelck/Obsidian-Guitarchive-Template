// Templater user script: add a Wikipedia bio to the ACTIVE artist page.
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
// Frontmatter written: MBID (so re-runs skip the artist search) and
// Wikipedia (the article URL). Wikipedia text is CC BY-SA, so the bio ends
// with a source + license attribution line.

const USER_AGENT = "ObsidianTabVaultEnricher/1.0 (personal vault script)";
const ARTISTS_FOLDER = "Artists";

async function jsonFetch(url) {
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/json" } });
	if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
	return res.json();
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

// Replaces an existing "## Bio" section, or inserts one above "## Notes"
// (falling back to appending at the end). Must stay synchronous — it runs
// inside app.vault.process().
function upsertBioSection(content, bioSection) {
	const existing = /## Bio\n[\s\S]*?(?=\n## |\s*$)/;
	if (existing.test(content)) return content.replace(existing, bioSection.trimEnd() + "\n");

	const notesIdx = content.indexOf("## Notes");
	if (notesIdx !== -1) return content.slice(0, notesIdx) + bioSection + "\n" + content.slice(notesIdx);
	return content.trimEnd() + "\n\n" + bioSection;
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
	const title = await wikipediaTitle(details.relations);
	if (!title) {
		new Notice(`MusicBrainz has no Wikipedia/Wikidata link for ${details.name ?? name}.`);
		return;
	}

	const summary = await wikipediaSummary(title);
	if (summary.type !== "standard" || !summary.extract) {
		new Notice(`Wikipedia page "${title}" has no usable summary (${summary.type}).`);
		return;
	}

	const pageUrl = summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title.replace(/ /g, "_")}`;
	const bioSection = [
		"## Bio",
		"",
		summary.extract,
		"",
		`*Source: [Wikipedia](${pageUrl}), text under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).*`,
		"",
	].join("\n");

	await app.vault.process(file, (content) => upsertBioSection(content, bioSection));

	await app.fileManager.processFrontMatter(file, (f) => {
		f.MBID = mbid;
		f.Wikipedia = pageUrl;
	});

	new Notice(`Added Wikipedia bio to "${file.basename}".`);
};
