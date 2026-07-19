// Regression tests for the BLOCK-side graceful-failover paths documented in
// CLAUDE.md's "Graceful-failover conventions" section — malformed or
// unusual frontmatter must never crash a rendered block.
//
// hostnameOf is sliced out of SONG_HEADER_BLOCK/ARTIST_PAGE_BLOCK the same
// way key-detection.test.js slices the key-detection scorer: pure logic,
// no dc/page API involved, so no stubbed Datacore render harness needed.
// The Artist-explode flatMap in Guitarchive.md DOES call dc.coerce.array,
// so it gets one minimal stub for that single call rather than a full
// render harness (the bigger "Datacore render harness" item stays on
// ROADMAP.md for actual render-path testing).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { transform } = require("sucrase");
const { extractArray } = require("../extract-blocks");

const scriptsDir = path.join(__dirname, "../../Templates/Scripts");
const repoRoot = path.join(__dirname, "../..");

function evalSlice(slice, returnExpr) {
	const wrapped = `(function() {\n${slice}\nreturn ${returnExpr};\n})()`;
	const { code } = transform(wrapped, { transforms: ["jsx"], disableESTransforms: true });
	return new Function(`return ${code};`)();
}

// --- hostnameOf: duplicated in SONG_HEADER_BLOCK (enrichSongNote.js) and ---
// --- ARTIST_PAGE_BLOCK (syncArtistPages.js) — both copies must be tested ---

function loadHostnameOf(file, blockName) {
	const raw = extractArray(path.join(scriptsDir, file), blockName);
	const start = raw.indexOf("const hostnameOf = url => {");
	assert.ok(start >= 0, `hostnameOf not found in ${blockName} (${file}) — did it move or get renamed?`);
	// anchor the end on the catch body rather than indentation, since the two
	// blocks indent this function differently (nested vs. top-level)
	const catchIdx = raw.indexOf("catch { return String(url); }", start);
	assert.ok(catchIdx > start, `hostnameOf's catch body not found in ${blockName} — did the fallback behavior change?`);
	const braceIdx = raw.indexOf("};", catchIdx);
	assert.ok(braceIdx > catchIdx, `end of hostnameOf not found in ${blockName}`);
	const slice = raw.slice(start, braceIdx + 2);
	return evalSlice(slice, "hostnameOf");
}

for (const [label, file, blockName] of [
	["SONG_HEADER_BLOCK", "enrichSongNote.js", "SONG_HEADER_BLOCK"],
	["ARTIST_PAGE_BLOCK", "syncArtistPages.js", "ARTIST_PAGE_BLOCK"],
]) {
	const hostnameOf = loadHostnameOf(file, blockName);

	test(`${label}: hostnameOf strips www. from a valid URL`, () => {
		assert.equal(hostnameOf("https://www.example.com/foo"), "example.com");
	});

	test(`${label}: hostnameOf returns the raw (stringified) value for null instead of throwing`, () => {
		assert.doesNotThrow(() => hostnameOf(null));
		assert.equal(hostnameOf(null), "null");
	});

	test(`${label}: hostnameOf returns the raw string for a non-URL string instead of throwing`, () => {
		assert.equal(hostnameOf("not a url"), "not a url");
	});

	test(`${label}: hostnameOf returns the raw string for a number-as-string instead of throwing`, () => {
		assert.equal(hostnameOf("42"), "42");
	});
}

// --- Unknown Artist fallback: Guitarchive.md's datacorejsx block ---
//
// Not extracted via extractArray — Guitarchive.md embeds the block directly
// as a fenced datacorejsx block, not a `const NAME = [...]` array literal
// like the Templater scripts, so it's pulled out with the same fence regex
// extract-blocks.js's CLI branch already uses to check New Song.md's embed.

function loadExplodeArtists() {
	const md = fs.readFileSync(path.join(repoRoot, "Guitarchive.md"), "utf8");
	const m = md.match(/```datacorejsx\n([\s\S]*?)\n```/);
	assert.ok(m, "no datacorejsx block found in Guitarchive.md");
	const raw = m[1];
	const marker = ".flatMap(page => {";
	const start = raw.indexOf(marker);
	assert.ok(start >= 0, "Artist-explode flatMap not found in Guitarchive.md — did the block move or get restructured?");
	const bodyStart = start + marker.length;
	const end = raw.indexOf("\n            }),", bodyStart);
	assert.ok(end > bodyStart, "end of Artist-explode flatMap not found in Guitarchive.md");
	const body = raw.slice(bodyStart, end);
	return evalSlice(`const explodeArtists = function(page, dc) {\n${body}\n};`, "explodeArtists");
}

// minimal stub matching the contract CLAUDE.md documents for the real
// dc.coerce.array: normalizes a Text-or-List frontmatter value into an array
const dcStub = {
	coerce: {
		array: value => (value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]),
	},
};

const fakePage = artistValue => ({ value: key => (key === "Artist" ? artistValue : undefined) });

const explodeArtists = loadExplodeArtists();

test("Artist-explode: null Artist produces a single Unknown Artist row, not an empty (vanishing) result", () => {
	const page = fakePage(null);
	const rows = explodeArtists(page, dcStub);
	assert.deepEqual(rows.map((r) => r.artist), ["Unknown Artist"]);
	assert.equal(rows[0].page, page);
});

test("Artist-explode: undefined Artist produces a single Unknown Artist row", () => {
	assert.deepEqual(explodeArtists(fakePage(undefined), dcStub).map((r) => r.artist), ["Unknown Artist"]);
});

test("Artist-explode: empty-string Artist produces a single Unknown Artist row", () => {
	assert.deepEqual(explodeArtists(fakePage(""), dcStub).map((r) => r.artist), ["Unknown Artist"]);
});

test("Artist-explode: whitespace-only Artist produces a single Unknown Artist row", () => {
	assert.deepEqual(explodeArtists(fakePage("   "), dcStub).map((r) => r.artist), ["Unknown Artist"]);
});

test("Artist-explode: a numeric Artist (e.g. a band named '311') is string-coerced into a real row, not Unknown Artist", () => {
	// YAML hands back a number for bare-numeric names — CLAUDE.md's
	// graceful-failover conventions call for string-coercion here, not a
	// fallback to Unknown Artist, since the value IS usable once coerced
	assert.deepEqual(explodeArtists(fakePage(311), dcStub).map((r) => r.artist), ["311"]);
});

test("Artist-explode: a List Artist with blank entries drops only the blanks, keeping real names", () => {
	const rows = explodeArtists(fakePage(["", "Neil Young", "   "]), dcStub);
	assert.deepEqual(rows.map((r) => r.artist), ["Neil Young"]);
});

test("Artist-explode: a List Artist that is entirely blank falls back to one Unknown Artist row", () => {
	const rows = explodeArtists(fakePage(["", "   "]), dcStub);
	assert.deepEqual(rows.map((r) => r.artist), ["Unknown Artist"]);
});

// --- "More from this album" matching/sort logic: SONG_HEADER_BLOCK ---
//
// The dc.useMemo callback body is pulled out by anchor string (same pattern
// as loadExplodeArtists above) and wrapped as a plain function taking
// (albumMbid, allSongPages, page) — the three closure values it reads. This
// covers only the pure matching/sorting logic; the click-to-expand toggle
// itself is Datacore render/interaction behavior and needs manual
// verification in Obsidian (see the bigger "Datacore render harness" item
// on ROADMAP.md).

function loadMoreFromAlbum() {
	const raw = extractArray(path.join(scriptsDir, "enrichSongNote.js"), "SONG_HEADER_BLOCK");
	const startMarker = "const moreFromAlbum = dc.useMemo(() => {";
	const start = raw.indexOf(startMarker);
	assert.ok(start >= 0, "moreFromAlbum useMemo not found in SONG_HEADER_BLOCK — did it move or get renamed?");
	const bodyStart = start + startMarker.length;
	const endMarker = "}, [allSongPages, albumMbid, page.$path]);";
	const end = raw.indexOf(endMarker, bodyStart);
	assert.ok(end > bodyStart, "end of moreFromAlbum useMemo not found in SONG_HEADER_BLOCK");
	const body = raw.slice(bodyStart, end);
	return evalSlice(`const moreFromAlbum = function(albumMbid, allSongPages, page) {\n${body}\n};`, "moreFromAlbum");
}

const fakeSongPage = (path, fm) => ({
	$path: path,
	$name: path.replace(/^Songs\//, "").replace(/\.md$/, ""),
	$link: { withDisplay: (text) => ({ path, display: text }) },
	value: (key) => fm[key],
});

const moreFromAlbum = loadMoreFromAlbum();

test("SONG_HEADER_BLOCK: moreFromAlbum returns empty when Album MBID is null/empty/whitespace-only", () => {
	const current = { $path: "Songs/A.md" };
	const others = [fakeSongPage("Songs/B.md", { "Album MBID": "mbid-1" })];
	assert.deepEqual(moreFromAlbum(null, others, current), []);
	assert.deepEqual(moreFromAlbum(undefined, others, current), []);
	assert.deepEqual(moreFromAlbum("", others, current), []);
	assert.deepEqual(moreFromAlbum("   ", others, current), []);
});

test("SONG_HEADER_BLOCK: moreFromAlbum returns empty when only the current note matches", () => {
	const current = { $path: "Songs/A.md" };
	const allSongPages = [fakeSongPage("Songs/A.md", { "Album MBID": "mbid-1", Song: "Song A" })];
	assert.deepEqual(moreFromAlbum("mbid-1", allSongPages, current), []);
});

test("SONG_HEADER_BLOCK: moreFromAlbum excludes the current note by path, not title", () => {
	// two Version notes of the same song share Album MBID and even Song title —
	// only the exact path must be excluded, per CLAUDE.md's Version design
	const current = { $path: "Songs/Hallelujah.md" };
	const allSongPages = [
		fakeSongPage("Songs/Hallelujah.md", { "Album MBID": "mbid-1", Song: "Hallelujah" }),
		fakeSongPage("Songs/Hallelujah (Drop D).md", { "Album MBID": "mbid-1", Song: "Hallelujah", Version: "Drop D" }),
	];
	const result = moreFromAlbum("mbid-1", allSongPages, current);
	assert.deepEqual(result.map((r) => r.path), ["Songs/Hallelujah (Drop D).md"]);
});

test("SONG_HEADER_BLOCK: moreFromAlbum sorts by Track number, missing Track last, then alphabetically by Song", () => {
	const current = { $path: "Songs/Current.md" };
	const allSongPages = [
		fakeSongPage("Songs/NoTrack2.md", { "Album MBID": "mbid-1", Song: "Zeta" }),
		fakeSongPage("Songs/Track4.md", { "Album MBID": "mbid-1", Song: "Delta", Track: "4 of 11" }),
		fakeSongPage("Songs/NoTrack1.md", { "Album MBID": "mbid-1", Song: "Alpha" }),
		fakeSongPage("Songs/Track1.md", { "Album MBID": "mbid-1", Song: "Beta", Track: "1 of 11" }),
	];
	const result = moreFromAlbum("mbid-1", allSongPages, current);
	assert.deepEqual(result.map((r) => r.song), ["Beta", "Delta", "Alpha", "Zeta"]);
});

test("SONG_HEADER_BLOCK: moreFromAlbum does not throw on a numeric-looking Album MBID and still matches", () => {
	// YAML hands back a number for a bare-numeric value; String()-coercion on
	// both sides of the comparison must still line them up
	const current = { $path: "Songs/A.md" };
	const allSongPages = [fakeSongPage("Songs/B.md", { "Album MBID": 12345, Song: "Song B" })];
	assert.doesNotThrow(() => moreFromAlbum(12345, allSongPages, current));
	assert.deepEqual(moreFromAlbum(12345, allSongPages, current).map((r) => r.song), ["Song B"]);
});
