// ==========================================
// AUTO-UPDATER (GitHub Releases alapú)
// ==========================================
// Kommunikál a C# host-tal a WebView2 webMessage-en keresztül:
//   küld: "UPDATE_CHECK"           — manuális frissítés keresés
//   küld: "UPDATE_APPLY:<url>"     — letöltés + telepítés indítása
//   kap : window.handleUpdateInfo(info)      — eredmény az ellenőrzésről
//   kap : window.handleUpdateStarted()       — telepítés indult
//   kap : window.handleUpdateProgress(p)     — letöltési %
//   kap : window.handleUpdateError(msg)      — hibajelzés

let updaterCurrentVersion = "0.0.0";
let updaterLatestInfo = null;
let updaterInstalling = false;

window.setClientVersion = function (v) {
    updaterCurrentVersion = v || "0.0.0";
    let el = document.getElementById('UpdaterCurrentVersion');
    if (el) el.innerText = "v" + updaterCurrentVersion;
};

// --- Modal megjelenítése / elrejtése ---
function openUpdateModal() {
    let m = document.getElementById('UpdateModal');
    if (m) m.style.display = 'flex';
}

window.closeUpdateModal = function () {
    if (updaterInstalling) return; // ne lehessen bezárni telepítés közben
    let m = document.getElementById('UpdateModal');
    if (m) m.style.display = 'none';
};

// --- Manuális ellenőrzés (Settings gomb) ---
window.checkForUpdates = function () {
    if (!window.chrome || !window.chrome.webview) {
        if (typeof showToast === 'function') showToast("Frissítés-ellenőrzés csak a desktop kliensben elérhető.", true);
        return;
    }
    setUpdaterStatus('checking', 'Frissítés keresése...');
    window.chrome.webview.postMessage("UPDATE_CHECK");
};

// --- Visszahívások a C#-ból ---
window.handleUpdateInfo = function (info) {
    updaterLatestInfo = info;

    if (info.error) {
        // Csak akkor jelenítjük meg ha manuálisan kérte, különben csendben hagyjuk
        if (info.manual) {
            openUpdateModal();
            setUpdaterStatus('error', info.error);
        }
        return;
    }

    if (!info.hasUpdate) {
        if (info.manual) {
            openUpdateModal();
            setUpdaterStatus('uptodate',
                "Friss vagy! Nincs új verzió.<br><span class='update-sub'>Jelenlegi: v" + info.currentVersion + "</span>");
        }
        return;
    }

    // Új verzió elérhető — modal megnyitása
    openUpdateModal();
    setUpdaterStatus('available', '');
    fillUpdaterDetails(info);
};

window.handleUpdateStarted = function () {
    updaterInstalling = true;
    setUpdaterStatus('installing', 'Letöltés... <span id="UpdateProgressText">0%</span>');
    let bar = document.getElementById('UpdateProgressBar');
    if (bar) bar.style.width = '0%';
    let panel = document.getElementById('UpdateProgressPanel');
    if (panel) panel.style.display = 'block';
    // Letiltjuk a gombokat
    document.querySelectorAll('#UpdateModal .update-action-btn').forEach(b => b.disabled = true);
    let closeBtn = document.getElementById('UpdateCloseBtn');
    if (closeBtn) closeBtn.style.display = 'none';
};

window.handleUpdateProgress = function (p) {
    let bar = document.getElementById('UpdateProgressBar');
    let txt = document.getElementById('UpdateProgressText');
    if (bar) bar.style.width = Math.min(100, Math.max(0, p)) + '%';
    if (txt) txt.innerText = Math.round(p) + '%';
    if (p >= 100) {
        setUpdaterStatus('installing',
            'Telepítés... <br><span class="update-sub">Az app mindjárt újraindul.</span>');
    }
};

window.handleUpdateError = function (msg) {
    updaterInstalling = false;
    setUpdaterStatus('error', msg || "Ismeretlen telepítési hiba.");
    document.querySelectorAll('#UpdateModal .update-action-btn').forEach(b => b.disabled = false);
    let closeBtn = document.getElementById('UpdateCloseBtn');
    if (closeBtn) closeBtn.style.display = '';
};

// --- Telepítés indítása ---
window.startUpdateInstall = function () {
    if (!updaterLatestInfo || !updaterLatestInfo.downloadUrl) return;
    if (!window.chrome || !window.chrome.webview) return;
    window.chrome.webview.postMessage("UPDATE_APPLY:" + updaterLatestInfo.downloadUrl);
};

// --- UI helpers ---
function setUpdaterStatus(state, htmlMsg) {
    let icon = document.getElementById('UpdaterStatusIcon');
    let title = document.getElementById('UpdaterStatusTitle');
    let msg = document.getElementById('UpdaterStatusMessage');
    let actions = document.getElementById('UpdaterActions');
    let progress = document.getElementById('UpdateProgressPanel');
    let details = document.getElementById('UpdaterDetails');

    if (!icon || !title || !msg) return;

    if (progress) progress.style.display = 'none';
    if (actions) actions.style.display = 'none';
    if (details) details.style.display = 'none';

    let titleText = '';
    let iconSvg = '';

    switch (state) {
        case 'checking':
            iconSvg = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3"/></svg>`;
            titleText = 'Frissítés keresése';
            icon.className = 'updater-icon updater-icon-info';
            break;
        case 'available':
            iconSvg = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>`;
            titleText = 'Új frissítés érhető el!';
            icon.className = 'updater-icon updater-icon-accent';
            if (actions) actions.style.display = 'flex';
            if (details) details.style.display = 'block';
            break;
        case 'uptodate':
            iconSvg = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
            titleText = 'Naprakész vagy';
            icon.className = 'updater-icon updater-icon-success';
            break;
        case 'installing':
            iconSvg = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"/></svg>`;
            titleText = 'Frissítés telepítése';
            icon.className = 'updater-icon updater-icon-accent';
            if (progress) progress.style.display = 'block';
            break;
        case 'error':
            iconSvg = `<svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 005 19z"/></svg>`;
            titleText = 'Hiba';
            icon.className = 'updater-icon updater-icon-danger';
            break;
    }

    icon.innerHTML = iconSvg;
    title.innerText = titleText;
    msg.innerHTML = htmlMsg || '';
}

function fillUpdaterDetails(info) {
    let v = document.getElementById('UpdaterVersionPair');
    let notes = document.getElementById('UpdaterReleaseNotes');
    let name = document.getElementById('UpdaterReleaseName');

    if (v) {
        v.innerHTML = `<span class="update-old">v${info.currentVersion}</span>
                       <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7-7 7M3 12h18"/></svg>
                       <span class="update-new">v${info.latestVersion}</span>`;
    }
    if (name) name.innerText = info.releaseName || ("Naryan v" + info.latestVersion);
    if (notes) {
        // Egyszerű, minimalista markdown — sortörés + ###/##/# headerek
        let html = (info.releaseNotes || "Nincs leírás.")
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^###\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/^##\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^#\s+(.+)$/gm, '<h3>$1</h3>')
            .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\n\n+/g, '</p><p>')
            .replace(/\n/g, '<br>');
        // listaelemek be ul-be — egyszerű módon (egymás utáni li)
        html = html.replace(/(<li>.*?<\/li>(\s*<br>\s*<li>.*?<\/li>)*)/gs, function (m) {
            return '<ul>' + m.replace(/<br>/g, '') + '</ul>';
        });
        notes.innerHTML = '<p>' + html + '</p>';
    }
}
