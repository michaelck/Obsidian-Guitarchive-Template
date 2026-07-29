// JSX-parses the header/artist components and the loader stubs so a typo fails
// `node --test` instead of surfacing as a broken embed only when a note is
// opened in Obsidian. This is a syntax check only (sucrase's transform, then a
// `new Function` parse of the result) — it does not execute the components or
// stub Datacore's `dc` API; see ROADMAP.md's "Datacore render harness" item
// for that bigger lift. sucrase lives in tools/package.json — the one place
// a dev dependency is justified (tools/ is export-ignored, so it never
// ships in the release zip).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { transform } = require("sucrase");
const { extractArray, extractComponent } = require("../extract-blocks");

const scriptsDir = path.join(__dirname, "../../Templates/Scripts");

// Wrap the source in a function so its top-level `return` (valid inside
// Datacore's own execution wrapper — the loader stub's `return function View`,
// the component's `return { Name }`) parses, then confirm it survives the JSX
// transform.
function assertParses(name, src) {
	// async wrapper: the loader stub uses top-level `await dc.require(...)`,
	// which Datacore itself runs inside an async IIFE
	const wrapped = `async function __mod(dc) {\n${src}\n}`;
	let transformed;
	assert.doesNotThrow(() => {
		transformed = transform(wrapped, { transforms: ["jsx"] }).code;
	}, `${name}: JSX/syntax error`);
	assert.doesNotThrow(() => new Function(transformed), `${name}: invalid JS after JSX transform`);
}

// The loader stub is a ```datacorejsx fence; strip it before wrapping.
function assertStubParses(name, raw) {
	assertParses(name, raw.replace(/^```datacorejsx\n/, "").replace(/```\s*\n?$/, ""));
}

test("song-header-view.jsx is syntactically valid JSX", () => {
	assertParses("song-header-view.jsx", extractComponent(path.join(scriptsDir, "song-header-view.jsx")));
});

test("artist-page-view.jsx is syntactically valid JSX", () => {
	assertParses("artist-page-view.jsx", extractComponent(path.join(scriptsDir, "artist-page-view.jsx")));
});

test("SONG_HEADER_BLOCK loader stub is syntactically valid JSX", () => {
	assertStubParses("SONG_HEADER_BLOCK", extractArray(path.join(scriptsDir, "enrichSongNote.js"), "SONG_HEADER_BLOCK"));
});

test("ARTIST_PAGE_BLOCK loader stub is syntactically valid JSX", () => {
	assertStubParses("ARTIST_PAGE_BLOCK", extractArray(path.join(scriptsDir, "syncArtistPages.js"), "ARTIST_PAGE_BLOCK"));
});
