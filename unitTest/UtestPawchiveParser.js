"use strict";

module("UtestPawchiveParser");

QUnit.test("chapterPageLoadsFilteredCreatorPages", async function(assert) {
    let originalFetch = HttpClient.wrapFetch;
    let creator = "https://pawchive.pw/patreon/user/207666427";
    let makePage = (url, body) => {
        let dom = TestUtils.makeDomWithBody(body);
        util.setBaseTag(url, dom);
        return dom;
    };
    let first = makePage(creator + "?q=story&o=0",
        '<article class="post-card"><a href="/patreon/user/207666427/post/2"><header>Second</header></a></article>' +
        '<div id="paginator-top"><a class="next" href="?q=story&o=50">Next</a></div>');
    let last = makePage(creator + "?q=story&o=50",
        '<article class="post-card"><a href="/patreon/user/207666427/post/1"><header>First</header></a></article>');
    let calls = [];
    try {
        HttpClient.wrapFetch = async url => {
            calls.push(url);
            return {responseXML: calls.length === 1 ? first : last};
        };
        let parser = new PawchiveParser();
        parser.rateLimitDelay = async () => {};
        let chapterDom = makePage(creator + "/post/2?q=story#comments", "");
        let chapters = await parser.getChapterUrls(chapterDom, {showTocProgress: () => {}});
        assert.deepEqual(calls, [creator + "?q=story&o=0", creator + "?q=story&o=50"]);
        assert.deepEqual(chapters.map(c => c.title), ["First", "Second"]);
        assert.deepEqual(chapters.map(c => c.sourceUrl), [creator + "/post/1", creator + "/post/2"]);
    } finally {
        HttpClient.wrapFetch = originalFetch;
    }
});

QUnit.test("paginationStopsAtLastOrRepeatedPage", function(assert) {
    let dom = TestUtils.makeDomWithBody('<div id="paginator-top"><a class="next" href="?o=50">Next</a></div>');
    util.setBaseTag("https://pawchive.pw/patreon/user/1?o=50", dom);
    assert.strictEqual(PawchiveParser.nextTocPageUrl(dom), null);
    dom.querySelector("a").remove();
    assert.strictEqual(PawchiveParser.nextTocPageUrl(dom), null);
});

QUnit.test("useLoadedChaptersFinishesDuringPendingPageRequest", async function(assert) {
    let originalFetch = HttpClient.wrapFetch;
    let useLoaded;
    let disposed = false;
    let pendingSignal;
    let dom = TestUtils.makeDomWithBody("");
    util.setBaseTag("https://pawchive.pw/patreon/user/1", dom);
    let first = TestUtils.makeDomWithBody('<article class="post-card"><a href="/patreon/user/1/post/2"><header>Loaded</header></a></article><div id="paginator-top"><a class="next" href="?o=50">Next</a></div>');
    util.setBaseTag(dom.baseURI + "?o=0", first);
    try {
        HttpClient.wrapFetch = async (url, options) => {
            if (url.endsWith("o=0")) return {responseXML: first};
            pendingSignal = options.fetchOptions.signal;
            useLoaded();
            return new Promise(() => {});
        };
        let parser = new PawchiveParser();
        parser.rateLimitDelay = async () => {};
        let chapters = await parser.getChapterUrls(dom, {
            showTocProgress: () => {},
            beginTocScan: callback => {
                useLoaded = callback;
                return {update: count => assert.equal(count, 1), dispose: () => { disposed = true; }};
            }
        });
        assert.equal(chapters.length, 1);
        assert.equal(chapters[0].title, "Loaded");
        assert.ok(pendingSignal.aborted, "Aborts the unfinished page fetch");
        assert.ok(disposed, "Removes the discovery controls");
    } finally {
        HttpClient.wrapFetch = originalFetch;
    }
});

QUnit.test("scanControlsShowCountAndAllowUsingLoadedChapters", function(assert) {
    let fixture = document.getElementById("qunit-fixture");
    fixture.innerHTML = '<span id="spanChapterCount">0</span>';
    let used = false;
    let ui = new ChapterUrlsUI(null);
    let scan = ui.beginTocScan(() => { used = true; });
    let row = ChapterUrlsUI.getPleaseWaitMessageRow();
    let button = row.querySelector("button");
    assert.ok(button.disabled, "Cannot finish before any chapters are loaded");
    scan.update(50, 1);
    assert.equal(document.getElementById("spanChapterCount").textContent, "50");
    assert.notOk(button.disabled);
    button.click();
    assert.ok(used);
    scan.dispose();
    assert.strictEqual(row.querySelector("button"), null);
    assert.ok(row.hidden);
});

QUnit.test("buildChapterWithoutAttachmentsAndMetadataFromPost", function(assert) {
    let parser = new PawchiveParser();
    let chapter = parser.buildChapter({title: "Chapter", content: "<p>Chapter body</p>"}, "https://pawchive.pw/patreon/user/1/post/2");
    assert.equal(parser.findContent(chapter).querySelector("p").textContent, "Chapter body");
    assert.equal(chapter.querySelector("h1").textContent, "Chapter");
    let dom = TestUtils.makeDomWithBody('<a class="post__user-name">Author</a><h1>Chapter title</h1>');
    assert.equal(parser.extractTitleImpl(dom).textContent, "Author");
    assert.equal(parser.extractAuthor(dom), "Author");
});
