// ==========================================
// SZÖVEGES CHAT LOGIKA
// ==========================================
function parseMarkdown(text) {
    if (!text) return "";
    
    // 1. Alapvető biztonság (HTML kódok hatástalanítása)
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // 2. Formázások
    text = text.replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>');
    text = text.replace(/\*\*([\s\S]*?)\*\*/g, '<b>$1</b>');
    text = text.replace(/\*([\s\S]*?)\*/g, '<i>$1</i>');
    text = text.replace(/\[QUOTE=(.*?)\]([\s\S]*?)\[\/QUOTE\]/g, '<div class="chat-quote-block"><div class="quote-sender">↪ $1 üzenetére:</div><div class="quote-text">$2</div></div>');

    // --- YOUTUBE, GIF ÉS LINK FELDOLGOZÓ ---
    
    // Lépés A: YouTube kódok védelme
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?/g;
    text = text.replace(ytRegex, function(match, videoId) {
        return `[YOUTUBE]${videoId}[/YOUTUBE]`;
    });

    // Lépés B: GIF kódok védelme a Linkesítő elől! 
    // (Levágjuk a https://-t ideiglenesen egy SAFE tagbe)
    text = text.replace(/\[GIF\]https?:\/\/(.*?)\[\/GIF\]/gi, '[GIF-SAFE]$1[/GIF-SAFE]');

    // Lépés C: Minden "http" és "https" szöveget átalakítunk igazi HTML kattintható linkké
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    text = text.replace(urlRegex, '<a href="$1" target="_blank" class="chat-link">$1</a>');

    // Lépés D: HTML elemek generálása a védett kódokból
    text = text.replace(/\[YOUTUBE\](.*?)\[\/YOUTUBE\]/g, '<div class="chat-youtube-embed"><iframe src="https://www.youtube.com/embed/$1" allowfullscreen></iframe></div>');
    text = text.replace(/\[GIF-SAFE\](.*?)\[\/GIF-SAFE\]/g, '<img src="https://$1" class="chat-image" style="max-width: 250px; border-radius: 8px; display: block; margin-top: 5px;">');

    // ---------------------------------------

    // 3. Sortörések kezelése
    let parts = text.split(/(<pre class="code-block"><code>[\s\S]*?<\/code><\/pre>|<div class="chat-youtube-embed">[\s\S]*?<\/div>)/);
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<pre') && !parts[i].startsWith('<div class="chat-youtube')) {
            parts[i] = parts[i].replace(/\n/g, '<br>');
        }
    }
    return parts.join('');
}

function formatText(symbol) {
    const textarea = document.getElementById('ChatInput');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    if (start === end)
        return;

    const selectedText = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    textarea.value = before + symbol + selectedText + symbol + after;
    textarea.focus();
}

function appendMessage(text, isMine, msgId, time, senderName, senderId, reactionsJson = "{}") {
    const container = document.getElementById('ChatMessages');
    const msgDiv = document.createElement('div'); 
    msgDiv.className = 'message';

    if (msgId) msgDiv.id = `msg-${msgId}`;

    if (text.startsWith("[SYS]")) {
        msgDiv.style.textAlign = "center";
        msgDiv.style.color = "var(--text-muted)";
        msgDiv.innerText = text.replace("[SYS]", "") + ` (${time})`;
        container.appendChild(msgDiv); 
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10); 
        return;
    }

    // --- AVATAR KERESÉSE (STÁTUSZ PÖTTY NÉLKÜL) ---
    let avatarHtml = "";
    let senderUser = typeof serverUsersCache !== 'undefined' ? serverUsersCache.find(u => u.id === senderId) : null;

    if (senderUser && senderUser.avatar) {
        let avatarUrl = senderUser.avatar.startsWith('http') ? senderUser.avatar : currentServerUrl + senderUser.avatar;
        avatarHtml = `<div class="msg-avatar" style="background-image: url('${avatarUrl}');"></div>`;
    } else {
        let initial = senderName ? senderName.charAt(0).toUpperCase() : '?';
        avatarHtml = `<div class="msg-avatar default-avatar">${initial}</div>`;
    }

    // --- FEJLÉC ÁTALAKÍTÁSA (Kép + Név + Idő) ---
    let nameHtml = `
        <div class="msg-header">
            ${avatarHtml}
            <div class="msg-header-info">
                <span class="sender-name" style="color: ${isMine ? 'var(--accent)' : 'var(--success)'};">${senderName}</span>
                <span class="msg-time">${time}</span>
            </div>
        </div>
    `;

    let parts = text.split('[ATTACHMENT]'); 
    let textContent = parts[0].trim();
    let contentHtml = "";

    if (textContent) {
        // Okosabb ellenőrzés: ismeri a láthatatlan formázókat (\uFE0F), a bőrszíneket és az összetett emojikat (\u200D) is!
        let isOnlyEmoji = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\s]+$/gu.test(textContent);
        
        if (isOnlyEmoji) {
            // Ha csak emoji, megkapja a jumbo-emoji osztályt, és NEM futtatjuk le rajta a Markdown-t
            contentHtml = `<div class="msg-content jumbo-emoji">${textContent}</div>`;
        } else {
            // Ha van benne szöveg is, akkor normál üzenetként kezeljük
            contentHtml = `<div class="msg-content">${parseMarkdown(textContent)}</div>`;
        }
    }

    if (parts.length > 1) {
        let fileInfo = parts[1].split('|');
        let fileUrl = fileInfo[0];
        let fileName = fileInfo[1] || 'Fájl';
        let ext = fileName.split('.').pop().toLowerCase();
        
        // Képek
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            contentHtml += `<div class="msg-attachment"><img src="${currentServerUrl}${fileUrl}" class="chat-image" onclick="downloadFile('${currentServerUrl}${fileUrl}', '${fileName}')" title="Kattints a letöltéshez"></div>`;
        } 
        // Hangfájlok (Lejátszó)
        else if (['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(ext)) {
            let uniqueId = Math.random().toString(36).substr(2, 9);
            contentHtml += `
            <div class="msg-attachment">
                <div class="naryan-audio-player" id="player-${uniqueId}">
                    <audio id="audio-${uniqueId}" src="${currentServerUrl}${fileUrl}" preload="metadata" onloadedmetadata="initAudio('${uniqueId}')" ontimeupdate="updateAudio('${uniqueId}')" onended="endAudio('${uniqueId}')"></audio>
                    
                    <button class="audio-btn" id="audio-btn-${uniqueId}" onclick="toggleAudioPlay('${uniqueId}')" title="Lejátszás/Szünet">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    
                    <div class="audio-time-display" id="audio-time-${uniqueId}">0:00 / 0:00</div>
                    
                    <div class="audio-slider-container" onclick="seekAudio(event, '${uniqueId}')" title="Beletekerés">
                        <div class="audio-slider-bg"></div>
                        <div class="audio-slider-progress" id="audio-progress-${uniqueId}"></div>
                    </div>
                    
                    <div class="audio-volume-container">
                        <button class="audio-control-btn" id="audio-mute-${uniqueId}" onclick="toggleAudioMute('${uniqueId}')" title="Némítás/Hangosítás">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                        </button>
                        <input type="range" class="audio-volume-slider" id="audio-vol-${uniqueId}" min="0" max="1" step="0.05" value="1" oninput="changeAudioVolume('${uniqueId}', this.value)" title="Hangerő">
                    </div>

                    <button class="audio-control-btn audio-speed-btn" id="audio-speed-${uniqueId}" onclick="toggleAudioSpeed('${uniqueId}')" title="Lejátszási sebesség">1x</button>
                    
                    <button class="audio-control-btn" onclick="downloadFile('${currentServerUrl}${fileUrl}', '${fileName}')" title="Fájl letöltése">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    </button>
                </div>
            </div>`;
        }
        // Egyéb fájlok
        else {
            contentHtml += `<div class="msg-attachment"><a href="#" onclick="downloadFile('${currentServerUrl}${fileUrl}', '${fileName}'); return false;" class="chat-file-link" title="Kattints a letöltéshez"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align: middle; margin-right: 5px;"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>${fileName}</a></div>`;
        }
    }

    // --- MENÜ GOMBOK ---
    let menuHtml = `<div class="msg-menu">`;

    // ÚJ: Reakció Gomb (btn-reaction class-al, hogy ne záródjon be azonnal a menü kattintáskor)
    if (msgId) {
        menuHtml += `<div class="btn-icon btn-reaction" onclick="openReactionPicker(event, ${msgId})" data-tip="Reakció"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>`;
    }

    if (isMine && msgId)
        menuHtml += `<div class="btn-icon text-red" onclick="deleteMessage(${msgId})" data-tip="Törlés"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></div>`;

    if (!isMine)
        menuHtml += `<div class="btn-icon" onclick="openReportModal(${senderId})" data-tip="Jelentés"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"></path></svg></div>`;

    menuHtml += `<div class="btn-icon" onclick="initReply('${senderName}', '${encodeURIComponent(text)}')" data-tip="Válasz"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg></div>`;
    menuHtml += `</div>`;
    
    // --- REAKCIÓK BETÖLTÉSE (chat.js módosítás) ---
    let reactionsHtml = `<div class="msg-reactions" id="reactions-${msgId}">`;
    try {
        if (reactionsJson && reactionsJson !== "{}" && reactionsJson !== "") {
            let reactObj = JSON.parse(reactionsJson);
            for (let emoji in reactObj) {
                let userIds = reactObj[emoji];
                let count = userIds.length;
                let iReacted = userIds.includes(currentUserId) ? 'reacted' : '';
                let isDM = currentDMTargetId > 0; // Megnézzük, hogy DM-ben vagyunk-e!
                reactionsHtml += `<div class="reaction-badge ${iReacted}" data-emoji="${emoji}" onclick="hubConnection.invoke('AddReaction', ${msgId}, currentUserId, '${emoji}', ${isDM})">${emoji} <span class="react-count">${count}</span></div>`;
            }
        }
    } catch(e) {}
    reactionsHtml += `</div>`;
    
    // Itt rakjuk össze a végleges HTML-t: Fejléc + Tartalom + Reakciók + Menü
    msgDiv.innerHTML = `${nameHtml}${contentHtml}${reactionsHtml}${menuHtml}`;
    container.appendChild(msgDiv); 
    
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 10);
}

function sendChatMessage() {
    let input = document.getElementById('ChatInput'); let text = input.value.trim();

    if (currentReply && text) {
        text = `[QUOTE=${currentReply.sender}]${currentReply.text}[/QUOTE]\n` + text;
        cancelReply(); // Bezárjuk a válasz dobozt
    }

    if (text && hubConnection) {
        if (currentDMTargetId > 0)
            hubConnection.invoke("SendDirectMessage", currentUserId, currentDMTargetId, text);

        else if (currentChannelId > 0)
            hubConnection.invoke("SendMessage", currentChannelId, currentUserId, currentUsername, text);

        input.value = "";
        input.style.height = 'auto';
    }
}

function deleteMessage(msgId) {
    showConfirm("Üzenet törlése", "Biztosan törlöd ezt az üzenetet?", () => {
        hubConnection.invoke("DeleteMessage", msgId);
    });
}
function deleteAllMyMessages() {
    showConfirm("Összes üzenet törlése", "Biztosan törlöd az összes eddigi üzenetedet ebből a chatből? Ezt NEM lehet visszavonni!", () => {
        if (currentDMTargetId > 0) {
            hubConnection.invoke("DeleteAllMyDirectMessages", currentDMTargetId, currentUserId);
        }
        else if (currentChannelId > 0) {
            hubConnection.invoke("DeleteAllMyMessages", currentChannelId, currentUserId);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    let chatInput = document.getElementById('ChatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';

            if (this.value === '')
                this.style.height = 'auto';
        });
    }
    const chatRoom = document.getElementById('ChatRoomView');
    const dragOverlay = document.getElementById('DragOverlay');

    if (chatRoom && dragOverlay) {
        chatRoom.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!document.getElementById('ChatInput').disabled)
                dragOverlay.style.display = 'flex';
        });
        chatRoom.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (e.target === dragOverlay)
                dragOverlay.style.display = 'none';
        });
        chatRoom.addEventListener('drop', (e) => {
            e.preventDefault(); dragOverlay.style.display = 'none';
            if (!document.getElementById('ChatInput').disabled && e.dataTransfer.files.length > 0)
                uploadChatFile(e.dataTransfer.files[0]);
        });
        document.addEventListener('paste', (e) => {
            if (!document.getElementById('ChatInput').disabled && e.clipboardData && e.clipboardData.files.length > 0) {
                e.preventDefault(); uploadChatFile(e.clipboardData.files[0]);
            }
        });
    }
});

// ==========================================
// FÁJL FELTÖLTÉS / LETÖLTÉS
// ==========================================
async function uploadAvatar(input) {
    if (input.files && input.files[0]) {
        let file = input.files[0];

        if (!file.type.startsWith('image/')) {
            showToast("Csak képet tölthetsz fel profilképnek!", true);
            input.value = "";
            return;
        }

        showToast("Kép feldolgozása...", false);
        let reader = new FileReader();
        reader.onload = function (e) {
            let img = new Image();
            img.onload = function () {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                let maxW = 256; let maxH = 256;
                let w = img.width; let h = img.height;

                if (w > h) {
                    if (w > maxW) {
                        h *= maxW / w; w = maxW;
                    }
                } else {
                    if (h > maxH) {
                        w *= maxH / h; h = maxH;
                    }
                }

                canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(async function (blob) {
                    let formData = new FormData();
                    formData.append('file', blob, "avatar.webp");
                    showToast("Profilkép feltöltése...", false);
                    try {
                        let res = await fetch(`${currentServerUrl}/api/upload`, {
                            method: 'POST',
                            body: formData
                        });
                        if (res.ok) {
                            let data = await res.json();
                            let avatarUrl = data.url;
                            let fullUrl = currentServerUrl + avatarUrl;
                            // Csak a beállítások ablak kis előnézetét frissítjük kézzel
                            const preview = document.getElementById('SettingsAvatarPreview');
                            preview.innerHTML = "";
                            preview.style.backgroundImage = `url('${fullUrl}')`;
                            preview.style.backgroundSize = "cover";
                            preview.style.backgroundPosition = "center";
                            preview.style.color = "transparent";
                            
                            // A memóriában azonnal átírjuk a saját képünket
                            let me = serverUsersCache.find(u => u.id === currentUserId);
                            if (me) me.avatar = avatarUrl;

                            // És rábízzuk a bal alsó sarkot a profi függvényünkre! (Pötty megmarad)
                            refreshMyProfileUI();
                            if (hubConnection) {
                                hubConnection.invoke("ChangeAvatar", currentUserId, avatarUrl).catch(err => console.error(err));
                            }
                            showToast("Profilkép frissítve!");
                        } else {
                            showToast("Tárhely hiba a profilképnél!", true);
                        }
                    } catch (e) {
                        showToast("Feltöltési hiba!", true);
                    }
                }, 'image/webp', 0.85);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file); input.value = "";
    }
}

async function uploadChatFile(file) {
    if (!file)
        return;

    showToast("Fájl feltöltése...", false);
    let formData = new FormData();
    formData.append('file', file);

    try {
        let res = await fetch(`${currentServerUrl}/api/upload`, {
            method: 'POST',
            body: formData
        });
        if (res.ok) {
            let data = await res.json();
            let attachCode = `[ATTACHMENT]${data.url}|${data.name}`;
            let input = document.getElementById('ChatInput');
            let text = input.value.trim();

            // --- ÚJ RÉSZ: IDÉZET HOZZÁRAGASZTÁSA KÉP KÜLDÉSEKOR IS ---
            if (currentReply) {
                text = `[QUOTE=${currentReply.sender}]${currentReply.text}[/QUOTE]\n` + text;
                cancelReply();
            }
            // ----------------------------------------------------------

            let finalMsg = text ? `${text} ${attachCode}` : attachCode;
            
            if (currentDMTargetId > 0)
                hubConnection.invoke("SendDirectMessage", currentUserId, currentDMTargetId, finalMsg);
            else
                hubConnection.invoke("SendMessage", currentChannelId, currentUserId, currentUsername, finalMsg);
            
            input.value = ""; document.getElementById('ChatFileInput').value = "";
        } else {
            showToast("Szerver hiba (Tárhely Limit MB?)", true);
        }
    } catch (e) {
        showToast("Fájlküldési hiba!", true);
    }
}

function downloadFile(url, filename) {
    showToast("Letöltés indítása...", false); 
    
    let relativePath = url.replace(currentServerUrl, '');
    let downloadUrl = `${currentServerUrl}/api/download?file=${encodeURIComponent(relativePath)}&name=${encodeURIComponent(filename)}`;
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.target = "_blank"; // <--- EZ A VARÁZSSZÓ, AMI MEGHAGYJA A KAPCSOLATOT!
    document.body.appendChild(a); 
    a.click();
    document.body.removeChild(a);
}

// ==========================================
// GÉPELÉS JELZŐ MOTOR
// ==========================================
let myTypingTimeout = null;
let isTypingNow = false;
let hideTypingTimers = {};

// 1. Gépelésünk küldése a szervernek
document.getElementById('ChatInput').addEventListener('input', function() {
    if (!isTypingNow) {
        isTypingNow = true;
        let targetId = currentDMTargetId > 0 ? currentDMTargetId : currentChannelId;
        let isDM = currentDMTargetId > 0;
        
        if (hubConnection && targetId > 0) {
            hubConnection.invoke("SendTypingSignal", currentUserId, targetId, isDM, currentUsername);
        }
    }
    
    // 3 másodperc inaktivitás után újra küldhetjük a jelet
    clearTimeout(myTypingTimeout);
    myTypingTimeout = setTimeout(() => {
        isTypingNow = false;
    }, 3000); 
});

// 2. Mások gépelésének megjelenítése
window.handleTypingIndicator = function(senderId, targetId, isDM, senderName) {
    let isValid = false;
    
    // Csak akkor mutassuk, ha abban a szobában/DM-ben vagyunk, ahol épp írnak!
    if (isDM && currentDMTargetId === senderId) isValid = true; 
    if (!isDM && currentChannelId === targetId) isValid = true; 

    if (!isValid) return;

    let indicator = document.getElementById('TypingIndicator');
    indicator.innerText = `💬 ${senderName} éppen ír...`;
    indicator.style.display = 'block';

    // Elrejtés 3 másodperc múlva, ha abbahagyta a gépelést
    clearTimeout(hideTypingTimers[senderId]);
    hideTypingTimers[senderId] = setTimeout(() => {
        indicator.style.display = 'none';
    }, 3000);
}

// ==========================================
// VÁLASZ (REPLY) MOTOR
// ==========================================
let currentReply = null;

window.initReply = function(senderName, encodedText) {
    let rawText = decodeURIComponent(encodedText);
    
    // Levágjuk a csatolmány kódokat és a korábbi idézeteket, hogy csak a tiszta szöveget idézzük (max 80 karaktert)
    let cleanText = rawText.replace(/\[ATTACHMENT\].*/, '📎 Csatolt Fájl').replace(/\[QUOTE=.*?\][\s\S]*?\[\/QUOTE\]/g, '').substring(0, 80);
    if (rawText.length > 80) cleanText += "...";
    
    currentReply = { sender: senderName, text: cleanText };
    document.getElementById('ReplySender').innerText = `Válasz neki: ${senderName}`;
    document.getElementById('ReplyText').innerText = cleanText;
    document.getElementById('ReplyPreview').style.display = 'block';
    document.getElementById('ChatInput').focus();
};

window.cancelReply = function() {
    currentReply = null;
    document.getElementById('ReplyPreview').style.display = 'none';
};

// ==========================================
// HANGÜZENET (VOICE NOTE) MOTOR
// ==========================================
let mediaRecorder = null;
let audioChunks = [];
let isRecordingVoice = false;

window.toggleVoiceRecord = async function() {
    let btn = document.getElementById('BtnVoiceRecord');

    if (!isRecordingVoice) {
        // --- FELVÉTEL INDÍTÁSA ---
        try {
            let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                // Amikor leállítjuk, csinálunk a hangból egy fájlt
                let audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                // Becsomagoljuk úgy, mintha egy sima fájlt húztál volna be a gépből
                let audioFile = new File([audioBlob], `voicenote_${Date.now()}.webm`, { type: 'audio/webm' });
                
                // És elküldjük a normál fájlfeltöltővel!
                uploadChatFile(audioFile);
                
                // Mikrofon elengedése
                stream.getTracks().forEach(track => track.stop());
                audioChunks = [];
            };

            audioChunks = [];
            mediaRecorder.start();
            isRecordingVoice = true;
            btn.classList.add('recording');
            showToast("🎙️ Felvétel indítva...", false);

        } catch (e) {
            showToast("Nincs engedély a mikrofonhoz!", true);
        }
    } else {
        // --- FELVÉTEL LEÁLLÍTÁSA ÉS KÜLDÉSE ---
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        isRecordingVoice = false;
        btn.classList.remove('recording');
        showToast("Hangüzenet küldése...", false);
    }
};

// ==========================================
// SAJÁT AUDIO LEJÁTSZÓ MOTOR
// ==========================================
window.toggleAudioPlay = function(id) {
    let audio = document.getElementById(`audio-${id}`);
    let btn = document.getElementById(`audio-btn-${id}`);
    
    if (audio.paused) {
        // Opcionális luxus: ha elindítasz egyet, a többit leállítja!
        document.querySelectorAll('audio').forEach(a => {
            if(a.id !== `audio-${id}` && !a.paused) {
                a.pause();
                let otherBtn = document.getElementById(a.id.replace('audio-', 'audio-btn-'));
                if(otherBtn) {
                    otherBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                    otherBtn.classList.remove('playing');
                }
            }
        });
        
        audio.play();
        // Pause ikon
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; 
        btn.classList.add('playing');
    } else {
        audio.pause();
        // Play ikon
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; 
        btn.classList.remove('playing');
    }
};

window.updateAudio = function(id) {
    let audio = document.getElementById(`audio-${id}`);
    let progress = document.getElementById(`audio-progress-${id}`);
    let timeDisp = document.getElementById(`audio-time-${id}`);
    if (audio.duration) {
        let percent = (audio.currentTime / audio.duration) * 100;
        progress.style.width = percent + '%';
        timeDisp.innerText = formatAudioTime(audio.currentTime) + " / " + formatAudioTime(audio.duration);
    }
};

window.initAudio = function(id) {
    let audio = document.getElementById(`audio-${id}`);
    let timeDisp = document.getElementById(`audio-time-${id}`);
    if (audio.duration && audio.duration !== Infinity) {
        timeDisp.innerText = "0:00 / " + formatAudioTime(audio.duration);
    }
};

window.endAudio = function(id) {
    let btn = document.getElementById(`audio-btn-${id}`);
    let progress = document.getElementById(`audio-progress-${id}`);
    let timeDisp = document.getElementById(`audio-time-${id}`);
    let audio = document.getElementById(`audio-${id}`);
    
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    btn.classList.remove('playing');
    progress.style.width = '0%';
    if (audio.duration) timeDisp.innerText = "0:00 / " + formatAudioTime(audio.duration);
};

window.seekAudio = function(e, id) {
    let container = e.currentTarget;
    let audio = document.getElementById(`audio-${id}`);
    if(audio.duration) {
        let rect = container.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let percent = Math.max(0, Math.min(1, x / rect.width));
        audio.currentTime = percent * audio.duration;
    }
};

function formatAudioTime(seconds) {
    let min = Math.floor(seconds / 60);
    let sec = Math.floor(seconds % 60);
    return min + ":" + (sec < 10 ? "0" + sec : sec);
}

// --- ÚJ FUNKCIÓK A GOMBOKHOZ ---

window.toggleAudioMute = function(id) {
    let audio = document.getElementById(`audio-${id}`);
    let muteBtn = document.getElementById(`audio-mute-${id}`);
    let volSlider = document.getElementById(`audio-vol-${id}`);
    
    audio.muted = !audio.muted;
    if (audio.muted || audio.volume === 0) {
        // Elnémított ikon
        muteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
        volSlider.value = 0;
    } else {
        // Hangos ikon
        muteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
        volSlider.value = audio.volume;
    }
};

window.changeAudioVolume = function(id, val) {
    let audio = document.getElementById(`audio-${id}`);
    audio.volume = val;
    if (val > 0 && audio.muted) toggleAudioMute(id);
    else if (val == 0 && !audio.muted) toggleAudioMute(id);
};

window.toggleAudioSpeed = function(id) {
    let audio = document.getElementById(`audio-${id}`);
    let speedBtn = document.getElementById(`audio-speed-${id}`);
    
    if (audio.playbackRate === 1) {
        audio.playbackRate = 1.5;
        speedBtn.innerText = "1.5x";
    } else if (audio.playbackRate === 1.5) {
        audio.playbackRate = 2;
        speedBtn.innerText = "2x";
    } else {
        audio.playbackRate = 1;
        speedBtn.innerText = "1x";
    }
};

// ==========================================
// GIF KERESŐ ÉS TENOR API MOTOR
// ==========================================
let gifTimeout = null;

window.toggleGifPanel = function() {
    let panel = document.getElementById('GifPickerPanel');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        document.getElementById('GifSearchInput').focus();
        if (document.getElementById('GifResults').innerHTML === '') {
            searchGif(''); // Betölti a trendi GIF-eket nyitáskor
        }
    } else {
        panel.style.display = 'none';
    }
};

window.searchGif = function(query) {
    if (query === undefined) query = document.getElementById('GifSearchInput').value;
    
    // Várakozunk 500ms-t, hogy ne spammeljük az API-t minden betűnél
    clearTimeout(gifTimeout);
    gifTimeout = setTimeout(async () => {
        // A publikus Tenor tesztkulcsot használjuk
        let url = query.trim() ?
            `https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=20` :
            `https://g.tenor.com/v1/trending?key=LIVDSRZULELA&limit=20`;

        try {
            let res = await fetch(url);
            let data = await res.json();
            let html = '';
            
            data.results.forEach(g => {
                let previewUrl = g.media[0].tinygif.url; // Kis méret az előnézethez (gyors betöltés)
                let fullUrl = g.media[0].gif.url;        // Nagy méret a chatbe
                html += `<img src="${previewUrl}" class="gif-item" onclick="sendGif('${fullUrl}')" title="Kattints a küldéshez">`;
            });
            
            document.getElementById('GifResults').innerHTML = html;
        } catch (e) {
            document.getElementById('GifResults').innerHTML = '<p style="color:var(--danger); padding:10px;">Hiba a GIF-ek betöltésekor.</p>';
        }
    }, 500);
};

window.sendGif = function(url) {
    let input = document.getElementById('ChatInput');
    // Belerakjuk az inputba a saját GIF kódunkat
    input.value += (input.value ? ' ' : '') + `[GIF]${url}[/GIF]`;
    toggleGifPanel(); // Bezárjuk az ablakot
    
    // Ha akarod, hogy egyből el is küldje, csak vedd ki a kommentet a következő sor elől:
    sendChatMessage(); 
};

// =========================================
// EMOJI RENDSZER
// =========================================

// Kedvenc / Leggyakoribb emojik listája
const naryanEmojis = [
    "😀", "😁", "😂", "🤣", "😉", "😊", "😍", "🥰", "😘", "😎",
    "🤔", "🙄", "😴", "🥶", "🥵", "🤯", "🥳", "😡", "🤬", "😭",
    "👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤘", "👋", "💪",
    "❤️", "💔", "🔥", "✨", "🎉", "💯", "💩", "👻", "👽", "🤖"
];

// Emoji ablak megnyitása / bezárása
window.toggleEmojiPicker = function() {
    let picker = document.getElementById('EmojiPicker');
    
    // Ha még üres a doboz, legeneráljuk az emojikat
    if (picker.innerHTML === '') {
        picker.innerHTML = naryanEmojis.map(e => 
            `<div class="emoji-item" onclick="insertEmoji('${e}')">${e}</div>`
        ).join('');
    }

    // Ki-be kapcsolás
    picker.style.display = picker.style.display === 'grid' ? 'none' : 'grid';
};

// Emoji beszúrása az input mezőbe
window.insertEmoji = function(emoji) {
    let input = document.getElementById('ChatInput');
    
    // Beszúrjuk a kurzor pozíciójához (vagy a végére)
    input.value += emoji;
    input.focus(); // Visszaugrunk a mezőre, hogy lehessen tovább írni
    
    // Bezárjuk az ablakot kattintás után
    document.getElementById('EmojiPicker').style.display = 'none';
};

// Automatikus bezárás, ha máshova kattintasz a képernyőn
document.addEventListener('click', function(e) {
    let picker = document.getElementById('EmojiPicker');
    let btn = document.getElementById('BtnEmoji');
    if (picker && picker.style.display === 'grid') {
        if (!picker.contains(e.target) && (!btn || !btn.contains(e.target))) {
            picker.style.display = 'none';
        }
    }
});