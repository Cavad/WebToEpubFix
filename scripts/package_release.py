"""Validate built extensions and package the fork's release assets."""

import hashlib
import json
from pathlib import Path
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "plugin/manifest.json").read_text())
version = manifest["version"]
output = ROOT / "release-artifacts"
output.mkdir(exist_ok=True)
assets = []

for browser, extension, manifest_version in [("Firefox", "xpi", 2), ("Chromium", "zip", 3)]:
    source = ROOT / "eslint" / f"WebToEpub{version}.{extension}"
    with zipfile.ZipFile(source) as archive:
        if archive.testzip() is not None:
            raise RuntimeError(f"Invalid archive: {source}")
        packaged = json.loads(archive.read("manifest.json"))
        assert packaged["version"] == version
        assert packaged["name"] == "WebToEpubFix"
        assert packaged["manifest_version"] == manifest_version
        if browser == "Firefox":
            assert packaged["browser_specific_settings"]["gecko"]["id"] == "WebToEpubFix@Cavad.github.io"
        else:
            assert "browser_specific_settings" not in packaged
        assert "title?.textContent.trim()" in archive.read("js/parsers/PatreonParser.js").decode()
        assert "RoyalRoadParser.fictionUrl(dom.baseURI)" in archive.read("js/parsers/RoyalRoadParser.js").decode()
        assert "PawchiveParser.creatorUrl(dom.baseURI)" in archive.read("js/parsers/PawchiveParser.js").decode()
    destination = output / f"WebToEpubFix-{version}-{browser}.zip"
    destination.write_bytes(source.read_bytes())
    assets.append(destination)
    print(f"Validated {destination.name}")

lockfile = ROOT / "package-lock.json"
if not lockfile.is_file():
    raise RuntimeError("Run npm install to generate the reviewer dependency lockfile")
source_archive = output / f"WebToEpubFix-{version}-Source.zip"
tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
with zipfile.ZipFile(source_archive, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in tracked:
        if name and (ROOT / name).is_file():
            archive.write(ROOT / name, name)
    if "package-lock.json" not in tracked:
        archive.write(lockfile, "package-lock.json")
assets.append(source_archive)
checksums = output / "SHA256SUMS.txt"
checksums.write_text("".join(f"{hashlib.sha256(asset.read_bytes()).hexdigest()}  {asset.name}\n" for asset in assets))
print(f"Created {source_archive.name} and {checksums.name}")
