Independent WebToEpub maintenance fork with fixes proposed in [upstream PR #3113](https://github.com/dteviot/WebToEpub/pull/3113):

- **Patreon:** preserve chapter content when the expected tagged title is absent.
- **Royal Road:** fetch the fiction's chapter list when opened on a chapter page, and resolve relative legacy chapter links.

Download the **Firefox** ZIP for Firefox desktop or the **Chromium** ZIP for Chrome, Edge, Brave, and Opera. Extract the archive before installation. See the [README](https://github.com/Cavad/WebToEpubFix#download-and-installation) for instructions.

The Firefox package is unsigned and requires temporary installation via `about:debugging`; it is removed when Firefox restarts. Mozilla signing is needed for permanent installation. Other Chromium browsers share the Chrome package but have not been individually tested. Safari and mobile packages are not included.

Lint, packaging, archive integrity checks, and relevant Chromium parser regression checks pass. Live Firefox and authenticated Patreon behavior remain unverified; a full-suite pass is not claimed. Source code and SHA-256 checksums are provided with the packages. This is not an official upstream release, and users are encouraged to return to upstream when the fixes become available there.
