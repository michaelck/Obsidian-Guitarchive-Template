const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installGlobals, notices } = require("./obsidian-fakes");

const adoptSongNote = require("../../Templates/Scripts/adoptSongNote.js");

function adopt(frontmatter) {
	const path = "Songs/Imported Tab.md";
	const app = installGlobals({ files: [path], frontmatter: { [path]: frontmatter } });
	app.workspace.activeFile = { path, basename: "Imported Tab" };
	return { app, fm: frontmatter, run: () => adoptSongNote({}) };
}

test("bare imported note gets the full scaffold with defaults", async () => {
	const { fm, run } = adopt({});
	await run();
	assert.equal(fm.Song, "Imported Tab"); // defaults to the filename
	assert.equal(fm.Tuning, "Standard");
	assert.equal(fm.Favorite, false);
	assert.equal(fm.Artist, "");
	assert.deepEqual(fm.cssclasses, ["song-note"]);
	assert.match(notices.at(-1), /added: Artist, Song/);
});

test("existing values are never overwritten; empty strings count as missing", async () => {
	const { fm, run } = adopt({
		Artist: "Smith, Elliott",
		Song: "Between the Bars",
		Tuning: "Drop D",
		Favorite: true,
		Album: "", // empty — should be (re)claimed as missing, value stays ""
	});
	await run();
	assert.equal(fm.Artist, "Smith, Elliott");
	assert.equal(fm.Song, "Between the Bars");
	assert.equal(fm.Tuning, "Drop D");
	assert.equal(fm.Favorite, true);
	assert.equal(fm.Album, "");
});

test("song-note merges into an existing cssclasses value instead of replacing it", async () => {
	const scalar = adopt({ cssclasses: "wide-page" });
	await scalar.run();
	assert.deepEqual(scalar.fm.cssclasses, ["wide-page", "song-note"]);

	const already = adopt({ cssclasses: ["song-note"] });
	await already.run();
	assert.deepEqual(already.fm.cssclasses, ["song-note"]);
});

test("fully adopted note reports no additions", async () => {
	const { run } = adopt({
		Artist: "X", Song: "Y", Album: "Z", Version: "v", Tuning: "Standard",
		Capo: "2", Key: "G", Favorite: false, Cover: "c",
		"Originally Tabbed By": "t", "Tab Source": "u", cssclasses: ["song-note"],
	});
	await run();
	assert.match(notices.at(-1), /already has the full song frontmatter/);
});
