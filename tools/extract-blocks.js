// Extracts the datacorejsx block constants (array-of-lines literals) out of
// the Templater user scripts, so migrations and checks work from the scripts
// as the single source of truth instead of a pasted copy.
const fs = require("fs");

function extractArray(file, name) {
	const src = fs.readFileSync(file, "utf8");
	const declaration = `const ${name} = `;
	const start = src.indexOf(declaration + "[");
	if (start < 0) throw new Error(`${name} not found in ${file}`);
	// the array literal ends at the first top-of-line "].join(" after it
	const end = src.indexOf("\n].join(", start);
	if (end < 0) throw new Error(`end of ${name} not found in ${file}`);
	const literal = src.slice(start + declaration.length, end + 2); // include "]"
	return eval(literal).join("\n");
}

module.exports = { extractArray };

if (require.main === module) {
	const scriptsDir = process.argv[2];
	if (!scriptsDir) throw new Error("usage: node extract-blocks.js <Templates/Scripts dir> [<New Song.md>]");
	const header = extractArray(`${scriptsDir}/enrichSongNote.js`, "SONG_HEADER_BLOCK");
	const artist = extractArray(`${scriptsDir}/syncArtistPages.js`, "ARTIST_PAGE_BLOCK");
	console.log("SONG_HEADER_BLOCK lines:", header.split("\n").length);
	console.log("ARTIST_PAGE_BLOCK lines:", artist.split("\n").length);

	const templatePath = process.argv[3];
	if (templatePath) {
		const tmpl = fs.readFileSync(templatePath, "utf8");
		const m = tmpl.match(/```datacorejsx\n[\s\S]*?\n```/);
		if (!m) throw new Error("no datacorejsx block in " + templatePath);
		// SONG_HEADER_BLOCK's joined form ends with "```\n" (trailing "" element)
		const same = header === m[0] + "\n";
		console.log("New Song.md embed matches SONG_HEADER_BLOCK:", same);
		if (!same) {
			const a = header.split("\n"), b = (m[0] + "\n").split("\n");
			for (let i = 0; i < Math.max(a.length, b.length); i++) {
				if (a[i] !== b[i]) {
					console.log(`first diff at line ${i}:\n  script: ${JSON.stringify(a[i])}\n  embed:  ${JSON.stringify(b[i])}`);
					break;
				}
			}
			process.exitCode = 1;
		}
	}
}
