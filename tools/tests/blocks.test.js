// Consistency checks for the embedded datacorejsx blocks. JSX *parsing* of
// the blocks is a separate roadmap item (needs a JSX transformer dependency);
// these only guard the plumbing that already exists: the eval-extraction used
// by migrations, and the copy of the song header embedded in New Song.md.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { extractArray } = require("../extract-blocks");

const scriptsDir = path.join(__dirname, "../../Templates/Scripts");
const { SONG_HEADER_BLOCK } = require("../../Templates/Scripts/enrichSongNote.js").__test__;
const { ARTIST_PAGE_BLOCK } = require("../../Templates/Scripts/syncArtistPages.js").__test__;

test("extract-blocks eval-extraction matches the live block constants", () => {
	assert.equal(extractArray(path.join(scriptsDir, "enrichSongNote.js"), "SONG_HEADER_BLOCK"), SONG_HEADER_BLOCK);
	assert.equal(extractArray(path.join(scriptsDir, "syncArtistPages.js"), "ARTIST_PAGE_BLOCK"), ARTIST_PAGE_BLOCK);
});

test("New Song.md embeds an up-to-date copy of SONG_HEADER_BLOCK", () => {
	const tmpl = fs.readFileSync(path.join(scriptsDir, "../New Song.md"), "utf8");
	const m = tmpl.match(/```datacorejsx\n[\s\S]*?\n```/);
	assert.ok(m, "no datacorejsx block in New Song.md");
	// the joined block ends with "```\n" (trailing "" array element)
	assert.equal(m[0] + "\n", SONG_HEADER_BLOCK);
});
