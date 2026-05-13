// ==========================================
// GLOBÁLIS ÁLLAPOTOK ÉS VÁLTOZÓK
// ==========================================
let savedServers = [];
let currentServerUrl = "";
let currentUserId = 0;
let currentUsername = "";
let currentRole = "User";
let currentServerName = "Szerver";
let currentChannelId = 0;
let currentDMTargetId = 0;
let hubConnection = null;
let serverUsersCache = [];
let peerConnection = null;
let activeCallTargetId = 0;
let isVideoCall = false;
let localCamStream = null;
let localScreenStream = null;
let isMicMuted = false;
let isCamOff = true;
let isSharingScreen = false;
let isInPrivateCall = false;
let activeVoiceRoomId = 0;
let myCurrentStatus = 'online';
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let unreadChannels = new Set();
let unreadDMs = new Set();

let allowDesktopNotifs = localStorage.getItem('notif_os') !== 'false';
let allowToastNotifs = localStorage.getItem('notif_app') !== 'false';
let serverMaxFps = 2;
let myStreamFps = parseInt(localStorage.getItem('my_stream_fps')) || 2;
let myDesktopHwid = "";
let currentRingtone = null;


// --- KÜLSŐ WIDGET (DEEP LINK) FOGADÁSA ---
// A WPF alkalmazásodnak figyelnie kell a naryan:// URI sémát! 
// Ha meghívják, ezt a JS függvényt kell lefuttatnia a háttérből.
window.handleNaryanInviteLink = function (host, code) {
    document.getElementById('JoinInviteCode').value = `${host}/${code}`;
    openJoinModal();
};

// ==========================================
// RENDSZER INDÍTÁS ÉS BEÁLLÍTÁSOK
// ==========================================

let activeTestAudio = null;
let activeTestTimeout = null;

window.initDesktopData = function (serversData, hwidData, clientVersion) {
    savedServers = serversData || [];
    myDesktopHwid = hwidData;
    if (typeof window.setClientVersion === 'function') {
        window.setClientVersion(clientVersion || "0.0.0");
    }
    renderSavedServers();
    showHubScreen();
};

// --- GLOBÁLIS KATTINTÁS ÉS ENTER HANG ---
document.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        playSound('click');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        playSound('click');
    }
});

function playTestSound(type) {
    // 1. Ha BÁRMILYEN teszt hang épp szól, állítsuk le!
    if (activeTestAudio) {
        activeTestAudio.pause();
        activeTestAudio.currentTime = 0;
        activeTestAudio = null;
        if (activeTestTimeout) clearTimeout(activeTestTimeout);
        stopRingtone(); // Biztosíték a call loopra
        return; // Ha már szólt, leállítottuk, és kilépünk (így a gomb egy Play/Stop kapcsoló lesz)
    }

    // 2. Új hang indítása és eltárolása a memóriában
    activeTestAudio = playSound(type);

    // 3. Biztonsági automata leállítás 3 másodperc után (minden hangtípusra)
    activeTestTimeout = setTimeout(() => {
        if (activeTestAudio) {
            activeTestAudio.pause();
            activeTestAudio.currentTime = 0;
            activeTestAudio = null;
        }
        stopRingtone(); // Biztosíték a call loopra
    }, 3000);
}

function getOrCreateHWID() { return myDesktopHwid; }

let saveTimeout = null;
function saveServersToFile() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage("SAVE_SERVERS:" + JSON.stringify(savedServers));
        }
    }, 300); // 300ms fék a C# fájl fagyás ellen!
}

function getReadReceipts() {
    let parsed = null;
    // A szerver URL-jéből csinálunk egy tiszta nevet, így minden szervernek KÜLÖN memóriája lesz!
    let safeUrl = currentServerUrl.replace(/[^a-zA-Z0-9]/g, '');
    let key = 'naryan_read_' + safeUrl + '_' + currentUserId;
    
    try { parsed = JSON.parse(localStorage.getItem(key)); } catch(e) {}
    if (!parsed) parsed = {};
    if (!parsed.channels) parsed.channels = {};
    if (!parsed.dms) parsed.dms = {};
    return parsed;
}

function saveReadReceipt(type, id, msgId) {
    let rr = getReadReceipts();
    let safeUrl = currentServerUrl.replace(/[^a-zA-Z0-9]/g, '');
    let key = 'naryan_read_' + safeUrl + '_' + currentUserId;
    
    if (!rr[type]) rr[type] = {};
    if (!rr[type][id] || msgId > rr[type][id]) {
        rr[type][id] = msgId;
        localStorage.setItem(key, JSON.stringify(rr));
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
});

let volumes = {
    msg: localStorage.getItem('vol_msg') || 0.5, join: localStorage.getItem('vol_join') || 0.5, call: localStorage.getItem('vol_call') || 0.5, click: localStorage.getItem('vol_click') || 0.2
};

function playSound(type) {
    let file = "";
    switch (type) {
        case 'msg': file = "notif.mp3"; break;
        case 'join': file = "ring.mp3"; break;
        case 'call': file = "call.mp3"; break;
        case 'click': file = "click.mp3"; break;
    }

    if (!file) return null;
    const audio = new Audio(file);
    audio.volume = volumes[type] || 0.5;

    if (type === 'call') {
        audio.loop = true;
        currentRingtone = audio;
    }

    audio.play().catch(e => console.warn("Hang hiba:", e));

    return audio; // ÚJ: Visszaadjuk az objektumot, hogy le lehessen állítani!
}

function stopRingtone() {
    if (currentRingtone) {
        currentRingtone.pause();
        currentRingtone.currentTime = 0;
        currentRingtone = null;
    }
}

function updateVolume(type, val) {
    volumes[type] = val;
    localStorage.setItem('vol_' + type, val);

    // Ha épp szól a teszthang, menet közben is frissítjük a hangerejét!
    if (activeTestAudio) {
        activeTestAudio.volume = val;
    }
    if (currentRingtone) {
        currentRingtone.volume = val;
    }

    // A csúszka húzgálása mostantól nem indít rá 50 új hangot!
    // Arra ott van mellette a kis lejátszás gomb.
}
function updateNotifSetting(type, isChecked) {
    localStorage.setItem('notif_' + type, isChecked);
    if (type === 'os') allowDesktopNotifs = isChecked;
    if (type === 'app') allowToastNotifs = isChecked;
}


// ==========================================
// GLOBÁLIS UI FRISSÍTŐ FÜGGVÉNYEK
// ==========================================
window.refreshMyProfileUI = function () {
    let me = typeof serverUsersCache !== 'undefined' ? serverUsersCache.find(u => u.id === currentUserId) : null;
    if (!me) return;

    let myAvatarEl = document.getElementById('MyAvatar');
    if (!myAvatarEl) return;

    let myStatus = me.status || 'online';
    let initial = me.username ? me.username.charAt(0).toUpperCase() : '?';

    // Default-avatar: a kezdőbetű mindig ott van mint fallback, ha a kép nem töltődik be
    myAvatarEl.innerHTML = `${initial}<div class="status-dot status-${myStatus} user-status-${currentUserId}"></div>`;
    myAvatarEl.style.color = "var(--accent)";

    if (me.avatar) {
        let fullUrl = currentServerUrl + me.avatar;
        // Cache invalidate ha új avatar (timestamp-szerű ellenőrzés helyett a most feltöltött URL friss)
        window.naryanLoadBg(myAvatarEl, fullUrl).then(() => {
            // Ha sikeresen betöltött, a kezdőbetűt elrejtjük (de a status pötty marad)
            myAvatarEl.style.color = "transparent";
        });
    } else {
        myAvatarEl.style.backgroundImage = "none";
    }
};