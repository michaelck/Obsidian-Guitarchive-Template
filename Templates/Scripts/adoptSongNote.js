// Templater user script: give the ACTIVE note the standard song frontmatter.
//
// For imported tabs: notes created inside Songs/ get the scaffold from the
// New Song folder template automatically, but a file dragged in from outside
// Obsidian (or moved into the folder after creation) arrives bare. Run this
// on it (trigger template: Templates/Scripts/Adopt Song.md, same hotkey
// pattern as Enrich Song) and it merges in every standard field:
//
//   - strictly non-destructive: a key that already has a value is never
//     touched; only missing keys are added
//   - Song defaults to the filename, Tuning to "Standard", Favorite to false
//   - cssclasses gains "song-note" (merged into any existing class list),
//     pairing with the CSS snippet to hide raw properties in reading view
//
// Typical import flow: drop the file in Songs/ -> Adopt Song hotkey ->
// fill in Artist/Album -> Enrich Song hotkey (header + metadata).

module.exports = async function adoptSongNote(tp) {
	const file = app.workspace.getActiveFile();
	if (!file) return;

	const added = [];
	await app.fileManager.processFrontMatter(file, (fm) => {
		const ensure = (key, value) => {
			if (fm[key] === undefined || fm[key] === null || fm[key] === "") {
				fm[key] = value;
				added.push(key);
			}
		};

		ensure("Artist", "");
		ensure("Song", file.basename);
		ensure("Album", "");
		ensure("Version", "");
		ensure("Tuning", "Standard");
		ensure("Capo", "");
		ensure("Key", "");
		ensure("Favorite", false);
		ensure("Cover", "");
		ensure("Originally Tabbed By", "");
		ensure("Tab Source", "");

		// merge, don't overwrite: the note may already carry other classes
		const classes =
			fm.cssclasses === undefined || fm.cssclasses === null
				? []
				: Array.isArray(fm.cssclasses)
				? fm.cssclasses
				: [fm.cssclasses];
		if (!classes.includes("song-note")) {
			fm.cssclasses = [...classes, "song-note"];
			added.push("cssclasses");
		}
	});

	new Notice(
		added.length > 0
			? `Adopted "${file.basename}" — added: ${added.join(", ")}`
			: `"${file.basename}" already has the full song frontmatter.`
	);
};
