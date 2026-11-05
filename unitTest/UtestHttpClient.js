
"use strict";

module("HttpClient");

QUnit.test("charsetFromHeaders", function (assert) {
    let evaluate = (val) => {
        let mockHeader = { get: () => val };
        return new FetchResponseHandler().charsetFromHeaders(mockHeader);
    };
 
    assert.equal(evaluate(null), "utf-8");
    assert.equal(evaluate("text/html"), "utf-8");
    assert.equal(evaluate("text/html; charset=utf-16"), "utf-16");
    assert.equal(evaluate("text/html; Charset=utf-17"), "utf-17");
    assert.equal(evaluate("text/html; Charset=\"utf-18\""), "utf-18");
    assert.equal(evaluate("text/html;Charset=\"utf-19\";something="), "utf-19");
    assert.equal(evaluate("text/html; Charset=utf-20 ;something="), "utf-20");
});

function createDummyFetchErrorHandler(response) {
    let handler = new FetchErrorHandler();
    handler.count = 0;
    handler.prompted = false;
    handler.retryFetch = function(url, wrapOptions) {
        ++handler.count;
        wrapOptions.retry.retryDelay.pop();
        return handler.onResponseError(url, wrapOptions, response);
    }
    handler.promptUserForRetry = function(url, wrapOptions, response, failError) {
        handler.prompted = true;
        return Promise.reject();
    }
    return {errorHandler: handler};
}

function testOnResponseError(assert, status, retries, prompted) {
    let done = assert.async(); 
    let response = {status: status}
    let wrapOptions = createDummyFetchErrorHandler(response);
    let handler = wrapOptions.errorHandler;
    return handler.onResponseError(null, wrapOptions, response)
        .catch(function() {
            assert.equal(handler.count, retries)
            assert.equal(handler.prompted, prompted)
            done();
        });
}

QUnit.test("onResponseError_404_error_fails_immediately", function (assert) {
    testOnResponseError(assert, 404, 0, false);
});

QUnit.test("onResponseError_500_error_retries_4_times", function (assert) {
    testOnResponseError(assert, 500, 4, false);
});

QUnit.test("onResponseError_504_error_retries_4_times", function (assert) {
    testOnResponseError(assert, 504, 4, true);
});

async function waitForDownloadPause() {
    let deadline = Date.now() + 5000;
    while (!HttpClient.pausedRequest) {
        if (Date.now() > deadline) throw new Error("Download did not pause");
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

function makeHttpTestResponse(url, body, status = 200, contentType = "text/html") {
    let response = new Response(body, {status, headers: {"Content-Type": contentType}});
    Object.defineProperty(response, "url", {value: url});
    return response;
}

QUnit.test("captchaPauses150ChapterBatchAndResumesWithoutLosingProgress", async function(assert) {
    let originalFetch = window.fetch;
    let originalCookies = HttpClient.setPartitionCookies;
    let solved = false;
    let attempts = [];
    let completed = [];
    let batch;
    let queued;
    try {
        HttpClient.setPartitionCookies = async () => {};
        window.fetch = async url => {
            attempts.push(url);
            return makeHttpTestResponse(url, "<p>Chapter content</p>", url.endsWith("/101") && !solved ? 403 : 200);
        };
        batch = (async () => {
            for (let chapter = 1; chapter <= 150; chapter++) {
                await HttpClient.wrapFetch("https://example.org/chapter/" + chapter);
                completed.push(chapter);
            }
        })();
        await waitForDownloadPause();
        assert.equal(completed.length, 100, "Keeps the first 100 completed chapters");
        queued = HttpClient.wrapFetch("https://example.org/queued-image");
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(attempts.length, 101, "No retry or queued request is sent while paused");
        solved = true;
        HttpClient.resumeDownloads();
        await Promise.all([batch, queued]);
        assert.equal(completed.length, 150, "Completes the full batch after resume");
        assert.equal(attempts.filter(url => url.endsWith("/101")).length, 2, "Retries the interrupted chapter");
        assert.equal(attempts.filter(url => url.endsWith("/1")).length, 1, "Does not download completed chapters again");
    } finally {
        solved = true;
        HttpClient.resumeDownloads();
        await Promise.allSettled([batch, queued]);
        window.fetch = originalFetch;
        HttpClient.setPartitionCookies = originalCookies;
    }
});

QUnit.test("htmlChallengeInsteadOfJsonPausesAgainUntilSolved", async function(assert) {
    let originalFetch = window.fetch;
    let originalCookies = HttpClient.setPartitionCookies;
    let solved = false;
    let attempts = 0;
    let request;
    try {
        HttpClient.setPartitionCookies = async () => {};
        window.fetch = async url => {
            attempts++;
            return solved ? makeHttpTestResponse(url, '{"content":"Full chapter"}', 200, "application/json")
                : makeHttpTestResponse(url, '<title>Verification</title><p>Complete verification</p>');
        };
        request = HttpClient.fetchJson("https://example.org/api/chapter");
        await waitForDownloadPause();
        assert.equal(attempts, 1, "HTML response pauses before JSON parsing fails");
        HttpClient.resumeDownloads();
        await waitForDownloadPause();
        assert.equal(attempts, 2, "Pauses again when verification remains unresolved");
        solved = true;
        HttpClient.resumeDownloads();
        let result = await request;
        assert.equal(result.json.content, "Full chapter");
    } finally {
        solved = true;
        HttpClient.resumeDownloads();
        await Promise.allSettled([request]);
        window.fetch = originalFetch;
        HttpClient.setPartitionCookies = originalCookies;
    }
});

QUnit.test("challengeDetectionDoesNotTreatNormalChapterAsCaptcha", async function(assert) {
    let url = "https://example.org/chapter";
    assert.ok(await HttpClient.isChallengeResponse(makeHttpTestResponse(url, '<title>Just a moment...</title><form id="challenge-form"></form>')));
    assert.notOk(await HttpClient.isChallengeResponse(makeHttpTestResponse(url, '<title>Chapter 10</title><p>The character solved a CAPTCHA.</p>')));
    assert.notOk(await HttpClient.isChallengeResponse(makeHttpTestResponse(url, '<title>Just a Moment</title><p>A fictional chapter about a CAPTCHA.</p>')));
});

QUnit.test("rateLimitPausesUntilUserResumes", async function(assert) {
    let originalFetch = HttpClient.wrapFetchImpl;
    let retried = false;
    let pending;
    try {
        HttpClient.wrapFetchImpl = async () => { retried = true; };
        pending = new FetchErrorHandler().onResponseError("https://example.org/", {}, {status: 429});
        await waitForDownloadPause();
        assert.notOk(retried);
        HttpClient.resumeDownloads();
        await pending;
        assert.ok(retried);
    } finally {
        HttpClient.resumeDownloads();
        await Promise.allSettled([pending]);
        HttpClient.wrapFetchImpl = originalFetch;
    }
});

QUnit.test("pauseBannerOpensNormalPawchivePageAndResumeRetries", async function(assert) {
    let fixture = document.getElementById("qunit-fixture");
    fixture.innerHTML = '<section id="downloadPauseNotice" hidden><p id="downloadPauseMessage"></p><button id="openChallengePageButton"></button><button id="resumeDownloadsButton"></button></section>';
    let originalFetch = HttpClient.wrapFetchImpl;
    let originalTabs = chrome.tabs;
    let opened;
    let retried = false;
    let pending;
    try {
        chrome.tabs = {create: options => { opened = options.url; }};
        HttpClient.wrapFetchImpl = async () => { retried = true; };
        pending = HttpClient.pauseAndRetry("https://pawchive.pw/api/v1/patreon/user/1/post/2", {}, 403);
        assert.notOk(document.getElementById("downloadPauseNotice").hidden);
        document.getElementById("openChallengePageButton").click();
        assert.equal(opened, "https://pawchive.pw/patreon/user/1/post/2");
        assert.notOk(retried);
        document.getElementById("resumeDownloadsButton").click();
        await pending;
        assert.ok(retried);
        assert.ok(document.getElementById("downloadPauseNotice").hidden);
    } finally {
        HttpClient.resumeDownloads();
        await Promise.allSettled([pending]);
        HttpClient.wrapFetchImpl = originalFetch;
        chrome.tabs = originalTabs;
    }
});

QUnit.test("networkFailurePausesButIntentionalAbortDoesNot", async function(assert) {
    let originalFetch = window.fetch;
    let originalCookies = HttpClient.setPartitionCookies;
    let connected = false;
    let request;
    try {
        HttpClient.setPartitionCookies = async () => {};
        window.fetch = async url => {
            if (!connected) throw new TypeError("Failed to fetch");
            return makeHttpTestResponse(url, '{"ok":true}', 200, "application/json");
        };
        request = HttpClient.fetchJson("https://example.org/api/chapter");
        await waitForDownloadPause();
        assert.ok(HttpClient.pausedRequest);
        connected = true;
        HttpClient.resumeDownloads();
        assert.ok((await request).json.ok);
        let aborted = false;
        try {
            await new FetchErrorHandler().onFetchError("https://example.org/", new DOMException("The operation was aborted", "AbortError"), {});
        } catch {
            aborted = true;
        }
        assert.ok(aborted);
        assert.notOk(HttpClient.pausedRequest, "An intentional abort never creates a pause");
    } finally {
        connected = true;
        HttpClient.resumeDownloads();
        await Promise.allSettled([request]);
        window.fetch = originalFetch;
        HttpClient.setPartitionCookies = originalCookies;
    }
});
