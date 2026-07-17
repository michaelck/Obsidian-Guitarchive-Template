<%*
const songName = await tp.system.prompt("Song title?");
if (songName) await tp.file.rename(songName);
-%>
---
Artist: 
Song: <% songName %>
Album: 
Version: 
Tuning: Standard
Capo: 
Key: 
Favorite: false
Cover: 
Originally Tabbed By: 
Tab Source: 
cssclasses:
  - song-note

---

```datacorejsx
return function View() {
    const page = dc.useCurrentFile();

    const cover = page.value("Cover");
    // Cover is a remote URL or a vault-relative path (downloaded cover);
    // local paths must resolve to an app:// resource URL for <img>
    const coverSrc = cover && !/^https?:\/\//.test(cover) ? dc.app.vault.adapter.getResourcePath(cover) : cover;
    const coverSource = page.value("CoverSource");

    // hostname of a URL, or the raw string when it isn't a valid URL —
    // a malformed frontmatter value must never crash the whole header
    const hostnameOf = url => {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return String(url); }
    };

    // attribution label follows the CoverSource domain (enrichment uses the
    // Cover Art Archive, but e.g. a hand-picked Unsplash cover links there)
    const coverSourceLabel = coverSource
        ? (String(coverSource).includes("musicbrainz") ? "Cover Art Archive"
        : String(coverSource).includes("unsplash") ? "Unsplash"
        : hostnameOf(coverSource))
        : null;
    const artist = dc.coerce.array(page.value("Artist") ?? []).join(", ");
    const album = dc.coerce.array(page.value("Album") ?? []).join(", ");
    const genre = dc.coerce.array(page.value("Genre") ?? []).join(", ");
    const year = page.value("Release Year");
    const label = page.value("Label");
    const duration = page.value("Duration");
    const tuning = page.value("Tuning");
    const capo = page.value("Capo");
    const favorite = page.value("Favorite") === true;
    const listen = dc.coerce.array(page.value("Listen") ?? []).map(String);
    const tabbedBy = page.value("Originally Tabbed By");
    const tabSource = page.value("Tab Source");
    const key = page.value("Key");
    // which interpretation/arrangement this note holds, when the song has
    // more than one note ("Drop D, simplified") — one note per interpretation
    const version = page.value("Version");
    const capoFret = parseInt(capo, 10) || 0;
    const [keyStatus, setKeyStatus] = dc.useState("");

    // in-note trigger for enrichment — same Templater command the hotkey
    // fires, so it also works on mobile where there are no hotkeys. Hidden
    // when the command isn't registered (Templater missing/unconfigured).
    const ENRICH_COMMAND = "templater-obsidian:Templates/Scripts/Enrich Song.md";
    const canEnrich = !!dc.app.commands?.findCommand?.(ENRICH_COMMAND);

    // --- key detection (self-contained; runs on demand from the header link) ---
    // Scores the note's chord progression against all 24 major/minor keys by
    // diatonic membership; heuristic, so the result is written to frontmatter
    // where it can simply be corrected by hand if the guess is off.
    const PC = { C:0, "C#":1, Db:1, D:2, "D#":3, Eb:3, E:4, "E#":5, F:5, "F#":6, Gb:6, G:7, "G#":8, Ab:8, A:9, "A#":10, Bb:10, B:11, Cb:11, "B#":0 };
    const KEY_NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const KEY_NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];

    const parseChord = word => {
        const m = /^([A-G][#b]?)([A-Za-z0-9#b+°]*)?(?:\/[A-G][#b]?)?$/.exec(word);
        if (!m || PC[m[1]] === undefined) return null;
        const q = m[2] ?? "";
        const cls = /^(dim|°|m7b5)/.test(q) ? "dim"
            : /^(m|min)(?!aj)/.test(q) ? "min"
            : /^(7|9|11|13)/.test(q) ? "dom"
            : "maj";
        return { pc: PC[m[1]], cls, acc: m[1].includes("#") ? 1 : m[1].includes("b") ? -1 : 0 };
    };

    // chord lines = lines in a ```chords block where most words parse as chords
    const extractChords = content => {
        const tokens = [];
        for (const m of content.matchAll(/```chords\n([\s\S]*?)```/g)) {
            for (const line of m[1].split("\n")) {
                if (/^\s*\[/.test(line)) continue; // [Verse] section markers
                const words = line.trim().split(/\s+/).filter(Boolean);
                if (words.length === 0) continue;
                const parsed = words.map(parseChord).filter(Boolean);
                if (parsed.length >= words.length * 0.6) tokens.push(...parsed);
            }
        }
        return tokens;
    };

    // diatonic chord quality by semitone offset from the tonic
    const MAJOR_KEY = { 0:"maj", 2:"min", 4:"min", 5:"maj", 7:"maj", 9:"min", 11:"dim" };
    const MINOR_KEY = { 0:"min", 2:"dim", 3:"maj", 5:"min", 7:"min", 8:"maj", 10:"maj" };

    const bestKey = tokens => {
        // spell the result the way the sheet spells its chords (G#m, not Abm)
        const flats = tokens.filter(t => t.acc < 0).length;
        const sharps = tokens.filter(t => t.acc > 0).length;
        const names = flats > sharps ? KEY_NAMES_FLAT : KEY_NAMES_SHARP;
        let best = null, bestScore = -1;
        for (let tonic = 0; tonic < 12; tonic++) {
            for (const mode of ["maj", "min"]) {
                const table = mode === "maj" ? MAJOR_KEY : MINOR_KEY;
                let score = 0;
                tokens.forEach((t, i) => {
                    const off = (t.pc - tonic + 12) % 12;
                    const expected = table[off];
                    let points = 0;
                    if (expected === t.cls) points = 2;
                    else if (expected === "maj" && t.cls === "dom") points = 1.5; // dominant 7th on a major degree
                    else if (mode === "min" && off === 7 && (t.cls === "maj" || t.cls === "dom")) points = 2; // harmonic-minor V
                    else if (expected !== undefined) points = 0.5; // right root, unexpected quality
                    if (off === 0 && (i === 0 || i === tokens.length - 1) && points >= 1.5) points += 3; // opening/closing tonic
                    score += points;
                });
                if (score > bestScore) { bestScore = score; best = names[tonic] + (mode === "min" ? "m" : ""); }
            }
        }
        return best;
    };

    const detectKey = async () => {
        const file = dc.app.vault.getFileByPath(page.$path);
        if (!file) return;
        const content = await dc.app.vault.read(file);
        const tokens = extractChords(content);
        if (tokens.length < 3) { setKeyStatus("no chord lines found to analyze"); return; }
        const detected = bestKey(tokens);
        if (!detected) { setKeyStatus("couldn't determine a key"); return; }
        // writing frontmatter re-renders the header: the Key row replaces this link
        await dc.app.fileManager.processFrontMatter(file, fm => { fm.Key = detected; });
    };

    // what the shapes sound like once the capo is on
    const soundingKey = (() => {
        if (!key || !capoFret) return null;
        const m = /^([A-G][#b]?)(m?)/.exec(String(key));
        if (!m || PC[m[1]] === undefined) return null;
        const names = m[1].includes("b") ? KEY_NAMES_FLAT : KEY_NAMES_SHARP;
        return names[(PC[m[1]] + capoFret) % 12] + m[2];
    })();

    // human label for a streaming URL, derived from its domain
    const serviceName = url =>
        url.includes("spotify") ? "Spotify" :
        url.includes("apple") ? "Apple Music" :
        url.includes("bandcamp") ? "Bandcamp" :
        url.includes("youtu") ? "YouTube" :
        url.includes("soundcloud") ? "SoundCloud" :
        url.includes("tidal") ? "Tidal" :
        url.includes("deezer") ? "Deezer" :
        hostnameOf(url);

    // only render rows for fields that actually have a value
    const fields = [
        ["Artist", artist],
        ["Album", year ? `${album} (${year})` : album],
        ["Label", label],
        ["Genre", genre],
        ["Duration", duration],
        ["Tuning", tuning],
        ["Capo", capo],
        // with a capo on, also show what the shapes actually sound like
        ["Key", key ? (soundingKey ? `${key} (sounds as ${soundingKey} with capo ${capoFret})` : key) : null],
    ].filter(([, value]) => value);

    return (
        <>
            <div style={{ display: "flex", gap: "1.5em", alignItems: "flex-start", marginBottom: "1.5em" }}>
                {cover && (
                    <div style={{ flexShrink: 0 }}>
                        <img
                            src={coverSrc}
                            style={{ width: "160px", height: "160px", objectFit: "cover", borderRadius: "6px" }}
                        />
                        <div style={{ fontSize: "0.75em", color: "var(--text-muted)", marginTop: "0.25em", maxWidth: "160px" }}>
                            Cover art © respective rights holder
                            {coverSourceLabel && <>, via <a href={coverSource}>{coverSourceLabel}</a></>}
                        </div>
                    </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3em" }}>
                    <h1 style={{ margin: 0, fontSize: "1.4em" }}>
                        {favorite ? "❤️ " : ""}{page.value("Song") ?? page.$name}
                    </h1>
                    {version && (
                        <div style={{ fontSize: "0.9em", color: "var(--text-muted)", fontStyle: "italic" }}>{version}</div>
                    )}
                    {fields.map(([fieldName, value]) => (
                        <div key={fieldName}><strong>{fieldName}:</strong> {value}</div>
                    ))}
                    {listen.length > 0 && (
                        <div>
                            <strong>Listen:</strong>{" "}
                            {listen.map((url, i) => (
                                <span key={url}>{i > 0 ? " · " : ""}<a href={url}>{serviceName(url)}</a></span>
                            ))}
                        </div>
                    )}
                    {(tabbedBy || tabSource) && (
                        <div>
                            <strong>Original tab:</strong>{" "}
                            {tabSource ? <a href={tabSource}>{tabbedBy || "source"}</a> : tabbedBy}
                        </div>
                    )}
                    <div style={{ fontSize: "0.85em", color: "var(--text-muted)", marginTop: "0.2em", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                        {canEnrich && (
                            <a onClick={() => dc.app.commands.executeCommandById(ENRICH_COMMAND)} style={{ cursor: "pointer" }}>⟳ Enrich metadata</a>
                        )}
                        {!key && (
                            <span>
                                <a onClick={detectKey} style={{ cursor: "pointer" }}>♪ Detect key from chords</a>
                                {keyStatus ? <span> — {keyStatus}</span> : null}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            <hr/>
        </>
    );
}
```
