#!/usr/bin/env python3
"""Derive the light-theme diagrams from the dark ones, and check they are valid.

Each `*.dark.svg` carries its colours in a single `:root` block between the
/*PALETTE*/ markers and uses them only through `var(--token)`. The light file is
the same markup with that one block swapped, so the two themes can never drift
apart in layout — only in colour.

    python3 docs/assets/build.py            # write the light files
    python3 docs/assets/build.py --check    # fail if they are out of date (CI)
"""

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).parent

LIGHT = {
    "pipeline": "--card:#ffffff;--card2:#ffffff;--bd:#d1d9e0;--tx:#1f2328;--mu:#59636e;"
                "--dim:#818b98;--ac:#bc4c2e;--acbd:#bc4c2e;--acsoft:#fdf1ec;--bl:#0969da;--tr:#d1d9e0",
    "timing":   "--card:#ffffff;--card2:#ffffff;--bd:#d1d9e0;--tx:#1f2328;--mu:#59636e;"
                "--dim:#818b98;--ac:#bc4c2e;--acbd:#bc4c2e;--acsoft:#fdf1ec;--bl:#0969da;"
                "--blsoft:#eaf2fd;--tr:#d1d9e0;--wave:#6ea2d8",
    "banner":   "--card:#ffffff;--bd:#d1d9e0;--tx:#1f2328;--mu:#59636e;--dim:#818b98;"
                "--ac:#bc4c2e;--acbd:#c97054;--bl:#0969da;--beam:#d97757;--beamop:.10;--chip:#f6f8fa",
}

PALETTE = re.compile(r"(/\*PALETTE\*/\n:root\{)(.*?)(\}\n/\*ENDPALETTE\*/)", re.S)


def lint(path: Path, svg: str) -> None:
    ET.fromstring(svg)  # well-formed XML, or this raises
    if "<script" in svg.lower():
        sys.exit(f"{path.name}: scripts are not allowed in a README asset")
    used = set(re.findall(r"var\((--[a-z0-9-]+)", svg))
    declared = set(re.findall(r"(--[a-z0-9-]+)\s*:", svg))
    if missing := used - declared:
        sys.exit(f"{path.name}: colour tokens used but never declared: {sorted(missing)}")


def main() -> None:
    check = "--check" in sys.argv
    stale = []

    for name, palette in LIGHT.items():
        dark_path = HERE / f"{name}.dark.svg"
        light_path = HERE / f"{name}.light.svg"
        dark = dark_path.read_text()

        light, hits = PALETTE.subn(lambda m: m.group(1) + palette + m.group(3), dark)
        if hits != 1:
            sys.exit(f"{dark_path.name}: expected exactly one /*PALETTE*/ block, found {hits}")

        lint(dark_path, dark)
        lint(light_path, light)

        if check:
            if not light_path.exists() or light_path.read_text() != light:
                stale.append(light_path.name)
        else:
            light_path.write_text(light)
            print(f"wrote {light_path.name}")

    if stale:
        sys.exit("out of date, re-run docs/assets/build.py: " + ", ".join(stale))
    print("assets ok" if check else "done")


if __name__ == "__main__":
    main()
