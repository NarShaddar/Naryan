// ==========================================
// ABLAKOK ÉS GOMBOK (MODALS)
// ==========================================

// --- KÖZPONTI NÉZETVÁLTÓ MOTOR ---
function switchAppView(activeViewId) {
    // Itt van felsorolva az összes létező belső nézet ID-ja
    const allViews = ['MembersView', 'ChatRoomView', 'VoiceRoomUI', 'CallOverlay', 'SettingsView',"ServerInfoView"];

    // Végigmegyünk mindegyiken, és mindent elrejtünk
    allViews.forEach(id => {
        let el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Ha megadtunk egy célt, azt megjelenítjük (flex-el, mert mindegyik azt használja)
    if (activeViewId) {
        let activeEl = document.getElementById(activeViewId);
        if (activeEl) activeEl.style.display = 'flex';
    }
}

// --- EGYEDI MEGERŐSÍTŐ ABLAK MOTOR ---
let confirmAction = null;
function showConfirm(title, text, onConfirm) {
    document.getElementById('ConfirmTitle').innerText = title;
    document.getElementById('ConfirmText').innerText = text;
    confirmAction = onConfirm;
    document.getElementById('ConfirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('ConfirmModal').style.display = 'none';
    confirmAction = null;
}

document.getElementById('ConfirmAcceptBtn').addEventListener('click', () => {
    if (confirmAction) confirmAction();
    closeConfirmModal();
});

function showToast(msg, isError = false) {
    const t = document.getElementById("Toast"); t.innerText = msg;
    t.className = isError ? "error show" : "show";

    setTimeout(() => {
        t.className = t.className.replace("show", "");
    }, 2500);
}

function openJoinModal() {
    hideJoinError();
    document.getElementById('JoinServerModal').style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    if (id === 'JoinServerModal') hideJoinError();
}

function showJoinError(msg) {
    let el = document.getElementById('JoinError');
    if (!el) return showToast(msg, true);
    el.innerText = msg;
    el.classList.add('show');
}

function hideJoinError() {
    let el = document.getElementById('JoinError');
    if (el) { el.classList.remove('show'); el.innerText = ''; }
}

// Olvassa ki a hibaüzenetet a response-ből, status-alapú fallback-kel
async function readErrorMessage(res) {
    let txt = "";
    try { txt = (await res.text()) || ""; } catch (e) {}
    txt = txt.trim();
    if (txt) return txt;
    // Fallback HTTP status alapján
    if (res.status === 400) return "Érvénytelen meghívókód vagy formátum!";
    if (res.status === 401) return "Hibás jelszó vagy hitelesítés!";
    if (res.status === 403) return "Ki vagy tiltva erről a szerverről!";
    if (res.status === 404) return "A szerver nem ezt a végpontot kínálja (régi verzió?).";
    if (res.status === 413) return "Túl nagy adat / megtelt a tárhely!";
    if (res.status >= 500) return "Szerver oldali hiba (HTTP " + res.status + ").";
    return "Sikertelen kérés (HTTP " + res.status + ").";
}

function showHubScreen() {
    // 1. Minden belső panelt letakarít (Chat, Beállítások, Tagok)
    switchAppView('');

    // 2. Eltünteti a szerver felületet és a bal oldali sávot
    document.getElementById('ServerBar').style.display = 'none';
    document.getElementById('ServerContent').style.display = 'none';

    // 3. VISSZAHOZZA A HUB-OT!
    document.getElementById('HubScreen').style.display = 'flex';

    // --- ÚJ JAVÍTÁS: Ha visszalépsz a Hubra, a menü is garantáltan eltűnik! ---
    document.getElementById('NotifMenu').style.display = 'none';

    // 4. Kapcsolat bontása és kijelölések törlése
    if (hubConnection) {
        hubConnection.stop();
        hubConnection = null;
    }
    document.querySelectorAll('#SavedServersList .server-icon').forEach(i => i.classList.remove('active'));
}

window.openServerInfo = async function() {
    // Átváltunk a Server Info nézetre
    switchAppView('ServerInfoView');

    // Alap adatok betöltése
    document.getElementById('InfoServerName').innerText = currentServerName;
    document.getElementById('InfoMemberCount').innerText = serverUsersCache.length + " fő";
    document.getElementById('InfoMaxFps').innerText = serverMaxFps + " FPS";

    // Szerver tárhely lekérése
    try {
        let res = await fetch(`${currentServerUrl}/api/server/info`);
        if (res.ok) {
            let d = await res.json();
            let perc = (d.usedMB / d.maxMB) * 100;
            document.getElementById('InfoStorageText').innerText = `${d.usedMB} MB / ${d.maxMB} MB`;
            document.getElementById('InfoStorageBar').style.width = Math.min(perc, 100) + '%';
            document.getElementById('InfoStorageBar').style.backgroundColor = perc > 90 ? 'var(--danger)' : 'var(--success)';
        } else {
            document.getElementById('InfoStorageText').innerText = "Adat nem elérhető.";
        }
    } catch (e) {
        document.getElementById('InfoStorageText').innerText = "Hiba a lekéréskor.";
    }
}

function openSettingsView() {
    document.getElementById('vol_msg').value = volumes.msg;
    document.getElementById('vol_join').value = volumes.join;
    document.getElementById('vol_call').value = volumes.call;
    document.getElementById('vol_click').value = volumes.click;
    document.getElementById('set_notif_os').checked = allowDesktopNotifs;
    document.getElementById('set_notif_app').checked = allowToastNotifs;
    const preview = document.getElementById('SettingsAvatarPreview');
    preview.innerHTML = document.getElementById('MyAvatar').innerHTML;

    if (document.getElementById('MyAvatar').style.backgroundImage) {
        preview.style.backgroundImage = document.getElementById('MyAvatar').style.backgroundImage;
        preview.style.backgroundSize = "cover";
    }

    let fpsSlider = document.getElementById('set_fps');

    if (fpsSlider) {
        fpsSlider.max = serverMaxFps;
        if (myStreamFps > serverMaxFps)
            myStreamFps = serverMaxFps;

        fpsSlider.value = myStreamFps;
        document.getElementById('fps_display').innerText = myStreamFps;
    }

    switchAppView('SettingsView');

    // Kijelölés levétele a bal sávból
    document.querySelectorAll('#ChannelsList .list-item').forEach(el => el.classList.remove('active'));

    // Fejléc átírása
    document.getElementById('HeaderChannelName').innerText = "Beállítások";
    document.getElementById('HeaderIcon').innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>`;
    document.getElementById('CallButtons').style.display = 'none';

    // Megjelenítjük a beállítások ablakot
    document.getElementById('SettingsView').style.display = 'flex';
}

function updateFpsSetting(val) {
    myStreamFps = parseInt(val);

    if (myStreamFps > serverMaxFps)
        myStreamFps = serverMaxFps;

    localStorage.setItem('my_stream_fps', myStreamFps);
    document.getElementById('fps_display').innerText = myStreamFps;
}

function openReportModal(targetId) {
    if (targetId === currentUserId) return showToast("Magadat nem jelentheted!", true);
    document.getElementById("ReportTargetId").value = targetId;
    document.getElementById("ReportReason").value = "";
    document.getElementById("ReportModal").style.display = "flex";
}

function openAdminModal() {
    document.getElementById('AdminModal').style.display = 'flex';
    switchAdminTab('AdminRooms');
}

function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';

    if (event && event.target) {
        event.target.classList.add('active');
    }
    if (tabId === 'AdminRooms') adminLoadRooms();
}

// ==========================================
// SZERVER CSATLAKOZÁS ÉS KÁRTYÁK
// ==========================================
function renderSavedServers() {
    const list = document.getElementById('SavedServersList');
    const hubGrid = document.getElementById('HubServersGrid');
    const hubStat = document.getElementById('HubStatServers');
    if (list) list.innerHTML = "";
    if (hubGrid) hubGrid.innerHTML = "";
    if (hubStat) hubStat.innerText = (savedServers || []).length;

    savedServers.forEach((s, i) => {
        let avatarSrc = "logo.png";

        // Golyóálló URL összeillesztés a dupla perjelek (//) elkerülésére
        if (s.serverAvatar && s.serverAvatar !== "logo.png" && s.serverAvatar !== "") {
            let baseUrl = s.url.endsWith('/') ? s.url.slice(0, -1) : s.url;
            let avatarPath = s.serverAvatar.startsWith('/') ? s.serverAvatar : `/${s.serverAvatar}`;
            avatarSrc = s.serverAvatar.startsWith('http') ? s.serverAvatar : `${baseUrl}${avatarPath}`;
        }

        // 1. Bal oldali pici ikon (data-src → blob URL automatikusan)
        let icon = document.createElement('div'); icon.className = 'server-icon';
        if (avatarSrc !== "logo.png") {
            icon.innerHTML = `<img data-src="${avatarSrc}" style="width:100%; height:100%; border-radius:inherit; object-fit:cover;" alt="">`;
        } else {
            icon.innerText = `${(s.serverName || s.url).charAt(0).toUpperCase()}`;
        }
        icon.onmouseenter = (e) => showServerTooltip(e, s.serverName || "Szerver", s.url.replace(/^https?:\/\//i, ''), s.username);
        icon.onmouseleave = hideServerTooltip;
        icon.onclick = () => { hideServerTooltip(); connectToServer(i); };
        if (list) list.appendChild(icon);

        // 2. Hub képernyő nagy kártyája
        if (hubGrid) {
            let card = document.createElement('div'); card.className = 'hub-server-card';
            let logoHtml = (avatarSrc !== "logo.png")
                ? `<img data-src="${avatarSrc}" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;" alt="">`
                : `${(s.serverName || s.url).charAt(0).toUpperCase()}`;

            card.innerHTML = `
                <div class="hub-server-delete" title="Szerver törlése" onclick="event.stopPropagation(); deleteSavedServer(${i})">✖</div>
                <div class="hub-server-logo">${logoHtml}</div>
                <div class="hub-server-info">
                    <div class="hub-server-name">${s.serverName || "Ismeretlen Szerver"}</div>
                    <div class="hub-server-ip">${s.url.replace(/^https?:\/\//i, '')}</div>
                    <div style="color:var(--success); font-size:11px; margin-top:5px; font-weight:bold; text-transform:uppercase; display:flex; align-items:center; justify-content:center; gap:5px;">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> ${s.username}
                    </div>
                </div>
            `;
            card.onclick = () => connectToServer(i);
            hubGrid.appendChild(card);
        }
    });
}

function deleteSavedServer(index) {
    showConfirm("Szerver törlése", "Biztosan eltávolítod a szervert a mentett listádból?", () => {
        savedServers.splice(index, 1);
        saveServersToFile();
        renderSavedServers();
    });
}

function showServerTooltip(event, sName, sUrl, sUser) {
    let tt = document.getElementById('GlobalTooltip');
    tt.innerHTML = `<div class="tt-name">${sName}</div><div class="tt-ip">${sUrl}</div><div class="tt-user">${sUser}</div>`;
    tt.style.display = 'block';
    let rect = event.target.getBoundingClientRect();
    tt.style.left = (rect.right + 15) + 'px';
    tt.style.top = (rect.top + (rect.height / 2)) + 'px';
}
function hideServerTooltip() {
    document.getElementById('GlobalTooltip').style.display = 'none';
}

async function joinNewServer() {
    hideJoinError();

    let inviteFull = document.getElementById('JoinInviteCode').value.trim();
    const username = document.getElementById('JoinUsername').value.trim();
    const password = document.getElementById('JoinPassword').value;

    if (!inviteFull || !username || !password) {
        showJoinError("Minden mezőt ki kell tölteni!");
        return;
    }

    inviteFull = inviteFull.replace(/^https?:\/\//i, '');
    let slashIndex = inviteFull.indexOf('/');

    if (slashIndex === -1) {
        showJoinError("Hibás formátum. Helyes példa: 127.0.0.1:9090/ABCD1234");
        return;
    }

    let hostPart = inviteFull.substring(0, slashIndex);
    let inviteCode = inviteFull.substring(slashIndex + 1).trim();

    if (!hostPart || !inviteCode) {
        showJoinError("Hibás formátum. Helyes példa: 127.0.0.1:9090/ABCD1234");
        return;
    }

    let serverUrl = "http://" + hostPart;

    try {
        let res = await fetch(`${serverUrl}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteCode, username, password, hwid: getOrCreateHWID() })
        });

        if (res.ok) {
            let uData = await res.json();
            let existingIndex = savedServers.findIndex(s => s.url === serverUrl && s.username === username);

            let sData = { url: serverUrl, username, password, userId: uData.userId, role: uData.role, serverName: uData.serverName, serverAvatar: uData.serverAvatar };

            if (existingIndex >= 0)
                savedServers[existingIndex] = sData;
            else
                savedServers.push(sData);

            saveServersToFile();
            showToast("Csatlakozva!", false);
            closeModal('JoinServerModal');
            renderSavedServers();
            connectToServer(savedServers.length - 1);
        } else {
            let msg = await readErrorMessage(res);
            showJoinError(msg);
        }
    } catch (e) {
        showJoinError("A szerver nem elérhető. Ellenőrizd, hogy fut-e a megadott IP-n és porton.");
    }
}

async function connectToServer(index) {
    const server = savedServers[index]; currentServerUrl = server.url;
    try {
        let res = await fetch(`${currentServerUrl}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inviteCode: "",
                username: server.username,
                password: server.password,
                hwid: getOrCreateHWID()
            })
        });

        if (!res.ok) {
            showToast(await readErrorMessage(res), true);
            return;
        }

        let uData = await res.json();
        currentUserId = uData.userId;
        currentUsername = uData.username;
        currentRole = uData.role;
        serverMaxFps = uData.maxScreenFps || 2;
        currentServerName = uData.serverName;

        savedServers[index].serverName = uData.serverName;
        savedServers[index].serverAvatar = uData.serverAvatar;
        saveServersToFile(); renderSavedServers();
        document.getElementById('CurrentServerName').innerText = currentServerName;
    } catch (e) {
        showToast("Szerver offline!", true);
        return;
    }

    document.getElementById('HubScreen').style.display = 'none';
    document.getElementById('ServerBar').style.display = 'flex'; 
    document.getElementById('ServerContent').style.display = 'flex';
    document.getElementById('MyUsername').innerText = server.username;
    document.getElementById('MyRole').innerText = currentRole;
    document.getElementById('BtnAdminMenu').style.display = (currentRole === "Admin" || currentRole === "Owner") ? 'flex' : 'none';

    document.querySelectorAll('#SavedServersList .server-icon').forEach(i => i.classList.remove('active'));
    let icons = document.querySelectorAll('#SavedServersList .server-icon');

    if (icons[index])
        icons[index].classList.add('active');

    // Értesítések teljes nullázása belépéskor
    unreadChannels.clear(); 
    unreadDMs.clear(); 
    unreadCounts = { channels: {}, dms: {} }; 
    await updateUsersCache();

    // --- AZ EREDETI ÉRTESÍTÉS BETÖLTŐ PONTOS SZÁMOLÁSSAL ---
    try {
        let unreadRes = await fetch(`${currentServerUrl}/api/unread/${currentUserId}?t=${Date.now()}`, { cache: 'no-store' });
        if (unreadRes.ok) {
            let unreadData = await unreadRes.json();
            let rr = getReadReceipts();

            // Szobák pontos számolása
            if (unreadData.channels) {
                for (let c of unreadData.channels) {
                    let savedId = rr.channels[c.id] || 0;
                    if (savedId < c.lastId) {
                        // Lekérjük a szoba üzeneteit a pontos számoláshoz
                        let msgRes = await fetch(`${currentServerUrl}/api/messages/${c.id}?t=${Date.now()}`, { cache: 'no-store' });
                        if (msgRes.ok) {
                            let msgs = await msgRes.json();
                            // Szűrjük a nálunk frissebb, MÁSOK által küldött üzeneteket
                            let missed = msgs.filter(m => m.id > savedId && m.senderId !== currentUserId);
                            if (missed.length > 0) {
                                unreadChannels.add(c.id);
                                unreadCounts.channels[c.id] = { name: "Szoba", count: missed.length, latestMsgId: c.lastId };
                            }
                        }
                    }
                }
            }

            // Privát üzenetek (DM) pontos számolása
            if (unreadData.dms) {
                for (let d of unreadData.dms) {
                    let savedId = rr.dms[d.id] || 0;
                    if (savedId < d.lastId) {
                        // Lekérjük a DM üzeneteket a pontos számoláshoz
                        let dmRes = await fetch(`${currentServerUrl}/api/dm/${currentUserId}/${d.id}?t=${Date.now()}`, { cache: 'no-store' });
                        if (dmRes.ok) {
                            let msgs = await dmRes.json();
                            // Szűrjük a nálunk frissebb, MÁSOK által küldött üzeneteket
                            let missed = msgs.filter(m => m.id > savedId && m.senderId !== currentUserId);
                            if (missed.length > 0) {
                                unreadDMs.add(d.id);
                                unreadCounts.dms[d.id] = { name: "Partner", count: missed.length, latestMsgId: d.lastId };
                            }
                        }
                    }
                }
            }
        }
    } catch (e) { console.warn("Unread betöltési hiba:", e); }

    refreshMyProfileUI();
    await loadChannels();
    initSignalR();
    openMembersView();

    // Nevek frissítése a harang menühöz
    unreadDMs.forEach(id => {
        let u = serverUsersCache.find(x => x.id === id);
        if (u && unreadCounts.dms[id]) unreadCounts.dms[id].name = u.username;
    });
    unreadChannels.forEach(id => {
        let chEl = document.getElementById(`ch-${id}`);
        let chName = chEl ? chEl.innerText.replace('#', '').replace('🔊', '').trim() : "Szoba";
        if (unreadCounts.channels[id]) unreadCounts.channels[id].name = chName;
    });

    updateBellIcon();
}

function disconnectFromServer() {
    if (hubConnection) {
        hubConnection.stop(); hubConnection = null;
    }

    currentUserId = 0; currentUsername = "";
    currentChannelId = 0;
    currentDMTargetId = 0;
    unreadChannels.clear();
    unreadDMs.clear();
    
    // --- ÚJ JAVÍTÁS: Kijelentkezéskor teljesen lenullázzuk a harang memóriáját és bezárjuk a menüt! ---
    unreadCounts = { channels: {}, dms: {} };
    updateBellIcon();
    document.getElementById('NotifMenu').style.display = 'none';
    // -------------------------------------------------------------------------------------------------

    document.getElementById('ChatMessages').innerHTML = "";
    document.getElementById('ChannelsList').innerHTML = "";
    document.getElementById('MembersListContainer').innerHTML = "";
    showHubScreen();
    showToast("Lecsatlakozva.");
}

async function updateUsersCache() {
    let res = await fetch(`${currentServerUrl}/api/users`);

    if (res.ok)
        serverUsersCache = await res.json();
}

// ==========================================
// SZOBÁK ÉS NAVIGÁCIÓ
// ==========================================
const ICON_VOICE = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>`;
const ICON_TEXT = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"></path></svg>`;

function handleCallNavigation() {
    if (isInPrivateCall) {
        document.getElementById('CallOverlay').style.display = 'none';
        document.getElementById('ActiveCallBanner').style.display = 'flex';
    } else {
        document.getElementById('ActiveCallBanner').style.display = 'none';
    }
}

window.returnToCall = function () {
    switchAppView('CallOverlay');
    document.getElementById('ActiveCallBanner').style.display = 'none';

    setTimeout(() => {
        document.querySelectorAll('#CallOverlay video').forEach(v => {
            if (v.paused) v.play().catch(e => console.warn("Video auto-play hiba:", e));
        });
    }, 100);
};

async function loadChannels() {
    let res = await fetch(`${currentServerUrl}/api/channels`);
    if (res.ok) {
        let channels = await res.json(); let html = '';
        channels.forEach(ch => {
            let isUnreadClass = unreadChannels.has(ch.id) ? 'unread' : ''; let dotHtml = unreadChannels.has(ch.id) ? `<div class="unread-dot"></div>` : '';
            let limitText = ch.type === 'voice' && ch.maxUsers > 0 ? ` <span id="limit-${ch.id}" style="font-size:10px; color:var(--text-muted); margin-left:5px;">(0/${ch.maxUsers})</span>` : '';
            let iconStr = ch.type === 'voice' ? ICON_VOICE : ICON_TEXT;

            html += `<div class="list-item ${isUnreadClass}" id="ch-${ch.id}" onclick="openChannel(${ch.id}, '${ch.name}', '${ch.type}')">${dotHtml}<span class="icon">${iconStr}</span> <span style="flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.name}</span>${limitText}</div>`;
            if (ch.type === 'voice') html += `<div id="voice-users-${ch.id}" class="voice-users-container"></div>`;
        });
        document.getElementById('ChannelsList').innerHTML = html;

        if (currentChannelId > 0 && currentDMTargetId === 0)
            document.getElementById(`ch-${currentChannelId}`)?.classList.add('active');
    }
}

async function openMembersView() {
    currentChannelId = 0; currentDMTargetId = 0;
    document.getElementById('ChatRoomView').style.display = 'none';

    if (hubConnection && currentChannelId > 0 && currentDMTargetId === 0) {
        let prevChEl = document.getElementById(`ch-${currentChannelId}`);
        if (prevChEl && prevChEl.querySelector('span.icon').innerHTML.includes('19 11a7')) {
            leaveVoiceRoom();
        }
    }
    currentChannelId = 0; currentDMTargetId = 0;

    switchAppView('MembersView');
    document.getElementById('HeaderChannelName').innerText = "Szerver Tagok";
    document.getElementById('HeaderIcon').innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`;
    document.getElementById('CallButtons').style.display = 'none';
    document.querySelectorAll('#ChannelsList .list-item').forEach(el => el.classList.remove('active'));

    handleCallNavigation();

    await updateUsersCache();
    let html = '';

    serverUsersCache.forEach(u => {
        if (u.id !== currentUserId) {
            let avatarBgAttr = u.avatar ? `data-bg-src="${currentServerUrl}${u.avatar}"` : "";
            let avatarTextColor = u.avatar ? "color: transparent;" : "";
            
            // Ha valaki fizikailag nincs gépnél, VAGY láthatatlanra rakta magát, akkor egyaránt OFFLINE-nak hazudjuk a többieknek!
            let effectiveStatus = u.isOnline ? (u.status || 'online') : 'offline';
            if (u.status === 'offline') effectiveStatus = 'offline'; 
            
            // Szöveges kiírás a pötty alapján
            let statusText = "Offline";
            let statusColor = "var(--text-muted)";
            
            if (effectiveStatus === 'online') { statusText = "Online"; statusColor = "var(--success)"; }
            else if (effectiveStatus === 'idle') { statusText = "Távollévő"; statusColor = "#f1c40f"; }
            else if (effectiveStatus === 'dnd') { statusText = "Ne zavarjanak"; statusColor = "var(--danger)"; }
            // Ha 'offline', akkor marad az alap "Offline" szöveg, így senki sem tudja meg, hogy csak bujkál!

            let hasUnread = unreadDMs.has(u.id); 
            let unreadDotHtml = hasUnread ? `<div style="width:12px;height:12px;background-color:var(--danger);border-radius:50%;position:absolute;top:-4px;right:-4px;border:2px solid var(--bg-panel);box-shadow:0 0 5px var(--danger); z-index:3;"></div>` : "";
            
            html += `
            <div class="member-card" data-id="${u.id}">
                <div class="member-info">
                    <div style="position:relative;">
                        <div class="avatar-small" ${avatarBgAttr} style="${avatarTextColor}">
                            ${u.username.charAt(0).toUpperCase()}
                            <div class="status-dot status-${effectiveStatus} user-status-${u.id}"></div>
                        </div>
                        ${unreadDotHtml}
                    </div>
                    <div>
                        <div style="color:white; font-weight:bold;">${u.username}</div>
                        <div style="color:${statusColor}; font-size:12px;">${statusText}</div>
                    </div>
                </div>
                <div class="btn-icon" title="Privát üzenet" onclick="openDirectMessage(${u.id}, '${u.username}')">
                    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                </div>
            </div>`;
        }
    });
    document.getElementById('MembersListContainer').innerHTML = html || '<div style="color:var(--text-muted);">Nincs más a szerveren.</div>';
}

async function openChannel(id, name, type) {
    // Ha hangcsatornában vagyunk, és egy MÁSIK HANGCSATORNÁBA lépünk, akkor lépjünk ki a régiből
    if (hubConnection && activeVoiceRoomId > 0 && activeVoiceRoomId !== id && type === 'voice') {
        leaveVoiceRoom(false);
    }

    currentChannelId = id; currentDMTargetId = 0;

if (unreadChannels.has(id)) {
        unreadChannels.delete(id);
        let chEl = document.getElementById(`ch-${id}`);
        if (chEl) {
            chEl.classList.remove('unread');
            let dot = chEl.querySelector('.unread-dot');
            if (dot) dot.remove();
        }
        // ÚJ: Töröljük a harang menüből is!
        if (unreadCounts.channels[id]) {
            delete unreadCounts.channels[id];
            updateBellIcon();
        }
    }
    document.querySelectorAll('#ChannelsList .list-item').forEach(el => el.classList.remove('active'));
    let activeCh = document.getElementById(`ch-${id}`);

    if (activeCh)
        activeCh.classList.add('active');

    document.getElementById('HeaderChannelName').innerText = name;
    document.getElementById('HeaderIcon').innerHTML = type === 'voice' ? ICON_VOICE : ICON_TEXT;
    document.getElementById('CallButtons').style.display = 'none';

    handleCallNavigation();

    // 1. ESET: HANGCSATORNA VÁLASZTÁSA
    if (type === 'voice') {
        switchAppView('VoiceRoomUI'); // Csak a Voice dobozt jelenítjük meg

        // Csak akkor csatlakozunk a hanghoz, ha még nem vagyunk bent ebben a szobában
        if (hubConnection && activeVoiceRoomId !== id) {
            startVoiceRoom();
        }
        return;
    }

    // 2. ESET: SZÖVEGES CHAT VÁLASZTÁSA
    switchAppView('ChatRoomView'); // Csak a Chat dobozt jelenítjük meg
    document.getElementById('TextRoomUI').style.display = 'flex'; // Biztosítjuk, hogy a szöveges UI látszódjon a dobozon belül

    document.getElementById('ChatInput').disabled = false;
    document.getElementById('ChatInput').placeholder = `Üzenet küldése: #${name}`;
    document.getElementById('ChatMessages').innerHTML = "";

    // Üzenetek betöltése
    let res = await fetch(`${currentServerUrl}/api/messages/${id}`);
    if (res.ok) {
        let msgs = await res.json(); let maxId = 0;
        msgs.forEach(m => {
            appendMessage(m.content, m.senderId === currentUserId, m.id, m.time, m.senderName, m.senderId, m.reactions, m.timestamp); if (m.id > maxId) maxId = m.id;
        });
        if (maxId > 0) saveReadReceipt('channels', id, maxId);
    }
}

async function openDirectMessage(targetId, targetName) {
    currentChannelId = 0; currentDMTargetId = targetId;

    if (unreadDMs.has(targetId)) {
        unreadDMs.delete(targetId);
        // ÚJ: Töröljük a harang menüből is!
        if (unreadCounts.dms[targetId]) {
            delete unreadCounts.dms[targetId];
            updateBellIcon();
        }
    }

    document.getElementById('MembersView').style.display = 'none';

    if (hubConnection && currentChannelId > 0 && currentDMTargetId === 0) {
        let prevChEl = document.getElementById(`ch-${currentChannelId}`);

        if (prevChEl && prevChEl.querySelector('span.icon').innerHTML.includes('19 11a7')) {
            leaveVoiceRoom();
        }
    }
    currentChannelId = 0; currentDMTargetId = targetId;

    if (unreadDMs.has(targetId))
        unreadDMs.delete(targetId);

    switchAppView('ChatRoomView');
    document.getElementById('TextRoomUI').style.display = 'flex';
    document.getElementById('VoiceRoomUI').style.display = 'none';
    document.getElementById('HeaderChannelName').innerText = targetName; document.getElementById('HeaderIcon').innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path></svg>`; document.getElementById('CallButtons').style.display = 'flex';
    document.getElementById('ChatInput').disabled = false; document.getElementById('ChatInput').placeholder = `Privát üzenet: @${targetName}`; document.getElementById('ChatMessages').innerHTML = "";

    handleCallNavigation();
    let res = await fetch(`${currentServerUrl}/api/dm/${currentUserId}/${targetId}`);

    if (res.ok) {
        let msgs = await res.json(); let maxId = 0;
        msgs.forEach(m => { appendMessage(m.content, m.senderId === currentUserId, m.id, m.time, m.senderName, m.senderId, m.reactions, m.timestamp); if (m.id > maxId) maxId = m.id; });
        if (maxId > 0) saveReadReceipt('dms', targetId, maxId);
    }
}

// ==========================================
// ADMIN RENDSZER
// ==========================================

async function submitReport() {
    let targetId = parseInt(document.getElementById("ReportTargetId").value); let reason = document.getElementById("ReportReason").value.trim();
    if (!reason)
        return showToast("Írj be egy indokot!", true);
    await fetch(`${currentServerUrl}/api/report`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reporterId: currentUserId,
            reportedUserId: targetId,
            reason: reason
        })
    });
    showToast("Jelentés elküldve!");
    closeModal('ReportModal');
}

async function adminLoadRooms() {
    let res = await fetch(`${currentServerUrl}/api/channels`);
    if (res.ok) {
        let channels = await res.json(); let html = '';
        channels.forEach(ch => { html += `<div class="list-item"><span style="color:white; font-weight:bold;">${ch.type === 'voice' ? ICON_VOICE : ICON_TEXT} ${ch.name} <span style="color:var(--text-muted);font-size:10px;margin-left:5px;">(ID:${ch.id})</span></span><button class="btn-red btn-small" onclick="adminDeleteChannel(${ch.id})">Törlés</button></div>`; });
        document.getElementById('AdminChannelsList').innerHTML = html;
    }
}

async function adminCreateChannel() {
    let name = document.getElementById('NewChannelName').value.trim();
    let type = document.getElementById('NewChannelType').value;
    let maxUsersEl = document.getElementById('NewChannelMaxUsers');
    let maxUsers = maxUsersEl ? parseInt(maxUsersEl.value) || 0 : 0;

    if (!name)
        return showToast("Adj meg egy nevet!", true);

    let res = await fetch(`${currentServerUrl}/api/admin/channel/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, maxUsers, adminUserId: currentUserId })
    });
    if (!res.ok) return showToast(await readErrorMessage(res), true);

    document.getElementById('NewChannelName').value = "";
    if (maxUsersEl) maxUsersEl.value = 0;
    adminLoadRooms();
    loadChannels();
    showToast("Szoba létrehozva!");
}

async function adminDeleteChannel(id) {
    showConfirm("Szoba törlése", "Biztosan törlöd ezt a szobát? Az üzenetek elérhetetlenné válnak.", async () => {
        let res = await fetch(`${currentServerUrl}/api/admin/channel/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminUserId: currentUserId })
        });
        if (!res.ok) return showToast(await readErrorMessage(res), true);

        adminLoadRooms();
        loadChannels();
        showToast("Szoba törölve!");
    });
}

async function adminBanUser() {
    let uId = parseInt(document.getElementById('BanUserId').value);

    if (!uId)
        return showToast("Adj meg egy érvényes ID-t!", true);

    let res = await fetch(`${currentServerUrl}/api/admin/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uId, adminUserId: currentUserId })
    });
    if (!res.ok) return showToast(await readErrorMessage(res), true);

    document.getElementById('BanUserId').value = "";
    showToast("Felhasználó kitiltva!");
}

// ==========================================
// ÉRTESÍTÉSEK ÉS TOAST
// ==========================================
// A bejövő értesítések kezelője (kiegészítve a msgId-vel)
function handleIncomingNotification(senderId, senderName, channelId, channelName, content, isDM, msgId) { // <--- ÚJ: msgId paraméter!
    playSound('msg');
    let plainText = content.replace(/\[ATTACHMENT\].*/, '📎 Csatolt Fájl').substring(0, 60);
    let title = isDM ? `Privát: ${senderName}` : `${channelName} - ${senderName}`;
    
    if (allowDesktopNotifs && "Notification" in window && Notification.permission === "granted" && document.hidden) {
        let osNotif = new Notification(title, { body: plainText, icon: 'logo.png' });
        osNotif.onclick = function () {
            window.focus();
            if (isDM) openDirectMessage(senderId, senderName);
            else openChannel(channelId, channelName, 'text');
            osNotif.close();
        };
    }
    
    if (allowToastNotifs) {
        createAppToast(senderId, title, plainText, isDM ? senderId : channelId, isDM, channelName, senderName);
    }
    
    if (isDM) {
        unreadDMs.add(senderId);
        addUnreadItem('dms', senderId, senderName, msgId); // <--- ÚJ: Átadjuk az ID-t
        if (document.getElementById('MembersView').style.display === 'flex') openMembersView();
    }
    else {
        unreadChannels.add(channelId);
        addUnreadItem('channels', channelId, channelName, msgId); // <--- ÚJ: Átadjuk az ID-t
        let chEl = document.getElementById(`ch-${channelId}`);
        if (chEl) {
            chEl.classList.add('unread');
            if (!chEl.querySelector('.unread-dot')) chEl.innerHTML += `<div class="unread-dot"></div>`;
        }
    }
}

// Az unread hozzáadása (megjegyzi a msgId-t is!)
function addUnreadItem(type, id, name, msgId) {
    let targetList = type === 'channels' ? unreadCounts.channels : unreadCounts.dms;
    
    if (!targetList[id]) {
        targetList[id] = { name: name, count: 0, latestMsgId: 0 };
    }
    
    targetList[id].count++;
    
    // Ha kaptunk ID-t, mentjük a legfrissebbet
    if (msgId && msgId > targetList[id].latestMsgId) {
        targetList[id].latestMsgId = msgId;
    }
    
    updateBellIcon();
}

function createAppToast(senderId, title, text, targetId, isDM, channelName, senderName) {
    let container = document.getElementById('NotificationContainer');
    let toast = document.createElement('div');
    toast.className = 'toast-card';
    let u = serverUsersCache.find(x => x.id === senderId);
    let avatarBgAttr = (u && u.avatar) ? `data-bg-src="${currentServerUrl}${u.avatar}"` : "";
    let avatarColor = (u && u.avatar) ? "color: transparent;" : "";
    let initial = senderName ? senderName.charAt(0).toUpperCase() : "?";
    toast.innerHTML = `<div class="toast-avatar" ${avatarBgAttr} style="${avatarColor}">${initial}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-text">${text}</div></div>`;
    toast.onclick = () => {
        if (isDM)
            openDirectMessage(targetId, senderName);
        else
            openChannel(targetId, channelName, 'text');

        toast.style.animation = "fadeOutCard 0.2s ease-out forwards"; setTimeout(() => toast.remove(), 200);
    };
    container.appendChild(toast); setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = "fadeOutCard 0.3s ease-out forwards";
            setTimeout(() => toast.remove(), 300);
        }
    }, 6000);
}

// ==========================================
// INTELLIGENS HARANG ÉS ÉRTESÍTÉS MOTOR
// ==========================================
window.unreadCounts = { channels: {}, dms: {} };

// Harang piros pöttyének frissítése (számokkal!)
function updateBellIcon() {
    let total = 0;
    Object.values(unreadCounts.channels).forEach(c => total += c.count);
    Object.values(unreadCounts.dms).forEach(d => total += d.count);

    // Keresd meg a harang badge-ét. Feltételezem a class-a "badge"
    let badge = document.querySelector('.bell-container .badge'); 
    if (badge) {
        if (total > 0) {
            badge.style.display = 'flex';
            badge.innerText = total > 9 ? '9+' : total; // Ha sok van, 9+ lesz
        } else {
            badge.style.display = 'none';
        }
    }
}

// Menü nyitása / zárása
window.toggleNotifMenu = function() {
    let menu = document.getElementById('NotifMenu');
    if (menu.style.display === 'flex') {
        menu.style.display = 'none';
    } else {
        renderNotifMenu();
        menu.style.display = 'flex';
    }
}

// Kártyák legenerálása
function renderNotifMenu() {
    let menu = document.getElementById('NotifMenu');
    let html = `
        <div class="notif-header">
            <span>Értesítések</span>
            <span class="notif-clear-btn" onclick="clearAllNotifs()">Összes törlése</span>
        </div>
    `;

    let hasAny = false;

    // Szobák kártyái
    for (let chId in unreadCounts.channels) {
        let data = unreadCounts.channels[chId];
        if (data.count > 0) {
            hasAny = true;
            html += `
                <div class="notif-item-card" onclick="openNotifTarget('channel', ${chId}, '${data.name}')">
                    <div class="notif-item-icon">#</div>
                    <div class="notif-item-text">
                        <div class="notif-item-title">${data.name} szoba</div>
                        <div class="notif-item-desc">Új üzenetek érkeztek</div>
                    </div>
                    <div class="notif-badge-pill">${data.count} db</div>
                </div>
            `;
        }
    }

    // Privát üzenetek kártyái
    for (let dmId in unreadCounts.dms) {
        let data = unreadCounts.dms[dmId];
        if (data.count > 0) {
            hasAny = true;
            let initial = data.name.charAt(0).toUpperCase();
            html += `
                <div class="notif-item-card" onclick="openNotifTarget('dm', ${dmId}, '${data.name}')">
                    <div class="notif-item-icon">${initial}</div>
                    <div class="notif-item-text">
                        <div class="notif-item-title">${data.name}</div>
                        <div class="notif-item-desc">Privát üzenetet küldött</div>
                    </div>
                    <div class="notif-badge-pill">${data.count} db</div>
                </div>
            `;
        }
    }

    if (!hasAny) {
        html += `<div class="notif-empty">Nincsenek új értesítéseid. Minden csendes! 🌙</div>`;
    }

    menu.innerHTML = html;
}

// Kattintás egy kártyára
window.openNotifTarget = function(type, id, name) {
    document.getElementById('NotifMenu').style.display = 'none'; // Menü bezár
    
    // Számláló nullázása, mert elolvastuk
    if (type === 'channel') {
        unreadCounts.channels[id].count = 0;
        openChannel(id, name, 'text'); // Az eredeti szobanyitó függvényed
    } else {
        unreadCounts.dms[id].count = 0;
        openDirectMessage(id, name); // Az eredeti DM nyitó függvényed
    }
    updateBellIcon();
}

window.clearAllNotifs = function() {
    // --- ÚJ JAVÍTÁS: MENTÉS A TE LOCALSTORAGE-ODBA! ---
    for (let chId in unreadCounts.channels) {
        let mId = unreadCounts.channels[chId].latestMsgId;
        if (mId) saveReadReceipt('channels', chId, mId);
    }
    for (let dmId in unreadCounts.dms) {
        let mId = unreadCounts.dms[dmId].latestMsgId;
        if (mId) saveReadReceipt('dms', dmId, mId);
    }
    // ----------------------------------------------------

    unreadCounts = { channels: {}, dms: {} };
    unreadChannels.clear();
    unreadDMs.clear();
    document.querySelectorAll('.unread-dot').forEach(el => el.remove());
    document.querySelectorAll('.unread').forEach(el => el.classList.remove('unread'));
    
    if (document.getElementById('MembersView').style.display === 'flex') openMembersView();

    updateBellIcon();
    renderNotifMenu();
}

// ==========================================
// INTELLIGENS GLOBÁLIS TOOLTIP MOTOR
// ==========================================
document.addEventListener('mouseover', function(e) {
    let target = e.target.closest('[data-tip]');
    if (target) {
        let tooltip = document.getElementById('GlobalTooltip');
        tooltip.innerHTML = target.getAttribute('data-tip');
        tooltip.style.display = 'block';
    }
});

document.addEventListener('mousemove', function(e) {
    let tooltip = document.getElementById('GlobalTooltip');
    if (tooltip.style.display === 'block') {
        let x = e.clientX + 15; // 15px-el az egér mellett
        let y = e.clientY + 15;

        // HA KILÓGNA JOBBRA, AKKOR ÁTDOBJUK AZ EGÉR BAL OLDALÁRA!
        if (x + tooltip.offsetWidth > window.innerWidth) {
            x = e.clientX - tooltip.offsetWidth - 10;
        }

        // HA KILÓGNA ALUL, ÁTDOBJUK FELFELÉ!
        if (y + tooltip.offsetHeight > window.innerHeight) {
            y = e.clientY - tooltip.offsetHeight - 10;
        }

        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }
});

document.addEventListener('mouseout', function(e) {
    let target = e.target.closest('[data-tip]');
    if (target) {
        document.getElementById('GlobalTooltip').style.display = 'none';
    }
});

// ==========================================
// AUTOMATIKUS MENÜ BEZÁRÁS KATTINTÁSRA
// ==========================================
document.addEventListener('click', function(e) {
    let menu = document.getElementById('NotifMenu');
    let bell = document.querySelector('.bell-container');
    
    // Ha a menü nyitva van, ÉS a kattintás nem a menün belül történt, ÉS nem is magán a harangon...
    if (menu && menu.style.display === 'flex') {
        if (!menu.contains(e.target) && (!bell || !bell.contains(e.target))) {
            menu.style.display = 'none'; // Akkor zárjuk be!
        }
    }
});

// ==========================================
// TÉMA ÉS SZÍNVÁLASZTÓ MOTOR
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // Téma betöltése induláskor
    let savedColor = localStorage.getItem('naryan_theme_color');
    if (savedColor) {
        document.documentElement.style.setProperty('--accent', savedColor);
        
        let r = parseInt(savedColor.slice(1, 3), 16);
        let g = parseInt(savedColor.slice(3, 5), 16);
        let b = parseInt(savedColor.slice(5, 7), 16);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
        
        let picker = document.getElementById('ThemeColorPicker');
        if (picker) picker.value = savedColor;
    }
});

window.changeThemeColor = function(colorHex) {
    // Beállítjuk a fő színt
    document.documentElement.style.setProperty('--accent', colorHex);
    
    // Generálunk belőle egy picit sötétebb/áttetszőbb színt a ragyogáshoz (Glow)
    // Hexából RGBA konvertálás:
    let r = parseInt(colorHex.slice(1, 3), 16);
    let g = parseInt(colorHex.slice(3, 5), 16);
    let b = parseInt(colorHex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
    
    // Elmentjük a memóriába
    localStorage.setItem('naryan_theme_color', colorHex);
};

window.resetThemeColor = function() {
    let defaultColor = "#ff6600"; // Ide írd be azt a HEX kódot, ami az eredeti narancssárgád volt!
    document.getElementById('ThemeColorPicker').value = defaultColor;
    changeThemeColor(defaultColor);
    localStorage.removeItem('naryan_theme_color');
};

window.toggleStatusMenu = function() {
    let menu = document.getElementById('StatusMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
};

window.setMyStatus = function(newStatus) {
    document.getElementById('StatusMenu').style.display = 'none'; // Menü bezár
    if (hubConnection) {
        hubConnection.invoke("ChangeStatus", currentUserId, newStatus);
    }
    // Saját felületünk azonnali frissítése
    document.querySelectorAll(`.user-status-${currentUserId}`).forEach(dot => {
        dot.className = `status-dot status-${newStatus} user-status-${currentUserId}`;
    });
};

// Zárja be a státusz menüt is, ha máshova kattintasz
document.addEventListener('click', function(e) {
    let menu = document.getElementById('StatusMenu');
    let avatar = document.getElementById('MyAvatar');
    if (menu && menu.style.display === 'block') {
        if (!menu.contains(e.target) && !avatar.contains(e.target)) {
            menu.style.display = 'none';
        }
    }
});