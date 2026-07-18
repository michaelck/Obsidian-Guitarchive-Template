// Block migration: replace the embedded datacorejsx block in every existing
// Songs/*.md (song header), Artists/*.md (artist page block), and in
// Templates/New Song.md with the current block from the Templater scripts.
// Needed because insertSongHeader skips notes that already have a block and
// artist pages are never regenerated — block redesigns don't propagate on
// their own.
//
// usage: node tools/migrate-blocks.js [vault-path]
//   vault-path defaults to this repo's root (repo root = vault root here);
//   pass another vault's path to migrate a downstream vault. The
//   scripts are always read from the TARGET vault's Templates/Scripts, so
//   copy updated scripts over first.
const fs = require("fs");
const path = require("path");
const { extractArray } = require("./extract-blocks.js");

const VAULT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const SCRIPTS = path.join(VAULT, "Templates/Scripts");
console.log("vault:", VAULT);

// SONG_HEADER_BLOCK's joined form carries a trailing newline (final "" element);
// the in-file fence match doesn't include it, so trim for the replacement
const songBlock = extractArray(path.join(SCRIPTS, "enrichSongNote.js"), "SONG_HEADER_BLOCK").trimEnd();
const artistBlock = extractArray(path.join(SCRIPTS, "syncArtistPages.js"), "ARTIST_PAGE_BLOCK");

const FENCE = /```datacorejsx\n[\s\S]*?\n```/g;

function migrateFile(file, label, marker, newBlock) {
	const content = fs.readFileSync(file, "utf8");
	// find the one fence that is OUR block (song notes may contain other
	// fenced blocks; the marker call only appears in ours)
	const fences = [...content.matchAll(FENCE)].filter((m) => m[0].includes(marker));
	if (fences.length === 0) {
		console.log(`  SKIP  ${label} — no block with ${marker}`);
		return;
	}
	if (fences.length > 1) {
		console.log(`  SKIP  ${label} — ${fences.length} matching blocks?!`);
		return;
	}
	const [m] = fences;
	if (m[0] === newBlock) {
		console.log(`  ok    ${label} — already current`);
		return;
	}
	const updated = content.slice(0, m.index) + newBlock + content.slice(m.index + m[0].length);
	fs.writeFileSync(file, updated);
	console.log(`  DONE  ${label}`);
}

function migrateFolder(folder, marker, newBlock) {
	for (const name of fs.readdirSync(path.join(VAULT, folder)).sort()) {
		if (!name.endsWith(".md")) continue;
		migrateFile(path.join(VAULT, folder, name), `${folder}/${name}`, marker, newBlock);
	}
}

console.log("Songs/ (header block):");
migrateFolder("Songs", "dc.useCurrentFile()", songBlock);
console.log("Artists/ (page block):");
migrateFolder("Artists", 'current.value("Name")', artistBlock);
console.log("Templates/New Song.md (header embed):");
migrateFile(path.join(VAULT, "Templates/New Song.md"), "Templates/New Song.md", "dc.useCurrentFile()", songBlock);
