
"use strict";

module("UtestRoyalRoadParser");

QUnit.test("getChapterUrls_fromChapterPage", async function (assert) {
    let originalFetch = HttpClient.fetchText;
    let chapterUrl = "https://www.royalroad.com/fiction/118891/story/chapter/4261690/title?foo=bar#comments";
    let fictionUrl = "https://www.royalroad.com/fiction/118891/story";
    let dom = TestUtils.makeDomWithBody("");
    util.setBaseTag(chapterUrl, dom);
    try {
        HttpClient.fetchText = async (url) => {
            assert.equal(url, fictionUrl, "Fetches the fiction page");
            return '<script>window.chapters = [{"id":1,"title":"First","slug":"first"},{"id":2,"title":"Second","slug":"second"}];</script>';
        };
        let chapters = await new RoyalRoadParser().getChapterUrls(dom);
        assert.deepEqual(chapters.map(c => c.sourceUrl), [fictionUrl + "/chapter/1/first", fictionUrl + "/chapter/2/second"]);
        assert.deepEqual(chapters.map(c => c.title), ["First", "Second"]);
    } finally {
        HttpClient.fetchText = originalFetch;
    }
});

QUnit.test("fictionUrl", function (assert) {
    assert.equal(RoyalRoadParser.fictionUrl("https://www.royalroad.com/fiction/123/chapter/456"), "https://www.royalroad.com/fiction/123");
    assert.equal(RoyalRoadParser.fictionUrl("https://www.royalroad.com/fiction/123/story?x=1"), "https://www.royalroad.com/fiction/123/story?x=1");
});

QUnit.test("getChapterUrls_legacyTableResolvesRelativeLinks", async function (assert) {
    let originalFetch = HttpClient.fetchText;
    let dom = TestUtils.makeDomWithBody("");
    util.setBaseTag("https://www.royalroad.com/fiction/123/story/chapter/456/chapter", dom);
    try {
        HttpClient.fetchText = async () => '<table id="chapters"><tr><td><a href="/fiction/123/story/chapter/456/chapter">Chapter</a></td></tr></table>';
        let chapters = await new RoyalRoadParser().getChapterUrls(dom);
        assert.equal(chapters.length, 1);
        assert.equal(chapters[0].sourceUrl, "https://www.royalroad.com/fiction/123/story/chapter/456/chapter");
    } finally {
        HttpClient.fetchText = originalFetch;
    }
});

QUnit.test("removeOlderChapterNavJunk", function (assert) {
    let dom = TestUtils.makeDomWithBody(
        "<h1 id=\"e1\">&lt;--&gt;</h1>" +
        "<div id=\"d1\"><p id=\"p1\">1</p><p id=\"p2\">2</p><p id=\"p2\">&lt;--&gt;</p></div>" +
        "<h2 id=\"e2\">&lt;--&gt;</h2>"
    );
    assert.equal(dom.body.textContent, "<-->12<--><-->");
    RoyalRoadParser.removeOlderChapterNavJunk(dom.body);
    assert.equal(dom.querySelector("h1").textContent, "");
    assert.equal(dom.querySelector("div").textContent, "12");
    assert.equal(dom.body.textContent, "12");
});
