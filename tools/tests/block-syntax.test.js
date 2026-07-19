// JSX-parses the embedded datacorejsx blocks so a typo fails `node --test`
// instead of surfacing as a broken embed only when a note is opened in
// Obsidian. This is a syntax check only (sucrase's transform, then a
// `new Function` parse of the result) — it does not execute the blocks or
// stub Datacore's `dc` API; see ROADMAP.md's "Datacore render harness" item
// for that bigger lift. sucrase lives in tools/package.json — the one place
// a dev dependency is justified (tools/ is export-ignored, so it never
// ships in the release zip).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { transform } = require("sucrase");
const { extractArray } = require("../extract-blocks");

const scriptsDir = path.join(__dirname, "../../Templates/Scripts");

// The extracted string is the full ```datacorejsx fence; strip it down to
// the "return function View() {...}" body and wrap it in a function so the
// top-level `return` (valid inside Datacore's own execution wrapper) parses.
function assertBlockParses(name, raw) {
	const body = raw.replace(/^```datacorejsx\n/, "").replace(/```\s*\n?$/, "");
	const wrapped = `function __block(dc) {\n${body}\n}`;
	let transformed;
	assert.doesNotThrow(() => {
		transformed = transform(wrapped, { transforms: ["jsx"] }).code;
	}, `${name}: JSX/syntax error`);
	assert.doesNotThrow(() => new Function(transformed), `${name}: invalid JS after JSX transform`);
}

test("SONG_HEADER_BLOCK is syntactically valid JSX", () => {
	const raw = extractArray(path.join(scriptsDir, "enrichSongNote.js"), "SONG_HEADER_BLOCK");
	assertBlockParses("SONG_HEADER_BLOCK", raw);
});

test("ARTIST_PAGE_BLOCK is syntactically valid JSX", () => {
	const raw = extractArray(path.join(scriptsDir, "syncArtistPages.js"), "ARTIST_PAGE_BLOCK");
	assertBlockParses("ARTIST_PAGE_BLOCK", raw);
});
