let undoStack = [];

// Abre UI
chrome.commands?.onCommand.addListener(command => {
  if (command === "toggle-ui") openUi();
});

chrome.action.onClicked.addListener(() => openUi());

function openUi() {
  chrome.windows.create({
    url: chrome.runtime.getURL("ui.html"),
    type: "popup",
    width: 420,
    height: 320
  });
}

function cleanYouTubeUrl(url) {
  try {
    const u = new URL(url);

    // Normalizar dominio music -> www
    let musicNormalized = false;
    if (u.hostname === "music.youtube.com") {
      u.hostname = "www.youtube.com";
      musicNormalized = true;
    }

    // Solo limpiar /watch?v=...
    if (u.pathname !== "/watch") {
      return { url: u.toString(), musicNormalized };
    }

    const videoId = u.searchParams.get("v");
    if (!videoId) return { url: u.toString(), musicNormalized };

    const cleanParams = new URLSearchParams();
    cleanParams.set("v", videoId);

    // Mantener timestamp si existe
    if (u.searchParams.has("t")) {
      cleanParams.set("t", u.searchParams.get("t"));
    }

    u.search = cleanParams.toString();
    return { url: u.toString(), musicNormalized };
  } catch {
    return { url, musicNormalized: false };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLEAN_FOLDER") {
    const folderId = msg.folderId;
    if (!folderId) {
      sendResponse({ duplicates: 0, musicNormalized: 0, total: 0 });
      return true;
    }

    chrome.bookmarks.getChildren(folderId, items => {
      // reset undo
      undoStack = [];

      const seen = new Map(); // key=url -> bookmarkId kept
      let duplicates = 0;
      let musicNormalizedCount = 0;

      // 1) primero limpiamos URL y (si cambia) actualizamos (guardando undo)
      const toProcess = items.filter(b => b.url);

      let pending = toProcess.length;
      if (pending === 0) {
        sendResponse({ duplicates: 0, musicNormalized: 0, total: items.length });
        return;
      }

      const afterUpdate = () => {
        pending--;
        if (pending === 0) {
          // 2) después de normalizar, eliminamos duplicados por URL final
          chrome.bookmarks.getChildren(folderId, updatedItems => {
            const onlyUrls = updatedItems.filter(b => b.url);

            onlyUrls.forEach(b => {
              const key = b.url;

              if (seen.has(key)) {
                // guardar undo de remove (recrear con parentIndex)
                undoStack.push({
                  action: "create",
                  data: {
                    parentId: b.parentId,
                    index: b.index,
                    title: b.title,
                    url: b.url
                  }
                });

                chrome.bookmarks.remove(b.id);
                duplicates++;
              } else {
                seen.set(key, b.id);
              }
            });

            sendResponse({
              duplicates,
              musicNormalized: musicNormalizedCount,
              total: updatedItems.length
            });
          });
        }
      };

      toProcess.forEach(b => {
        const { url: cleanedUrl, musicNormalized } = cleanYouTubeUrl(b.url);
        if (musicNormalized) musicNormalizedCount++;

        if (cleanedUrl !== b.url) {
          // undo para update
          undoStack.push({
            action: "update",
            id: b.id,
            old: { title: b.title, url: b.url }
          });

          chrome.bookmarks.update(b.id, { url: cleanedUrl }, () => afterUpdate());
        } else {
          afterUpdate();
        }
      });
    });

    return true; // respuesta async
  }

  if (msg.type === "UNDO") {
    // revertimos en orden inverso (más seguro)
    const ops = undoStack.slice().reverse();

    const runNext = () => {
      const op = ops.shift();
      if (!op) {
        undoStack = [];
        return;
      }

      if (op.action === "create") {
        chrome.bookmarks.create(op.data, () => runNext());
        return;
      }

      if (op.action === "update") {
        chrome.bookmarks.update(op.id, op.old, () => runNext());
        return;
      }

      runNext();
    };

    runNext();
  }
});
