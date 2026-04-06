document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("folderSelect");
  const folderLabel = document.getElementById("folder");
  const exportSelect = document.getElementById("export");

  const dupEl = document.getElementById("dup");
  const musicEl = document.getElementById("music");
  const totalEl = document.getElementById("total");

  const cleanBtn = document.getElementById("clean");
  const undoBtn = document.getElementById("undo");

  // Validación fuerte de UI
  const required = { select, folderLabel, exportSelect, dupEl, musicEl, totalEl, cleanBtn, undoBtn };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);

  if (missing.length) {
    console.error("Elementos de UI no encontrados:", missing.join(", "));
    return;
  }

  function buildTree(nodes, prefix = "") {
    nodes.forEach(n => {
      if (!n.url) {
        const opt = document.createElement("option");
        opt.value = n.id;
        opt.textContent = (prefix + (n.title || "")) || "(sin nombre)";
        select.appendChild(opt);

        if (n.children) buildTree(n.children, prefix + "  ");
      }
    });
  }

  chrome.bookmarks.getTree(tree => {
    select.innerHTML = "";
    buildTree(tree);
    folderLabel.textContent = select.value || "---";
  });

  select.addEventListener("change", () => {
    folderLabel.textContent = select.value || "---";
  });

  cleanBtn.addEventListener("click", () => {
    const folderId = select.value;
    if (!folderId) return;

    chrome.runtime.sendMessage(
      { type: "CLEAN_FOLDER", folderId },
      res => {
        if (!res) return;

        dupEl.textContent = String(res.duplicates ?? 0);
        musicEl.textContent = String(res.musicNormalized ?? 0);
        totalEl.textContent = String(res.total ?? 0);
      }
    );
  });

  undoBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "UNDO" });
  });

  // EXPORT
  exportSelect.addEventListener("change", () => {
    if (!exportSelect.value) return;

    const folderId = select.value;
    const format = exportSelect.value;

    chrome.bookmarks.getChildren(folderId, items => {
      const bookmarks = items.filter(b => b.url);

      let content = "";
      let mime = "text/plain";
      let ext = format;

      if (format === "txt") {
        content = bookmarks.map(b => `${b.title || ""}\n${b.url}\n`).join("\n");
      }

      if (format === "csv") {
        content =
          "title,url\n" +
          bookmarks
            .map(b => `"${(b.title || "").replace(/"/g, '""')}","${b.url}"`)
            .join("\n");
        mime = "text/csv";
      }

      if (format === "html") {
        mime = "text/html";
        ext = "html";
        content = buildNetscapeHTML(bookmarks);
      }

      downloadFile(`bookmarks_${folderId}.${ext}`, content, mime);
      exportSelect.value = "";
    });
  });

  function buildNetscapeHTML(bookmarks) {
    const now = Math.floor(Date.now() / 1000);
    const links = bookmarks.map(b => `
<DT><A HREF="${b.url}" ADD_DATE="${now}">${escapeHtml(b.title || "")}</A>
`).join("");

    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Automatically generated. DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${links}
</DL><p>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }
});
