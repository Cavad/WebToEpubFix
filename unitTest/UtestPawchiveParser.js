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

QUnit.test("buildChapterWithoutAttachmentsAndMetadataFromPost", function(assert) {
    let parser = new PawchiveParser();
    let chapter = parser.buildChapter({title: "Chapter", content: "<p>Chapter body</p>"}, "https://pawchive.pw/patreon/user/1/post/2");
    assert.equal(parser.findContent(chapter).querySelector("p").textContent, "Chapter body");
    assert.equal(chapter.querySelector("h1").textContent, "Chapter");
    let dom = TestUtils.makeDomWithBody('<a class="post__user-name">Author</a><h1>Chapter title</h1>');
    assert.equal(parser.extractTitleImpl(dom).textContent, "Author");
    assert.equal(parser.extractAuthor(dom), "Author");
});
