const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installFetch } = require("./obsidian-fakes");

const script = require("../../Templates/Scripts/enrichArtistPage.js");
const { wikipediaTitle, upsertBioSection } = script.__test__;

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
