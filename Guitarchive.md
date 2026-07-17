---
cssclasses:
  - wide-page
---

```datacorejsx

// returns "-" for empty/undefined/empty-array values; joins list values (e.g. multiple albums)
// with ", "; otherwise returns the value itself
const orDash = value =>
    value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)
        ? "-"
        : Array.isArray(value)
        ? value.join(", ")
        : value;

// Cover may be a remote URL or a vault-relative path (downloaded cover);
// local paths must resolve to an app:// resource URL for <img>
const coverSrc = cover =>
    cover && !/^https?:\/\//.test(cover) ? dc.app.vault.adapter.getResourcePath(cover) : cover;

// flips the Favorite frontmatter property on a page; dc.useQuery re-renders automatically after the write
const toggleFavorite = async (page) => {
    const file = dc.app.vault.getFileByPath(page.$path);
    if (!file) return;
    await dc.app.fileManager.processFrontMatter(file, fm => {
        fm.Favorite = !(fm.Favorite === true);
    });
};

// one dashboard stat: big value over a muted label. Obsidian's own theme
// variables keep it readable in both light and dark mode.
const StatTile = ({ value, label }) => (
    <div style={{
        background: "var(--background-secondary)",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "8px",
        padding: "10px 16px",
        minWidth: "100px",
    }}>
        <div style={{ fontSize: "1.6em", fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
        <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>{label}</div>
    </div>
);

return function View() {
    const [direction, setDirection] = dc.useState("asc"); // sort direction for Artist column
    const [favoritesOnly, setFavoritesOnly] = dc.useState(false); // "Favorites only" toggle
    const [tuningFilter, setTuningFilter] = dc.useState(""); // "" means no filter (All)
    const [capoFilter, setCapoFilter] = dc.useState("");     // "" means no filter (All)
    const [search, setSearch] = dc.useState("");             // live text search across song/artist/album/genre

    // compact (two-column) layout whenever the pane is actually narrow — a
    // desktop window squeezed by sidebars or a split needs it as much as a
    // phone does, so measure the block's own container with a ResizeObserver
    // instead of only checking dc.app.isMobile
    const COMPACT_WIDTH = 750; // px — roughly where the six columns stop fitting
    const [compact, setCompact] = dc.useState(dc.app.isMobile);
    const measureRef = el => {
        if (!el || el._measured) return; // callback refs re-fire on every render
        el._measured = true;
        const update = () => {
            if (el.isConnected && el.clientWidth > 0) setCompact(el.clientWidth < COMPACT_WIDTH);
        };
        new ResizeObserver(update).observe(el); // also fires once on observe
    };

    const pages = dc.useQuery('@page and path("Songs")'); // all song pages
    const artistPages = dc.useQuery('@page and path("Artists")'); // artist pages, for linking artist names

    // artist name -> artist page link; names match via the artist page's Name
    // property (exact artist string), falling back to its filename
    const artistLinks = dc.useMemo(() => {
        const map = new Map();
        for (const page of artistPages) map.set(String(page.value("Name") ?? page.$name), page.$link);
        return map;
    }, [artistPages]);

    // headline counts for the stat tiles (unfiltered — they describe the whole vault)
    const stats = dc.useMemo(() => {
        const artists = new Set(
            pages.flatMap(page =>
                dc.coerce.array(page.value("Artist") ?? [])
                    .map(artist => String(artist ?? "").trim())
                    .filter(artist => artist.length > 0)
            )
        );
        const tunings = new Set(pages.map(page => page.value("Tuning")).filter(v => v));
        return {
            songs: pages.length,
            artists: artists.size,
            favorites: pages.filter(page => page.value("Favorite") === true).length,
            tunings: tunings.size,
        };
    }, [pages]);

    // five most recently created song notes, newest first
    const recent = dc.useMemo(
        () => [...pages]
            .sort((a, b) => (b.$ctime?.toMillis?.() ?? 0) - (a.$ctime?.toMillis?.() ?? 0))
            .slice(0, 5),
        [pages]
    );

    // build the dropdown options from every distinct Tuning value present in the vault
    const tuningOptions = dc.useMemo(() => {
        const distinct = Array.from(new Set(pages.map(page => orDash(page.value("Tuning"))))).sort();
        return [{ value: "", label: "All Tunings" }, ...distinct.map(v => ({ value: v, label: v }))];
    }, [pages]);

    // build the dropdown options from every distinct Capo value present in the vault
    const capoOptions = dc.useMemo(() => {
        const distinct = Array.from(new Set(pages.map(page => orDash(page.value("Capo"))))).sort();
        return [{ value: "", label: "All Capo Positions" }, ...distinct.map(v => ({ value: v, label: v }))];
    }, [pages]);

    // apply the Favorites/Tuning/Capo filters (page-level), then explode each page into one row
    // per artist so a song with multiple artists shows up under each artist's own section.
    // dc.coerce.array handles both a single-value Artist property and a list-type one.
    // case-insensitive substring match across the fields someone would search by
    const query = search.trim().toLowerCase();
    const matchesSearch = page => {
        if (!query) return true;
        return [
            page.value("Song") ?? page.$name,
            ...dc.coerce.array(page.value("Artist") ?? []),
            ...dc.coerce.array(page.value("Album") ?? []),
            ...dc.coerce.array(page.value("Genre") ?? []),
        ].some(value => String(value ?? "").toLowerCase().includes(query));
    };

    const exploded = dc.useArray(
        pages,
        array => array
            .filter(matchesSearch)
            .filter(page => !favoritesOnly || page.value("Favorite") === true)
            .filter(page => !tuningFilter || orDash(page.value("Tuning")) === tuningFilter)
            .filter(page => !capoFilter || orDash(page.value("Capo")) === capoFilter)
            .flatMap(page => {
                // normalize to non-empty strings (YAML can hand back null, or a
                // number for names like "311"); a song with no Artist still gets
                // a row instead of silently vanishing from the index
                const artists = dc.coerce.array(page.value("Artist") ?? [])
                    .map(artist => String(artist ?? "").trim())
                    .filter(artist => artist.length > 0);
                return (artists.length > 0 ? artists : ["Unknown Artist"]).map(artist => ({ page, artist }));
            }),
        [favoritesOnly, tuningFilter, capoFilter, search]
    );

    // sort by Song, then by Artist (stable sort, so Artist wins as the primary key)
    const sorted = dc.useArray(
        exploded,
        array => array
            .sort(row => row.page.value("Song"))
            .sort(row => row.artist, direction),
        [direction]
    );

    // mark each row with whether it's the first song for that artist (for collapsing repeats)
    const rows = dc.useMemo(() => {
        let lastArtist;
        return sorted.map(row => {
            const showArtist = row.artist !== lastArtist;
            lastArtist = row.artist;
            return { ...row, showArtist };
        });
    }, [sorted]);

    // group rows into A/B/C... sections by first letter of artist
    const grouped = dc.useArray(
        rows,
        array => array.groupBy(
            row => row.artist[0].toUpperCase(),
            (a, b) => direction === "asc" ? a.localeCompare(b) : b.localeCompare(a)
        ),
        [direction]
    );

    const COLUMNS = [
        {
            id: "Artist",
            title: ( // clickable header toggles sort direction
                <span onClick={() => setDirection(d => (d === "asc" ? "desc" : "asc"))} style={{ cursor: "pointer" }}>
                    Artist {direction === "asc" ? "▲" : "▼"}
                </span>
            ),
            value: row => (row.showArtist ? row.artist : ""), // blank unless first row for this artist
            // link the name to its Artists/ page when one exists (created via
            // the Sync Artist Pages template); plain text otherwise
            render: value => {
                if (!value) return <></>;
                const link = artistLinks.get(value);
                return link ? <dc.Link link={link.withDisplay(value)} /> : <>{value}</>;
            }
        },
        {
            id: "Song",
            value: row => row.page.value("Song") ?? row.page.$name, // fall back to the filename
            render: (value, row) => <dc.Link link={row.page.$link.withDisplay(value)} /> // link to the file, showing the Song title
        },
        {
            id: "Favorite", // moved away from Artist so it doesn't read as part of the artist name
            title: "♡", // unfavorited heart glyph used as the column header instead of text
            value: row => row.page.value("Favorite") === true,
            render: (isFavorite, row) => ( // clickable heart, toggles the Favorite frontmatter property
                <span onClick={() => toggleFavorite(row.page)} style={{ cursor: "pointer" }}>
                    {isFavorite ? "❤️" : "♡"}
                </span>
            )
        },
        // render (not value) so a bare "-" is shown as plain text instead of being
        // parsed as markdown (a standalone "-" is normally a bullet list marker)
        {
            id: "Album",
            value: row => orDash(row.page.value("Album")),
            // prepend a tiny cover thumbnail before the album title, only when Cover is set.
            // CSS grid (not flex) gives the thumbnail a genuine fixed-width track, so a
            // wrapping title stays confined to the second track instead of flowing back
            // out to the far left underneath the image.
            render: (value, row) => {
                const cover = row.page.value("Cover");
                if (!cover) return <>{value}</>;
                return (
                    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", columnGap: "4px", alignItems: "start" }}>
                        <img
                            src={coverSrc(cover)}
                            // small top nudge so the image's top edge lines up with the text's
                            // cap-height rather than the taller line-box the grid track aligns to
                            style={{ width: "16px", height: "16px", objectFit: "cover", borderRadius: "3px", marginTop: "3px" }}
                        />
                        <span>{value}</span>
                    </div>
                );
            }
        },
        { id: "Tuning", value: row => orDash(row.page.value("Tuning")), render: value => <>{value}</> },
        { id: "Capo", value: row => orDash(row.page.value("Capo")), render: value => <>{value}</> }
    ];

    // in a narrow pane (phones, but also squeezed desktop windows) the
    // six-column table forces horizontal scrolling; collapse to two columns —
    // a composite cell (song link over a muted detail line) plus the ♡ toggle
    const COMPACT_COLUMNS = [
        {
            id: "Song",
            title: ( // same clickable artist-sort toggle as the full-width header
                <span onClick={() => setDirection(d => (d === "asc" ? "desc" : "asc"))} style={{ cursor: "pointer" }}>
                    Songs by artist {direction === "asc" ? "▲" : "▼"}
                </span>
            ),
            value: row => row.page.value("Song") ?? row.page.$name,
            render: (value, row) => {
                const page = row.page;
                const cover = page.value("Cover");
                const album = orDash(page.value("Album"));
                const tuning = orDash(page.value("Tuning"));
                const capo = orDash(page.value("Capo"));
                // artist always; album when set; tuning only when non-Standard;
                // capo when set — keeps the detail line short on small screens
                const details = [
                    row.artist,
                    album !== "-" ? album : null,
                    tuning !== "-" && tuning !== "Standard" ? tuning : null,
                    capo !== "-" ? `capo ${capo}` : null,
                ].filter(Boolean).join(" · ");
                return (
                    <div style={{ display: "grid", gridTemplateColumns: cover ? "16px 1fr" : "1fr", columnGap: "6px", alignItems: "start" }}>
                        {cover && (
                            <img
                                src={coverSrc(cover)}
                                style={{ width: "16px", height: "16px", objectFit: "cover", borderRadius: "3px", marginTop: "3px" }}
                            />
                        )}
                        <div>
                            <dc.Link link={page.$link.withDisplay(value)} />
                            <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>{details}</div>
                        </div>
                    </div>
                );
            }
        },
        COLUMNS.find(column => column.id === "Favorite"), // ♡ toggle, unchanged
    ];

    return (
        <div ref={measureRef}>
            {/* headline stats for the whole vault (ignores the filters below) */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                <StatTile value={stats.songs} label="Songs" />
                <StatTile value={stats.artists} label="Artists" />
                <StatTile value={stats.favorites} label="Favorites" />
                <StatTile value={stats.tunings} label="Tunings" />
            </div>
            {recent.length > 0 && (
                <div style={{ marginBottom: "12px", fontSize: "0.9em", color: "var(--text-muted)" }}>
                    <strong style={{ color: "var(--text-normal)" }}>Recently added:</strong>{" "}
                    {recent.map((page, i) => (
                        <span key={page.$path}>
                            {i > 0 ? " · " : ""}
                            <dc.Link link={page.$link.withDisplay(page.value("Song") ?? page.$name)} />
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
                {/* plain <input> (inherits Obsidian's theme styling); onInput fires
                    per keystroke in preact, onChange kept as a fallback */}
                <input
                    type="search"
                    placeholder="Search songs, artists, albums…"
                    value={search}
                    onInput={e => setSearch(e.target.value)}
                    onChange={e => setSearch(e.target.value)}
                    style={{ minWidth: "220px" }}
                />
                {/* dc.Switch has no built-in label, so wrap it in our own */}
                <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <dc.Switch checked={favoritesOnly} onToggleChange={setFavoritesOnly} />
                    Favorites only
                </label>
                <dc.VanillaSelect options={tuningOptions} value={tuningFilter} onValueChange={setTuningFilter} />
                <dc.VanillaSelect options={capoOptions} value={capoFilter} onValueChange={setCapoFilter} />
            </div>
            {/* overflow-x keeps any residual overflow scrollable inside the
                note instead of clipping at the pane edge */}
            <div style={{ overflowX: "auto" }}>
                <dc.Table columns={compact ? COMPACT_COLUMNS : COLUMNS} rows={grouped} /> {/* grouped rows render with A/B/C section headers */}
            </div>
        </div>
    );
}

```