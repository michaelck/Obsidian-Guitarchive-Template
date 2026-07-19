const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installGlobals, installFetch, notices } = require("./obsidian-fakes");

const script = require("../../Templates/Scripts/enrichArtistPage.js");
const { wikipediaTitle, upsertBioSection, artistListenLinks } = script.__test__;

// --- upsertBioSection ---

const BIO = "## Bio\n\nNew bio text.\n\n*Source: [Wikipedia](https://x), text under [CC BY-SA 4.0](https://y).*\n";

test("upsertBioSection inserts above ## Notes so hand-written notes stay separate", () => {
	const content = "---\nName: X\n---\n\nblock\n\n## Notes\nmy notes\n";
	const result = upsertBioSection(content, BIO);
	assert.equal(result, "---\nName: X\n---\n\nblock\n\n" + BIO + "\n## Notes\nmy notes\n");
});

test("upsertBioSection replaces an existing ## Bio in place without duplicating", () => {
	const content = "intro\n\n## Bio\n\nOld bio.\n\n## Notes\nkept\n";
	const result = upsertBioSection(content, BIO);
	assert.ok(result.includes("New bio text."));
	assert.ok(!result.includes("Old bio."));
	assert.ok(result.includes("## Notes\nkept"));
	assert.equal(result.match(/## Bio/g).length, 1);
});

test("upsertBioSection appends when there is no ## Notes heading", () => {
	const result = upsertBioSection("just a page\n", BIO);
	assert.equal(result, "just a page\n\n" + BIO);
});

// --- artistListenLinks: whitelist + official homepage, no socials ---

test("artistListenLinks keeps whitelisted services and the official homepage, first per service", () => {
	const links = artistListenLinks([
		{ type: "social network", url: { resource: "https://www.instagram.com/kevinmorby" } },
		{ type: "streaming", url: { resource: "https://open.spotify.com/artist/first" } },
		{ type: "streaming", url: { resource: "https://open.spotify.com/artist/second" } },
		{ type: "official homepage", url: { resource: "https://kevinmorby.com" } },
		{ type: "official homepage", url: { resource: "https://old-site.example" } },
		{ type: "bandcamp", url: { resource: "https://kevinmorby.bandcamp.com" } },
		{ url: {} },
		{},
	]);
	assert.deepEqual(links, [
		"https://open.spotify.com/artist/first",
		"https://kevinmorby.com",
		"https://kevinmorby.bandcamp.com",
	]);
});

test("artistListenLinks rejects http URLs and lookalike hosts, tolerates missing relations", () => {
	assert.deepEqual(artistListenLinks([
		{ type: "official homepage", url: { resource: "http://insecure.example" } },
		{ type: "streaming", url: { resource: "http://open.spotify.com/artist/x" } },
		{ type: "streaming", url: { resource: "https://evil.example/open.spotify.com" } },
	]), []);
	assert.deepEqual(artistListenLinks(undefined), []);
});

// --- wikipediaTitle ---

test("wikipediaTitle takes a direct en.wikipedia rel, decoding the URL slug", async () => {
	const title = await wikipediaTitle([
		{ type: "wikipedia", url: { resource: "https://de.wikipedia.org/wiki/Falsch" } },
		{ type: "wikipedia", url: { resource: "https://en.wikipedia.org/wiki/Elliott_Smith_%28album%29" } },
	]);
	assert.equal(title, "Elliott Smith (album)");
});

test("wikipediaTitle falls back to the Wikidata enwiki sitelink", async () => {
	installFetch([
		["wikidata.org/wiki/Special:EntityData/Q504591.json", {
			entities: { Q504591: { sitelinks: { enwiki: { title: "Elliott Smith" } } } },
		}],
	]);
	const title = await wikipediaTitle([
		{ type: "wikidata", url: { resource: "https://www.wikidata.org/wiki/Q504591" } },
	]);
	assert.equal(title, "Elliott Smith");
});

test("wikipediaTitle returns null when MusicBrainz has no usable rel", async () => {
	assert.equal(await wikipediaTitle([]), null);
	assert.equal(await wikipediaTitle(undefined), null);
});

// --- the full enrich flow (stored MBID, stubbed fetch) ---

const PAGE_PATH = "Artists/Morby, Kevin.md";

function artistPageFixture(frontmatter) {
	const app = installGlobals({
		files: [PAGE_PATH],
		frontmatter: { [PAGE_PATH]: frontmatter },
		contents: { [PAGE_PATH]: "block\n\n## Notes\nmy notes\n" },
	});
	app.workspace.activeFile = { path: PAGE_PATH, basename: "Morby, Kevin" };
	return app;
}

const MB_RELATIONS = [
	{ type: "streaming", url: { resource: "https://open.spotify.com/artist/km" } },
	{ type: "official homepage", url: { resource: "https://kevinmorby.com" } },
	{ type: "social network", url: { resource: "https://www.instagram.com/kevinmorby" } },
];

test("enrichArtistPage writes Listen, Wikipedia, Description and upserts the bio", async () => {
	const fm = { Name: "Morby, Kevin", MBID: "mbid-km" };
	const app = artistPageFixture(fm);
	installFetch([
		["/ws/2/artist/mbid-km", {
			name: "Kevin Morby",
			relations: [...MB_RELATIONS, { type: "wikidata", url: { resource: "https://www.wikidata.org/wiki/Q19864816" } }],
		}],
		["Special:EntityData/Q19864816.json", {
			entities: { Q19864816: { sitelinks: { enwiki: { title: "Kevin Morby" } } } },
		}],
		["rest_v1/page/summary/Kevin_Morby", {
			type: "standard",
			extract: "Kevin Robert Morby is an American singer-songwriter.",
			description: "American singer-songwriter",
			content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Kevin_Morby" } },
		}],
	]);

	await script({});

	assert.equal(fm.MBID, "mbid-km");
	// whitelisted streaming link + homepage saved; the social link is not
	assert.deepEqual(fm.Listen, ["https://open.spotify.com/artist/km", "https://kevinmorby.com"]);
	assert.equal(fm.Wikipedia, "https://en.wikipedia.org/wiki/Kevin_Morby");
	assert.equal(fm.Description, "American singer-songwriter");
	assert.ok(app.contents[PAGE_PATH].includes("## Bio"));
	assert.ok(app.contents[PAGE_PATH].includes("Kevin Robert Morby"));
	assert.ok(app.contents[PAGE_PATH].includes("## Notes\nmy notes"));
});

test("enrichArtistPage still saves MBID + Listen when the Wikipedia chain dead-ends", async () => {
	const fm = { Name: "Morby, Kevin", MBID: "mbid-km" };
	const app = artistPageFixture(fm);
	installFetch([["/ws/2/artist/mbid-km", { name: "Kevin Morby", relations: MB_RELATIONS }]]);

	await script({});

	assert.deepEqual(fm.Listen, ["https://open.spotify.com/artist/km", "https://kevinmorby.com"]);
	assert.equal(fm.Wikipedia, undefined);
	assert.equal(fm.Description, undefined);
	assert.ok(!app.contents[PAGE_PATH].includes("## Bio"));
	assert.match(notices.at(-1), /no Wikipedia\/Wikidata link/);
	assert.match(notices.at(-1), /Saved 2 listen link/);
});

test("enrichArtistPage with Metadata Source: none neither fetches nor writes", async () => {
	const fm = { Name: "Morby, Kevin", "Metadata Source": "none" };
	artistPageFixture(fm);
	installFetch([]); // any fetch at all would throw "unexpected fetch"

	await script({});

	assert.deepEqual(fm, { Name: "Morby, Kevin", "Metadata Source": "none" });
	assert.match(notices.at(-1), /Metadata Source: none/);
});
