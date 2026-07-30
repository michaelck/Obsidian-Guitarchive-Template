// Consistency checks for the embedded datacorejsx blocks: the eval-extraction
// used by migrations, and the copy of the song header embedded in
// New Song.md. JSX *syntax* validation lives in block-syntax.test.js.
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

// Each loader stub is now a runtime dependency: it dc.requires a .jsx
// component from a fixed path, so a typo in that path (or a missing/renamed
// file) silently breaks every note's header. Guard both halves — the path the
// stub names must exist, and the file must export the component the stub
// destructures.
// Guitarchive.md carries its loader stub as a fenced block (not a constant),
// so pull it out with the same fence regex used elsewhere.
const guitarchiveStub = (() => {
	const md = fs.readFileSync(path.join(scriptsDir, "../../Guitarchive.md"), "utf8");
	return md.match(/```datacorejsx\n[\s\S]*?\n```/)?.[0] ?? "";
})();

for (const [label, block, file, exportName] of [
	["SONG_HEADER_BLOCK", SONG_HEADER_BLOCK, "song-header-view.jsx", "SongHeader"],
	["ARTIST_PAGE_BLOCK", ARTIST_PAGE_BLOCK, "artist-page-view.jsx", "ArtistPage"],
	["Guitarchive.md stub", guitarchiveStub, "guitarchive-view.jsx", "Guitarchive"],
]) {
	test(`${label} loader stub points at an existing component that exports ${exportName}`, () => {
		const requiredPath = block.match(/dc\.require\(dc\.fileLink\("([^"]+)"\)\)/);
		assert.ok(requiredPath, `${label} does not dc.require(dc.fileLink(...)) a component path`);
		assert.equal(requiredPath[1], `Templates/Scripts/${file}`, `${label} requires an unexpected path`);

		const componentPath = path.join(scriptsDir, file);
		assert.ok(fs.existsSync(componentPath), `${componentPath} is missing — every note's block would break`);

		const src = fs.readFileSync(componentPath, "utf8");
		assert.ok(
			new RegExp(`return\\s*\\{[^}]*\\b${exportName}\\b`).test(src),
			`${file} does not \`return { ${exportName} }\` — the stub's destructure would be undefined`
		);
		assert.ok(
			block.includes(`{ ${exportName} }`),
			`${label} does not destructure { ${exportName} } from the component`
		);
	});
}
