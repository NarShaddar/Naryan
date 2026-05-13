// ==========================================
// IMAGE LOADER — Mixed content workaround
// ==========================================
// A WebView2 https://naryan.local origin-ből HTTP-re mutató képeket részben blokkolja
// (passive mixed content / MixedContentAutoupgrade). Ezért minden HTTP avatar / attachment
// képet fetch-elünk JS-ből, blob URL-be konvertálunk, és úgy adjuk az <img>/background-nak.
//
// Cache-elve, hogy ugyanaz a kép ne töltődjön le többször.
// ==========================================

window.naryanImageCache = window.naryanImageCache || new Map();

// Egyetlen URL → blob URL Promise (cache-elve)
window.naryanGetBlobUrl = function (httpUrl) {
    if (!httpUrl) return Promise.resolve(null);

    // Ha már blob: vagy data: URL, vagy a virtual host-on van, közvetlenül visszaadhatjuk
    if (httpUrl.startsWith('blob:') || httpUrl.startsWith('data:') || httpUrl.startsWith('https://naryan.local')) {
        return Promise.resolve(httpUrl);
    }

    if (window.naryanImageCache.has(httpUrl)) {
        return window.naryanImageCache.get(httpUrl);
    }

    const p = (async () => {
        try {
            const res = await fetch(httpUrl, { cache: 'force-cache' });
            if (!res.ok) return null;
            const blob = await res.blob();
            return URL.createObjectURL(blob);
        } catch (e) {
            console.warn('[naryanImage] fetch hiba:', httpUrl, e);
            return null;
        }
    })();
    window.naryanImageCache.set(httpUrl, p);
    return p;
};

// Egy <img> elem src-jét tölti fel biztonságos blob URL-lel.
// Ha imgElement-ben már van data-src, azt veszi alapnak.
// onError-kor lehet egy fallback URL (pl. local placeholder).
window.naryanLoadImg = async function (imgElement, httpUrl, fallback) {
    if (!imgElement) return;
    const url = httpUrl || imgElement.dataset.src;
    if (!url) {
        if (fallback) imgElement.src = fallback;
        return;
    }
    const blobUrl = await window.naryanGetBlobUrl(url);
    if (blobUrl) {
        imgElement.src = blobUrl;
    } else if (fallback) {
        imgElement.src = fallback;
    }
};

// Egy elem background-image stílusát állítja blob URL-re.
// Beállítja a background-size: cover; pozíciót is.
window.naryanLoadBg = async function (element, httpUrl) {
    if (!element || !httpUrl) return;
    const blobUrl = await window.naryanGetBlobUrl(httpUrl);
    if (!blobUrl) return;
    element.style.backgroundImage = `url('${blobUrl}')`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
};

// MutationObserver: minden DOM-ba érkező <img data-src="http://...">-t feltölt
// blob URL-lel. Plusz minden [data-bg-src] elem background-jét is.
(function () {
    function processNode(node) {
        if (!(node instanceof Element)) return;

        if (node.matches && node.matches('img[data-src]')) {
            const src = node.dataset.src;
            node.removeAttribute('data-src');
            window.naryanLoadImg(node, src);
        }
        if (node.matches && node.matches('[data-bg-src]')) {
            const src = node.dataset.bgSrc;
            node.removeAttribute('data-bg-src');
            window.naryanLoadBg(node, src);
        }

        // Gyermekek
        if (node.querySelectorAll) {
            node.querySelectorAll('img[data-src]').forEach(el => {
                const src = el.dataset.src;
                el.removeAttribute('data-src');
                window.naryanLoadImg(el, src);
            });
            node.querySelectorAll('[data-bg-src]').forEach(el => {
                const src = el.dataset.bgSrc;
                el.removeAttribute('data-bg-src');
                window.naryanLoadBg(el, src);
            });
        }
    }

    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            m.addedNodes.forEach(processNode);
        }
    });

    // Indítás amint a DOM kész
    function start() {
        observer.observe(document.body, { childList: true, subtree: true });
        // Inicializáláskor is végigfutunk a meglévő elemeken
        processNode(document.body);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

// Avatar default initial fallback (CSS-szel rendereljük a default-avatar class-szal)
window.naryanInitialAvatar = function (name) {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
};
