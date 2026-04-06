import re
from pathlib import Path

BOOKMARKS_DIR = Path("bookmarks")
OUTPUT_FILE = "fusion.html"

LINK_PATTERN = re.compile(
    r'<DT><A\s+HREF="[^"]+".*?</A>',
    re.IGNORECASE | re.DOTALL
)

html_files = sorted(BOOKMARKS_DIR.glob("*.html"))

if not html_files:
    raise RuntimeError("No se encontraron archivos HTML")

base_file = html_files[0]
with open(base_file, "r", encoding="utf-8") as f:
    base_content = f.read()

all_links = []

for html in html_files:
    with open(html, "r", encoding="utf-8") as f:
        all_links.extend(LINK_PATTERN.findall(f.read()))

if not all_links:
    raise RuntimeError("No se encontraron enlaces")

insert_pos = base_content.lower().rfind("</dl>")
if insert_pos == -1:
    raise RuntimeError("No se encontró </DL>")

merged_content = (
    base_content[:insert_pos]
    + "\n        " + "\n        ".join(all_links) + "\n"
    + base_content[insert_pos:]
)

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(merged_content)

print(f'[*] Archivos procesados: {len(html_files)}')
