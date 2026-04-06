import re
import os

INPUT_FILE = "fusion.html"
OUTPUT_FILE = "clean.html"

# =========================
# PATRONES
# =========================

# Bloques completos de enlaces
LINK_BLOCK = re.compile(
    r'\s*<DT><A\s+HREF="([^"]+)".*?>(.*?)</A>',
    re.IGNORECASE | re.DOTALL
)

# Carpetas completas (H3 + su DL)
FOLDER_BLOCK = re.compile(
    r'\s*<DT><H3.*?>.*?</H3>\s*<DL><p>.*?</DL><p>',
    re.IGNORECASE | re.DOTALL
)

# =========================
# LEER ARCHIVO
# =========================
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# ❌ eliminar TODAS las carpetas (evita carpetas vacías)
content = FOLDER_BLOCK.sub("", content)

seen_urls = set()
seen_titles = set()
kept_blocks = []
duplicates_count = 0

def normalize(text):
    return text.strip().lower()

# =========================
# PROCESAR ENLACES
# =========================
for match in LINK_BLOCK.finditer(content):
    url, title = match.groups()

    url_key = url.strip()
    title_key = normalize(title)

    if url_key not in seen_urls and title_key not in seen_titles:
        kept_blocks.append(match.group(0).lstrip())
        seen_urls.add(url_key)
        seen_titles.add(title_key)
    else:
        duplicates_count += 1

total_links = len(LINK_BLOCK.findall(content))
total_kept = len(kept_blocks)

# =========================
# LIMPIAR HTML BASE
# =========================
content = LINK_BLOCK.sub("", content)

insert_pos = content.lower().rfind("</dl>")
if insert_pos == -1:
    raise RuntimeError("No se encontró </DL> en el archivo")

final_html = (
    content[:insert_pos]
    + "\n        " + "\n        ".join(kept_blocks) + "\n"
    + content[insert_pos:]
)

# =========================
# GUARDAR RESULTADO
# =========================
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(final_html)

# Borrar archivo temporal
os.remove(INPUT_FILE)

# =========================
# REPORTE FINAL
# =========================
print(f'[*] Total de enlaces: {total_links}')
print(f'[*] Archivo limpio generado: {OUTPUT_FILE}')
print(f'[-] Duplicados Borrados : {duplicates_count}')
