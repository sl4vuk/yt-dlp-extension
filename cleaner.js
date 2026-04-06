// cleaner.js
(() => {

    const KEEP_PARAMS = new Set(["v", "t"]);

    function cleanYouTubeUrl() {
        const url = new URL(window.location.href);

        // Solo páginas de video
        if (!url.pathname.startsWith("/watch")) return;

        const videoId = url.searchParams.get("v");
        if (!videoId) return;

        // Construir params limpios
        const cleanParams = new URLSearchParams();
        cleanParams.set("v", videoId);

        // Mantener timestamp si existe
        if (url.searchParams.has("t")) {
            cleanParams.set("t", url.searchParams.get("t"));
        }

        const cleanUrl =
            `${url.origin}${url.pathname}?${cleanParams.toString()}`;

        if (cleanUrl !== window.location.href) {
            history.replaceState(null, "", cleanUrl);
        }
    }

    // Ejecutar al cargar
    cleanYouTubeUrl();

    // YouTube es SPA → detectar navegación interna
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            cleanYouTubeUrl();
        }
    }).observe(document, { subtree: true, childList: true });

})();
