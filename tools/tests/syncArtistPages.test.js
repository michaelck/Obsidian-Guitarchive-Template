const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installGlobals, notices } = require("./obsidian-fakes");

const syncArtistPages = require("../../Templates/Scripts/syncArtistPages.js");
const { artistPageContent, ARTIST_PAGE_BLOCK } = syncArtistPages.__test__;

test("artistPageContent quotes the literal name and carries block + cssclasses + Notes", () => {
	const content = artistPageContent('The "Fake" Band');
	assert.ok(content.startsWith('---\nName: "The \\"Fake\\" Band"\ncssclasses:\n  - artist-note\n---\n'));
	assert.ok(content.includes(ARTIST_PAGE_BLOCK));
	assert.ok(content.trimEnd().endsWith("## Notes"));
});

test("syncArtistPages: hostile frontmatter, sanitized filenames, existing pages untouched", async () => {
	const app = installGlobals({
		files: [
			"Songs/One.md",
			"Songs/Two.md",
			"Songs/Three.md",
			"Songs/Four.md",
			"Not Songs/Elsewhere.md",
			"Artists", // folder already exists
			"Artists/Foxwarren.md", // page already exists
		],
		frontmatter: {
			"Songs/One.md": { Artist: ["Smith, Elliott", "Foxwarren"] }, // list value; Foxwarren already has a page
			"Songs/Two.md": { Artist: 311 }, // YAML number
			"Songs/Three.md": { Artist: "AC/DC" }, // filesystem-hostile name
			"Songs/Four.md": { Artist: null }, // empty key — no page, no crash
			"Not Songs/Elsewhere.md": { Artist: "Should Not Appear" },
		},
	});

	await syncArtistPages({}, { quiet: true });

	assert.deepEqual(app.created.map((c) => c.path).sort(), [
		"Artists/311.md",
		"Artists/AC-DC.md", // filename sanitized...
		"Artists/Smith, Elliott.md",
	]);
	// ...but the Name property stays the literal string, slash intact
	const acdc = app.created.find((c) => c.path === "Artists/AC-DC.md");
	assert.ok(acdc.content.includes('Name: "AC/DC"'));
	assert.match(notices.at(-1), /Created 3 artist page/);
});

test("syncArtistPages quiet mode suppresses the up-to-date notice, non-quiet emits it", async () => {
	installGlobals({ files: ["Artists"] });
	await syncArtistPages({}, { quiet: true });
	assert.equal(notices.length, 0);

	installGlobals({ files: ["Artists"] });
	await syncArtistPages({});
	assert.match(notices.at(-1), /already up to date/);
});
