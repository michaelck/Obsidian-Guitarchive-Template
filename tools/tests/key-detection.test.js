// The key-detection scorer lives inside SONG_HEADER_BLOCK (self-contained —
// no references to `dc`/`page`), so it's sliced out by anchor rather than
// executing the whole View() function; that would need a stubbed Datacore
// render-time API, which is the bigger "Datacore render harness" item in
// ROADMAP.md. Run through sucrase anyway (transforms: ["jsx"]) for parity
// with block-syntax.test.js and in case this region ever grows JSX by
// mistake — disableESTransforms keeps modern syntax (??, ?.) as-is instead
// of downleveling to sucrase's helper functions, which aren't defined here.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { transform } = require("sucrase");
const { extractArray } = require("../extract-blocks");

const scriptsDir = path.join(__dirname, "../../Templates/Scripts");

function loadScorer() {
	const raw = extractArray(path.join(scriptsDir, "enrichSongNote.js"), "SONG_HEADER_BLOCK");
	const start = raw.indexOf("    const PC = ");
	const end = raw.indexOf("\n\n    const detectKey");
	assert.ok(start >= 0 && end > start, "key-detection region not found in SONG_HEADER_BLOCK — did PC/detectKey get renamed?");
	const slice = raw.slice(start, end);
	const wrapped = `(function() {\n${slice}\nreturn { parseChord, extractChords, bestKey };\n})()`;
	const { code } = transform(wrapped, { transforms: ["jsx"], disableESTransforms: true });
	return new Function(`return ${code};`)();
}

const { parseChord, extractChords, bestKey } = loadScorer();

function chordBlock(line) {
	return `\`\`\`chords\n${line}\n\`\`\``;
}

// --- chord-line detection: a line counts when >=60% of its words parse ---

test("extractChords keeps a line at exactly the 60% boundary", () => {
	// 3 of 5 words parse as chords (G, D, E) — 60%, included whole
	assert.equal(extractChords(chordBlock("G xyz abc D E")).length, 3);
});

test("extractChords drops a line just under the 60% boundary", () => {
	// 2 of 5 words parse (G, E) — 40%, below the threshold
	assert.equal(extractChords(chordBlock("G xyz abc why E")).length, 0);
});

test("extractChords skips [Section] markers and only reads ```chords fences", () => {
	const content = "```chords\n[Verse]\nG D Em C\n```\nsome prose with C D E F G that isn't fenced\n";
	assert.equal(extractChords(content).length, 4);
});

// --- bestKey: known progressions resolve to their known key ---

test("bestKey finds C major from a I-IV-V-I progression", () => {
	assert.equal(bestKey(extractChords(chordBlock("C F G C"))), "C");
});

test("bestKey finds A minor from an i-iv-V-i harmonic-minor cadence", () => {
	assert.equal(bestKey(extractChords(chordBlock("Am Dm E Am"))), "Am");
});

// --- bestKey: spelling follows the sheet's own accidentals (G#m, not Abm) ---

test("bestKey spells a sharp-heavy progression with sharps", () => {
	assert.equal(bestKey(extractChords(chordBlock("D#m G#m A#m D#m"))), "D#m");
});

test("bestKey spells a flat-heavy progression with flats", () => {
	assert.equal(bestKey(extractChords(chordBlock("Ebm Abm Bbm Ebm"))), "Ebm");
});

// --- parseChord: quality classification feeding the scorer ---

test("parseChord classifies quality (maj/min/dom/dim) and accidental direction", () => {
	assert.deepEqual(parseChord("G"), { pc: 7, cls: "maj", acc: 0 });
	assert.deepEqual(parseChord("Gm"), { pc: 7, cls: "min", acc: 0 });
	assert.deepEqual(parseChord("G7"), { pc: 7, cls: "dom", acc: 0 });
	assert.deepEqual(parseChord("Gdim"), { pc: 7, cls: "dim", acc: 0 });
	assert.deepEqual(parseChord("G#"), { pc: 8, cls: "maj", acc: 1 });
	assert.deepEqual(parseChord("Gb"), { pc: 6, cls: "maj", acc: -1 });
	assert.equal(parseChord("Gmaj7").cls, "maj"); // "maj" must not match the /^(m|min)/ minor test
	assert.equal(parseChord("H"), null); // not a valid root letter
});
