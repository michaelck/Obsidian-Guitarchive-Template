// Minimal stand-ins for the Obsidian globals the Templater scripts touch
// (`app`, `Notice`), so the scripts run under plain `node --test`. Only the
// API surface the scripts actually use is implemented — anything else
// throwing is a feature, since it means a script grew an untested Obsidian
// dependency.
//
// Usage: const { installGlobals, notices } = require("./obsidian-fakes");
//        installGlobals({ files, frontmatter, contents });

const notices = [];

class FakeNotice {
	constructor(message) {
		notices.push(String(message));
	}
}

// files:       array of vault paths that exist, e.g. ["Songs/Foo.md"]
// frontmatter: map of path -> frontmatter object (metadataCache)
// contents:    map of path -> body string (vault.process reads/writes these)
function makeApp({ files = [], frontmatter = {}, contents = {} } = {}) {
	const paths = new Set(files);
	const created = []; // [{ path, content }] — every vault.create call

	const app = {
		created,
		paths,
		contents,
		workspace: {
			activeFile: null,
			getActiveFile() {
				return this.activeFile;
			},
		},
		metadataCache: {
			getFileCache(file) {
				const fm = frontmatter[file.path];
				return fm === undefined ? null : { frontmatter: fm };
			},
		},
		fileManager: {
			// real signature: async (file, mutator) — mutator gets the live
			// frontmatter object; here that's the same object the test passed
			// in, so assertions read frontmatter[path] afterwards
			async processFrontMatter(file, mutator) {
				const fm = (frontmatter[file.path] ??= {});
				mutator(fm);
			},
		},
		vault: {
			getMarkdownFiles() {
				return [...paths].filter((p) => p.endsWith(".md")).map((p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, "") }));
			},
			getAbstractFileByPath(path) {
				return paths.has(path) ? { path } : null;
			},
			async createFolder(path) {
				paths.add(path);
			},
			async create(path, content) {
				paths.add(path);
				created.push({ path, content });
			},
			// the real process() requires a SYNCHRONOUS callback; enforce that
			// here so a test catches an accidental async mutator
			async process(file, mutator) {
				const result = mutator(contents[file.path]);
				if (result instanceof Promise) throw new Error("vault.process callback must be synchronous");
				contents[file.path] = result;
				return result;
			},
			adapter: {
				async writeBinary() {},
			},
		},
	};
	return app;
}

function installGlobals(appOptions) {
	const app = makeApp(appOptions);
	global.app = app;
	global.Notice = FakeNotice;
	notices.length = 0;
	return app;
}

// Routes global.fetch by URL substring: pass [[substring, responseData], ...];
// first match wins, unmatched URLs throw so tests notice unexpected requests.
// An optional third element sets the HTTP status ([substring, data, 503]) for
// testing error responses.
function installFetch(routes) {
	global.fetch = async (url) => {
		for (const [needle, data, status = 200] of routes) {
			if (url.includes(needle)) return { ok: status < 400, status, json: async () => data };
		}
		throw new Error(`unexpected fetch: ${url}`);
	};
}

module.exports = { installGlobals, installFetch, makeApp, notices };
