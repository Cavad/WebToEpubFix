"use strict";

parserFactory.registerRule(
    (url, dom) => PawchiveParser.isPawchive(dom),
    () => new PawchiveParser()
);

class PawchiveParser extends Parser {
    static isPawchive(dom) {
        let baseUrl = new URL(dom.baseURI);
        return baseUrl.hostname.split(".")[0] === "pawchive";
    }

    async getChapterUrls(dom, chapterUrlsUI) {
        let firstUrl = PawchiveParser.creatorUrl(dom.baseURI);
        firstUrl.searchParams.set("o", 0);
        let firstHtml = (await HttpClient.wrapFetch(firstUrl.href)).responseXML;
        let chapters = (await this.walkTocPages(firstHtml,
            PawchiveParser.getChapterUrlsFromTocPage,
            PawchiveParser.nextTocPageUrl,
            chapterUrlsUI
        )).reverse();
        return chapters;
    }

    static creatorUrl(url) {
        let creatorUrl = new URL(url);
        let match = creatorUrl.pathname.match(/^\/[^/]+\/user\/[^/]+/);
        if (match === null) {
            throw new Error("Open a Pawchive creator or post page to select chapters.");
        }
        creatorUrl.pathname = match[0];
        creatorUrl.hash = "";
        return creatorUrl;
    }

    static nextTocPageUrl(dom) {
        let link = dom.querySelector("#paginator-top a.next");
        if (link === null) {
            return null;
        }
        let current = new URL(dom.baseURI);
        let next = new URL(link.getAttribute("href"), dom.baseURI);
        return next.origin === current.origin && next.pathname === current.pathname &&
            Number(next.searchParams.get("o")) > Number(current.searchParams.get("o"))
            ? next.href : null;
    }

    static getChapterUrlsFromTocPage(dom) {
        if (dom == null) {
            return [];
        }
        let creator = PawchiveParser.creatorUrl(dom.baseURI);
        let links = [...dom.querySelectorAll("article.post-card a[href]")];
        links = links.filter(a => {
            let url = new URL(a.getAttribute("href"), dom.baseURI);
            return url.origin === creator.origin && url.pathname.startsWith(creator.pathname + "/post/");
        });
        return links.map(a => ({
            sourceUrl: new URL(a.getAttribute("href"), dom.baseURI).href,
            title: (a.querySelector("header") ?? a).textContent.trim()
        }));
    }

    async fetchChapter(url) {
        let jsonUrl = new URL(url);
        jsonUrl.pathname = "/api/v1" + jsonUrl.pathname;

        let post = await this.fetchJson(jsonUrl.href);
        return this.buildChapter(post, url);
    }

    buildChapter(post, url) {
        let newDoc = Parser.makeEmptyDocForContent(url);

        let header = newDoc.dom.createElement("h1");
        header.textContent = post.title;
        newDoc.content.appendChild(header);

        let content = util.sanitize(this.escapeUnknownTags(post.content ?? ""));
        util.moveChildElements(content.body, newDoc.content);

        let attachments = post.attachments ?? [];
        if (attachments.length > 0) {
            let attachHeader = newDoc.dom.createElement("h2");
            attachHeader.textContent = "Attachments";
            newDoc.content.appendChild(attachHeader);

            for (let att of attachments) {
                if (this.isImageFileName(att.name)) {
                    let img = newDoc.dom.createElement("img");
                    img.src = this.buildImageUrl(att.path);
                    img.alt = att.name;
                    newDoc.content.appendChild(img);
                } else {
                    let link = newDoc.dom.createElement("a");
                    link.href = this.buildFileUrl(att.path);
                    link.textContent = att.name;
                    newDoc.content.appendChild(link);
                    newDoc.content.appendChild(newDoc.dom.createElement("br"));
                }
            }
        }

        return newDoc.dom;
    }

    escapeUnknownTags(html) {
        return html.replace(/<([^<>]+)>/g, (match, inner) => {
            let candidate = inner.trim();
            if (candidate.startsWith("!--") ||
                /^!doctype\b/i.test(candidate) ||
                candidate.startsWith("?")) {
                return match;
            }
            let tag = candidate.match(/^\/?\s*([A-Za-z][\w:-]*)/);
            if (tag !== null && this.isKnownHtmlTag(tag[1])) {
                return match;
            }
            return `&lt;${inner}&gt;`;
        });
    }

    isKnownHtmlTag(tagName) {
        let element = document.createElement(tagName);
        return element.constructor.name !== "HTMLUnknownElement";
    }

    buildImageUrl(path) {
        return new URL(
            "/thumbnail/data" + this.normalizePath(path),
            "https://img.pawchive.pw"
        ).href;
    }

    buildFileUrl(path) {
        return new URL("/data" + this.normalizePath(path), "https://pawchive.pw")
            .href;
    }

    normalizePath(path) {
        return path.startsWith("/") ? path : "/" + path;
    }

    isImageFileName(name) {
        name = name.toLowerCase();

        return (
            name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".png") ||
            name.endsWith(".gif") ||
            name.endsWith(".webp") ||
            name.endsWith(".bmp") ||
            name.endsWith(".svg")
        );
    }

    findCoverImageUrl(dom) {
        let cover = dom.querySelector(".user-header__avatar img, .post__user-profile img");
        return cover?.src ?? null;
    }

    async fetchJson(url) {
        let options = {
            headers: {
                Accept: "*/*"
            }
        };

        return (await HttpClient.fetchJson(url, options)).json;
    }

    findContent(dom) {
        return Parser.findConstructedContent(dom);
    }

    extractTitleImpl(dom) {
        return dom.querySelector(".user-header__name, .post__user-name") ?? dom.querySelector("h1");
    }

    extractAuthor(dom) {
        let author = dom.querySelector(".user-header__name, .post__user-name");
        return author?.textContent.trim() || super.extractAuthor(dom);
    }
}
