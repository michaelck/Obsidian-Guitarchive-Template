// End-to-end tests for tools/migrate-blocks.js, focused on the --dry-run
// flag: a dry run must report exactly what a real run would do while
// writing nothing. Runs the actual script as a child process against a
// throwaway vault fixture in a temp dir — no fakes, the real fs paths.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MIGRATE = path.join(__dirname, "../migrate-blocks.js");

// Minimal block constants in the shape extract-blocks.js expects
// (`const NAME = [...lines...].join("\n")`). The v2 blocks are what the
// fixture's scripts carry; the notes start out embedding the v1 blocks.
const songBlockLines = (version) => [
	"```datacorejsx",
	"return function View() {",
	"    const page = dc.useCurrentFile();",
	`    return <p>${version}</p>;`,
	"}",
	"```",
];
const artistBlockLines = (version) => [
	"```datacorejsx",
	"return function View() {",
	'    const name = current.value("Name");',
	`    return <p>${version}</p>;`,
	"}",
	"```",
];

// Renders an array literal the way the real scripts carry their blocks, so
// extractArray's eval-extraction works against the fixture unchanged.
// SONG_HEADER_BLOCK ends with a trailing "" element (joined form carries a
// trailing newline), matching the real enrichSongNote.js.
const asArrayLiteral = (name, lines, trailingEmpty) => {
	const elems = [...lines, ...(trailingEmpty ? [""] : [])]
		.map((line) => `\t${JSON.stringify(line)},`)
		.join("\n");
	return `const ${name} = [\n${elems}\n].join("\\n");\n`;
};

function makeVault() {
	const vault = fs.mkdtempSync(path.join(os.tmpdir(), "guitarchive-migrate-"));
	const scripts = path.join(vault, "Templates/Scripts");
	fs.mkdirSync(scripts, { recursive: true });
	fs.mkdirSync(path.join(vault, "Songs"));
	fs.mkdirSync(path.join(vault, "Artists"));

	fs.writeFileSync(
		path.join(scripts, "enrichSongNote.js"),
		asArrayLiteral("SONG_HEADER_BLOCK", songBlockLines("v2"), true)
	);
	fs.writeFileSync(
		path.join(scripts, "syncArtistPages.js"),
		asArrayLiteral("ARTIST_PAGE_BLOCK", artistBlockLines("v2"), false)
	);

	fs.writeFileSync(
		path.join(vault, "Songs/Test Song.md"),
		`---\nSong: Test Song\n---\n\n${songBlockLines("v1").join("\n")}\n\nTab body stays put.\n`
	);
	fs.writeFileSync(
		path.join(vault, "Artists/Test Artist.md"),
		`---\nName: Test Artist\n---\n\n${artistBlockLines("v1").join("\n")}\n\n## Notes\n`
	);
	fs.writeFileSync(
		path.join(vault, "Templates/New Song.md"),
		`---\nSong: <% songName %>\n---\n\n${songBlockLines("v1").join("\n")}\n`
	);
	return vault;
}

const run = (...args) => spawnSync(process.execPath, [MIGRATE, ...args], { encoding: "utf8" });

test("migrate-blocks --dry-run reports would-update lines but writes nothing", (t) => {
	const vault = makeVault();
	t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
	const before = {
		song: fs.readFileSync(path.join(vault, "Songs/Test Song.md"), "utf8"),
		artist: fs.readFileSync(path.join(vault, "Artists/Test Artist.md"), "utf8"),
		template: fs.readFileSync(path.join(vault, "Templates/New Song.md"), "utf8"),
	};

	const result = run("--dry-run", vault);
	assert.equal(result.status, 0, result.stderr);
	// all three outdated files reported as would-update, none rewritten
	assert.equal((result.stdout.match(/would update/g) ?? []).length, 3, result.stdout);
	assert.equal(fs.readFileSync(path.join(vault, "Songs/Test Song.md"), "utf8"), before.song);
	assert.equal(fs.readFileSync(path.join(vault, "Artists/Test Artist.md"), "utf8"), before.artist);
	assert.equal(fs.readFileSync(path.join(vault, "Templates/New Song.md"), "utf8"), before.template);
});

test("migrate-blocks accepts --dry-run after the vault path too", (t) => {
	const vault = makeVault();
	t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
	const before = fs.readFileSync(path.join(vault, "Songs/Test Song.md"), "utf8");

	const result = run(vault, "--dry-run");
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.includes("would update"), result.stdout);
	assert.equal(fs.readFileSync(path.join(vault, "Songs/Test Song.md"), "utf8"), before);
});

test("migrate-blocks without --dry-run rewrites the blocks in place", (t) => {
	const vault = makeVault();
	t.after(() => fs.rmSync(vault, { recursive: true, force: true }));

	const result = run(vault);
	assert.equal(result.status, 0, result.stderr);

	const song = fs.readFileSync(path.join(vault, "Songs/Test Song.md"), "utf8");
	assert.ok(song.includes("<p>v2</p>"), "song block updated");
	assert.ok(!song.includes("<p>v1</p>"), "old song block gone");
	assert.ok(song.includes("Tab body stays put."), "note body preserved");
	assert.ok(song.startsWith("---\nSong: Test Song\n---\n"), "frontmatter preserved");

	const artist = fs.readFileSync(path.join(vault, "Artists/Test Artist.md"), "utf8");
	assert.ok(artist.includes("<p>v2</p>"), "artist block updated");
	assert.ok(artist.includes("## Notes"), "hand-written section preserved");

	const template = fs.readFileSync(path.join(vault, "Templates/New Song.md"), "utf8");
	assert.ok(template.includes("<p>v2</p>"), "New Song.md embed updated");

	// second run is a no-op: everything already current
	const again = run(vault);
	assert.equal(again.status, 0, again.stderr);
	assert.ok(!again.stdout.includes("would update"), again.stdout);
	assert.equal((again.stdout.match(/already current/g) ?? []).length, 3, again.stdout);
});
