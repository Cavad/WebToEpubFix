Independent WebToEpub maintenance fork. This release fixes downloads getting stuck on expired images and retains the parser fixes proposed in [upstream PR #3113](https://github.com/dteviot/WebToEpub/pull/3113):

- **Expired images no longer block downloads:** an image that returns HTTP 403 without a CAPTCHA page (for example, an expired signed link on a CDN such as `fbcdn.net` that shows "URL signature expired") is now skipped and logged instead of pausing the batch. Previously **Resume downloads** retried the same dead link and paused again indefinitely. Images still pause when the host returns a real CAPTCHA page.
- **Pause on interruptions:** HTTP 403 access checks, HTTP 429 rate limits, recognized CAPTCHA HTML (including HTTP 200 responses), unexpected HTML from JSON endpoints, and network fetch failures now pause the batch. Completed chapters stay in memory and queued requests wait. Use **Open page** to complete verification, then **Resume downloads** to retry the interrupted request. The EPUB is not packaged while paused. Keep the extension window open; progress is not persisted across closing it or restarting the browser.
- **Validation:** a simulated 150-chapter batch paused after chapter 100, blocked queued requests, and completed after resume without re-downloading finished chapters. Tests also cover repeated challenges, HTTP 200 challenge pages, network interruptions, rate limits, and the pause controls.

- **Pawchive discovery:** the chapter count and page progress now update during scanning. **Use loaded chapters** stops discovery, including an unfinished page request, and makes the chapters found so far available for selection. Large creator archives no longer have to finish scanning before you can select from loaded chapters.
- **Firefox download:** a direct unsigned `.xpi` is provided alongside the ZIP to simplify temporary installation.

- **Pawchive:** start from a creator page or any chapter, load all matching chapter-list pages, and choose chapters to include. Creator-page search/tag filters are retained, chapters are ordered oldest to newest, and missing attachment lists no longer cause an error.

- **Patreon:** preserve chapter content when the expected tagged title is absent.
- **Royal Road:** fetch the fiction's chapter list when opened on a chapter page, and resolve relative legacy chapter links.

Download the **Firefox `.xpi`** for Firefox desktop or the **Chromium ZIP** for Chrome, Edge, Brave, and Opera. In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select the downloaded `.xpi`. For Chromium, extract the ZIP and load its folder. See the [README](https://github.com/Cavad/WebToEpubFix#download-and-installation) for instructions.

The Firefox package is unsigned and requires temporary installation via `about:debugging`; it is removed when Firefox restarts. Mozilla signing is needed for permanent installation. Other Chromium browsers share the Chrome package but have not been individually tested. Safari and mobile packages are not included.

Lint, packaging, archive integrity checks, and relevant Chromium parser regression checks pass. Pawchive parsing was also checked against the live creator list, an individual chapter, and search results. Live Firefox and authenticated Patreon behavior remain unverified; a full-suite pass is not claimed. Source code and SHA-256 checksums are provided with the packages. This is not an official upstream release, and users are encouraged to return to upstream when the fixes become available there.
