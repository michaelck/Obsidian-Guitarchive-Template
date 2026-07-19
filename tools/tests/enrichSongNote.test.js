const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installGlobals, installFetch, notices } = require("./obsidian-fakes");

const script = require("../../Templates/Scripts/enrichSongNote.js");
const { matchStreamingService, streamingLinks, formatDuration, findTrack, coverArtUrl, resolveFromReleaseGroup, insertSongHeader, SONG_HEADER_BLOCK } = script.__test__;

// --- matchStreamingService: domain whitelist, https-only, no substring leaks ---

test("matchStreamingService accepts whitelisted hosts and their subdomains", () => {
	assert.equal(matchStreamingService("https://open.spotify.com/track/x").name, "Spotify");
	assert.equal(matchStreamingService("https://www.youtube.com/watch?v=x").name, "YouTube");
	assert.equal(matchStreamingService("https://elliottsmith.bandcamp.com/album/x").name, "Bandcamp");
});

test("matchStreamingService rejects http, lookalike hosts, and junk", () => {
	assert.equal(matchStreamingService("http://open.spotify.com/track/x"), null);
	// domain appearing in the path or as a prefix of another host must not pass
	assert.equal(matchStreamingService("https://evil.example/open.spotify.com"), null);
	assert.equal(matchStreamingService("https://notopen.spotify.com.evil.example/x"), null);
	assert.equal(matchStreamingService("not a url"), null);
	assert.equal(matchStreamingService(""), null);
});

test("streamingLinks keeps the first URL per service and skips rel entries without URLs", () => {
	const links = streamingLinks([
		{ url: { resource: "https://open.spotify.com/track/first" } },
		{ url: { resource: "https://open.spotify.com/track/second" } },
		{ url: {} },
		{},
		{ url: { resource: "https://tidal.com/track/x" } },
	]);
	assert.deepEqual([...links.entries()], [
		["Spotify", "https://open.spotify.com/track/first"],
		["Tidal", "https://tidal.com/track/x"],
	]);
	assert.equal(streamingLinks(null).size, 0);
});

// --- formatDuration / findTrack ---

test("formatDuration formats ms as m:ss with zero-padding, null on missing", () => {
	assert.equal(formatDuration(141000), "2:21");
	assert.equal(formatDuration(125400), "2:05");
	assert.equal(formatDuration(59600), "1:00"); // rounds up across the minute
	assert.equal(formatDuration(0), null);
	assert.equal(formatDuration(undefined), null);
});

test("findTrack prefers exact title match, tolerates '(Remastered)' via substring", () => {
	const release = {
		media: [
			{ tracks: [{ title: "Angeles (Remastered)" }, { title: "Angeles" }] },
			{ tracks: [{ title: "Between the Bars (Remastered)" }] },
		],
	};
	assert.equal(findTrack(release, "Angeles").title, "Angeles");
	assert.equal(findTrack(release, "between the bars").title, "Between the Bars (Remastered)");
	assert.equal(findTrack(release, "Say Yes"), undefined);
	assert.equal(findTrack({}, "Angeles"), undefined);
});

test("findTrack carries the medium's track-count and this track's position", () => {
	const release = {
		media: [{ "track-count": 11, tracks: [
			{ title: "Between the Bars", position: 4 },
			{ title: "Ballad of Big Nothing", position: 5 },
		] }],
	};
	const track = findTrack(release, "Between the Bars");
	assert.equal(track.position, 4);
	assert.equal(track.mediumTrackCount, 11);
});

test("findTrack falls back to tracks.length when track-count is missing", () => {
	const release = { media: [{ tracks: [{ title: "A", position: 1 }, { title: "B", position: 2 }] }] };
	assert.equal(findTrack(release, "B").mediumTrackCount, 2);
});

// --- coverArtUrl: a CAA 404 means "no art exists" (quiet), anything else
// --- means the archive is unreachable (notice, so the user re-runs later)

test("coverArtUrl stays quiet when both endpoints 404 — no art is normal", async () => {
	installGlobals();
	installFetch([["coverartarchive.org", {}, 404]]);
	assert.equal(await coverArtUrl("rel1", "rg1"), null);
	assert.deepEqual(notices, []);
});

test("coverArtUrl notifies on an outage instead of looking like a missing cover", async () => {
	installGlobals();
	installFetch([["coverartarchive.org", {}, 503]]);
	assert.equal(await coverArtUrl("rel1", "rg1"), null);
	assert.equal(notices.length, 1);
	assert.match(notices[0], /Cover Art Archive unreachable \(HTTP 503\)/);
	assert.match(notices[0], /Re-run Enrich Song/);
});

test("coverArtUrl falls back to release-group art past a release-level error, no notice", async () => {
	installGlobals();
	installFetch([
		["coverartarchive.org/release/rel1", {}, 503],
		["coverartarchive.org/release-group/rg1", { images: [{ front: true, image: "http://caa.example/front.jpg" }] }],
	]);
	const result = await coverArtUrl("rel1", "rg1");
	assert.equal(result.url, "https://caa.example/front.jpg");
	assert.equal(result.sourcePage, "https://musicbrainz.org/release-group/rg1/cover-art");
	assert.deepEqual(notices, []);
});

// --- resolveFromReleaseGroup: the full offline pipeline against synthetic
// --- MusicBrainz responses (stubbed fetch — the script's requestUrl path is
// --- unavailable under Node, so it falls back to global fetch)

function mbRoutes() {
	return [
		["/ws/2/release-group?query=", {
			"release-groups": [{ id: "rg1", title: "Either/Or", "first-release-date": "1997-02-25" }],
		}],
		["/ws/2/release-group/rg1", {
			releases: [
				{ id: "rel-late", date: "2001-05-01" },
				{ id: "rel-early", date: "1997" },
			],
			// slice(0,3) happens BEFORE the junk filter, so the junk entry
			// costs a slot: expect exactly ["indie rock", "rock"]
			genres: [
				{ name: "indie rock", count: 5 },
				{ name: "junk:entry", count: 9 },
				{ name: "rock", count: 3 },
				{ name: "folk", count: 2 },
			],
			relations: [
				{ url: { resource: "https://open.spotify.com/album/from-rg" } },
				{ url: { resource: "https://www.youtube.com/playlist?list=rg" } },
			],
			"primary-type": "Album",
		}],
		["/ws/2/release/rel-early", {
			"label-info": [{ label: { name: "Kill Rock Stars" } }],
			media: [{ "track-count": 11, tracks: [
				{ title: "Between the Bars", length: 141000, position: 4, recording: { id: "rec1" } },
				{ title: "Ballad of Big Nothing", length: 165000, position: 5, recording: { id: "rec2" } },
			] }],
			relations: [
				{ url: { resource: "https://open.spotify.com/album/from-release" } },
				{ url: { resource: "https://elliottsmith.bandcamp.com/album/either-or" } },
			],
		}],
		["/ws/2/recording/rec1", {
			relations: [{ url: { resource: "https://open.spotify.com/track/from-recording" } }],
		}],
		["coverartarchive.org/release/rel-early", {
			images: [{ front: true, image: "http://caa.example/front.jpg", thumbnails: { large: "http://caa.example/large.jpg" } }],
		}],
	];
}

test("resolveFromReleaseGroup: earliest release, curated genres only, listen precedence, https cover", async () => {
	installGlobals();
	installFetch(mbRoutes());
	const tp = { system: { suggester: () => assert.fail("suggester must not run for a single result") } };

	const result = await resolveFromReleaseGroup(tp, "Smith, Elliott", "Either/Or", "Between the Bars");

	assert.equal(result.album, "Either/Or");
	assert.equal(result.rgid, "rg1");
	assert.equal(result.year, "1997"); // from the EARLIEST release, not 2001
	assert.equal(result.label, "Kill Rock Stars"); // proves rel-early was the release fetched
	assert.equal(result.duration, "2:21");
	assert.equal(result.track, "4 of 11");
	assert.equal(result.albumType, "Album");
	assert.deepEqual(result.genres, ["indie rock", "rock"]);
	// most song-specific source wins per service: recording > release > release-group
	assert.deepEqual(result.listen, [
		"https://open.spotify.com/track/from-recording",
		"https://elliottsmith.bandcamp.com/album/either-or",
		"https://www.youtube.com/playlist?list=rg",
	]);
	// CAA plain-http URLs are force-upgraded for iOS
	assert.equal(result.cover.url, "https://caa.example/large.jpg");
	assert.equal(result.cover.sourcePage, "https://musicbrainz.org/release/rel-early/cover-art");
});

test("resolveFromReleaseGroup reports the last query tried when nothing matches", async () => {
	installGlobals();
	installFetch([["/ws/2/release-group?query=", { "release-groups": [] }]]);
	const result = await resolveFromReleaseGroup({}, "Nobody", "Nothing", "Nope");
	assert.equal(result.notFoundQuery, "Nobody Nothing");
});

// --- insertSongHeader ---

test("insertSongHeader inserts the block after frontmatter and strips old cover embeds", async () => {
	const path = "Songs/Test.md";
	const app = installGlobals({ files: [path], contents: { [path]: "---\nSong: Test\n---\n![Cover](http://x)\n\ntab body\n" } });
	await insertSongHeader({ path });
	assert.equal(app.contents[path], "---\nSong: Test\n---\n\n" + SONG_HEADER_BLOCK + "\ntab body\n");
});

test("insertSongHeader is idempotent — a body that already has the block is left alone", async () => {
	const path = "Songs/Test.md";
	const before = "---\nSong: Test\n---\n\n" + SONG_HEADER_BLOCK + "\ntab body\n";
	const app = installGlobals({ files: [path], contents: { [path]: before } });
	await insertSongHeader({ path });
	assert.equal(app.contents[path], before);
});
