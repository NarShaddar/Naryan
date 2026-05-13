// ==========================================
// SIGNALR MOTOR ESEMÉNYEK
// ==========================================
function initSignalR() {
    if (hubConnection) return;
    hubConnection = new signalR.HubConnectionBuilder().withUrl(`${currentServerUrl}/chatHub`).withAutomaticReconnect().build();

    hubConnection.on("ReceiveMessage", (msgId, channelId, senderId, senderName, content, time) => {
        if (channelId === currentChannelId && currentDMTargetId === 0) {
            appendMessage(content, senderId === currentUserId, msgId, time, senderName, senderId);
            saveReadReceipt('channels', channelId, msgId);
        }
        else {
            let chEl = document.getElementById(`ch-${channelId}`);
            let chName = chEl ? chEl.innerText.replace('#', '').replace('🔊', '').trim() : "Szoba";
            handleIncomingNotification(senderId, senderName, channelId, chName, content, false, msgId);
        }
    });

    // Amikor valaki státuszt vált, frissítjük az összes avatart a képernyőn, ami hozzá tartozik!
    hubConnection.on("UserStatusChanged", (userId, status) => {
        // Megkeressük az összes pöttyöt, ami ehhez a userhez tartozik
        document.querySelectorAll(`.user-status-${userId}`).forEach(dot => {
            // Levesszük a régi státuszt, és rárakjuk az újat
            dot.className = `status-dot status-${status} user-status-${userId}`;
        });
    });

    // Reakció megérkezése
    hubConnection.on("ReceiveReaction", (msgId, reactionsJson) => {
        let container = document.getElementById(`reactions-${msgId}`);
        if (!container) return; 
        
        container.innerHTML = ""; // Nullázzuk és újraépítjük a friss adatokból!
        try {
            let reactObj = JSON.parse(reactionsJson);
            for (let emoji in reactObj) {
                let userIds = reactObj[emoji];
                let count = userIds.length;
                let iReacted = userIds.includes(currentUserId) ? 'reacted' : '';
                
                let badge = document.createElement('div');
                badge.className = `reaction-badge ${iReacted}`;
                badge.dataset.emoji = emoji;
                badge.onclick = () => { hubConnection.invoke("AddReaction", msgId, currentUserId, emoji); };
                badge.innerHTML = `${emoji} <span class="react-count">${count}</span>`;
                container.appendChild(badge);
            }
        } catch (e) { }
    });

    // Gépelés jelző fogadása
    hubConnection.on("UserTyping", (senderId, targetId, isDM, senderName) => {
        if (window.handleTypingIndicator) {
            window.handleTypingIndicator(senderId, targetId, isDM, senderName);
        }
    });

    hubConnection.on("ReceiveDirectMessage", (msgId, senderId, receiverId, content, time) => {
        if (currentDMTargetId > 0 && (senderId === currentDMTargetId || receiverId === currentDMTargetId)) {
            let sName = senderId === currentUserId ? currentUsername : serverUsersCache.find(u => u.id == senderId)?.username || "Partner";
            appendMessage(content, senderId === currentUserId, msgId, time, sName, senderId);
            saveReadReceipt('dms', currentDMTargetId, msgId);
        }
        else if (senderId !== currentUserId) {
            let sName = serverUsersCache.find(u => u.id == senderId)?.username || "Valaki";
            handleIncomingNotification(senderId, sName, 0, "", content, true, msgId);
        }
    });

    hubConnection.on("MessageDeleted", (msgId) => {
        let el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.style.opacity = '0.5';
            el.innerText = "🚫 Törölve";
            setTimeout(() => el.remove(), 1500);
        }
    });

    // Ezt hívja a szerver, ha valaki fizikailag belép vagy kilép (true/false)
    hubConnection.on("UserConnectionChanged", async (userId, isOnline) => {
        await updateUsersCache();
        if (document.getElementById('MembersView').style.display === 'flex') openMembersView();
    });

    // Ezt hívja, ha valaki a menüben rányom a "Láthatatlan" / "Ne zavarjanak" gombra (string)
    hubConnection.on("UserStatusChanged", async (userId, status) => {
        document.querySelectorAll(`.user-status-${userId}`).forEach(dot => {
            dot.className = `status-dot status-${status} user-status-${userId}`;
        });
        await updateUsersCache();
        if (document.getElementById('MembersView').style.display === 'flex') openMembersView();
    });

    hubConnection.on("MessagesCleared", async (channelId, uId) => {
        if (currentChannelId === channelId && currentDMTargetId === 0) {
            document.getElementById('ChatMessages').innerHTML = "";

            try {
                let response = await fetch(`${currentServerUrl}/api/messages/${channelId}`);
                if (response.ok) {
                    let msgs = await response.json();
                    msgs.forEach(m => {
                        appendMessage(m.content, m.senderId === currentUserId, m.id, m.time, m.senderName, m.senderId);
                    });
                }
            } catch (err) {
                console.error("Hálózati hiba:", err);
            }
        }
    });

    hubConnection.on("DirectMessagesCleared", (partnerId, uId) => {
        if (currentDMTargetId > 0 && (currentDMTargetId === partnerId || currentDMTargetId === uId)) {
            document.getElementById('ChatMessages').innerHTML = "";
            fetch(`${currentServerUrl}/api/dm/${currentUserId}/${currentDMTargetId}`)
                .then(r => r.json()).then(msgs => {
                    msgs.forEach(m => {
                        appendMessage(m.content, m.senderId === currentUserId, m.id, m.time, m.senderName, m.senderId)
                    });
                });
        }
    });

    hubConnection.on("UserAvatarChanged", (userId, newAvatarUrl) => {
        let u = serverUsersCache.find(x => x.id === userId); if (u) u.avatar = newAvatarUrl;
        let fullUrl = newAvatarUrl ? currentServerUrl + newAvatarUrl : "";
        const userAvatars = document.querySelectorAll(`.member-card[data-id="${userId}"] .avatar-small`);
        userAvatars.forEach(el => {
            if (fullUrl) {
                el.innerHTML = "";
                el.style.backgroundImage = `url('${fullUrl}')`;
                el.style.backgroundSize = "cover";
                el.style.backgroundPosition = "center";
                el.style.color = "transparent";
            } else {
                el.style.backgroundImage = "none";
                el.style.color = "var(--accent)";
                el.innerHTML = u ? u.username.charAt(0).toUpperCase() : "?";
            }
        });
    });

    hubConnection.on("ServerInfoUpdated", (newName, newAvatarUrl, newFps) => {
        currentServerName = newName;
        serverMaxFps = newFps;
        document.getElementById('CurrentServerName').innerText = newName;

        let updated = false;
        // JAVÍTÁS: Minden azonos URL-ű kártyát frissítünk!
        savedServers.forEach((s, idx) => {
            if (s.url === currentServerUrl) {
                savedServers[idx].serverName = newName;
                savedServers[idx].serverAvatar = newAvatarUrl;
                updated = true;
            }
        });

        if (updated) {
            saveServersToFile();
            renderSavedServers();
        }
    });

    hubConnection.on("UpdateVoiceUsers", (roomId, userIds) => {
        let limitSpan = document.getElementById(`limit-${roomId}`); if (limitSpan) { let maxStr = limitSpan.innerText.split('/')[1]; limitSpan.innerText = `(${userIds.length}/${maxStr}`; }
        let container = document.getElementById(`voice-users-${roomId}`);
        if (!container) return;
        if (userIds.length === 0) { container.innerHTML = ''; return; }

        let html = '';
        userIds.forEach(uid => {
            let u = serverUsersCache.find(x => x.id === uid);
            let uName = u ? u.username : "Ismeretlen";
            let bgStyle = (u && u.avatar) ? `background-image: url('${currentServerUrl}${u.avatar}'); background-size: cover; background-position: center; color: transparent;` : "";
            html += `<div class="voice-user-item"><div class="voice-user-avatar" style="${bgStyle}">${uName.charAt(0).toUpperCase()}</div>${uName}</div>`;
        });
        container.innerHTML = html;
    });

    hubConnection.on("RoomFullError", (channelId) => {
        showToast("A szoba megtelt! Nem tudsz csatlakozni.", true);
        leaveVoiceRoom();
    });

    hubConnection.on("ChannelsUpdated", async () => {
        await loadChannels();
    });

    hubConnection.on("ReceivePresentationFrame", (channelId, senderId, frameData) => {
        if (currentChannelId !== channelId) return;
        let grid = document.getElementById('PresentationStage');
        let preziCard = document.getElementById(`prezi-card-${senderId}`);

        if (!frameData) {
            if (preziCard) preziCard.remove();
        } else {
            if (!preziCard) {
                preziCard = document.createElement('div');
                preziCard.className = 'video-wrapper';
                preziCard.id = `prezi-card-${senderId}`;
                preziCard.style.flex = "1 1 30%";
                preziCard.style.margin = "15px";
                preziCard.innerHTML = `<img id="prezi-img-${senderId}" style="width:100%; height:100%; object-fit:contain;"><div class="video-label"></div>`;

                preziCard.onclick = function () {
                    document.querySelectorAll('.video-wrapper').forEach(el => { if (el !== preziCard) el.classList.remove('fullscreen'); });
                    preziCard.classList.toggle('fullscreen');
                };
                grid.appendChild(preziCard);
            }
            document.getElementById(`prezi-img-${senderId}`).src = frameData;
            let u = serverUsersCache.find(x => x.id === senderId);
            preziCard.querySelector('.video-label').innerText = `${u ? u.username : "Valaki"} képernyője`;
        }
    });

    hubConnection.on("IncomingCall", (callerId, targetId, type, callerName) => {
        if (type.includes('_room')) {
            let roomId = targetId;
            if (currentChannelId === roomId && callerId !== currentUserId) {
                activeCallTargetId = callerId;
                hubConnection.invoke("AnswerCall", currentUserId, callerId);
            }
        }
        else {
            if (targetId === currentUserId) {
                playSound('call');
                activeCallTargetId = callerId;
                isVideoCall = (type === 'video');
                showCallUI(`Hívás: ${callerName}`, true, true);
            }
        }
    });

    hubConnection.on("CallAnswered", async (targetId, callerId) => {
        if (callerId === currentUserId) {
            stopRingtone();
            document.getElementById('CallStatusText').innerText = "Vonalban";
            activeCallTargetId = targetId;
            setupPeerConnection();
            if (localCamStream && peerConnection)
                localCamStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localCamStream)
                });
        }
    });

    hubConnection.on("CallDeclined", (targetId, callerId) => {
        if (callerId === currentUserId || targetId === currentUserId) {
            stopRingtone();
            closeCallUI();
        }
    });

    hubConnection.on("CallEnded", (senderId, targetId) => {
        if (senderId === currentUserId || targetId === currentUserId) {
            stopRingtone();
            if (currentDMTargetId > 0) {
                closeCallUI();
            } else {
                document.getElementById('VideoGridContainer').innerHTML = '';
                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
            }
        }
    });

    let iceQueue = [];
    hubConnection.on("ReceiveWebRTCSignal", async (senderId, targetId, signalStr) => {
        if (targetId === currentUserId) {
            let signal = JSON.parse(signalStr); if (!peerConnection) setupPeerConnection();
            try {
                if (signal.sdp) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    if (signal.sdp.type === 'offer') {
                        if (localCamStream) localCamStream.getTracks().forEach(track => {
                            if (!peerConnection.getSenders().find(s => s.track === track))
                                peerConnection.addTrack(track, localCamStream);
                        });
                        let answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);
                        hubConnection.invoke("SendWebRTCSignal", currentUserId, activeCallTargetId, JSON.stringify({ sdp: peerConnection.localDescription }));
                    }
                    while (iceQueue.length > 0) { await peerConnection.addIceCandidate(iceQueue.shift()); }
                } else if (signal.ice) {
                    if (peerConnection.remoteDescription) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice));
                    } else {
                        iceQueue.push(new RTCIceCandidate(signal.ice));
                    }
                }
            } catch (e) { console.error("WebRTC Error", e); }
        }
    });

    hubConnection.onreconnected((connectionId) => {
        hubConnection.invoke("UserConnected", currentUserId);
    });

    hubConnection.start().then(() => {
        hubConnection.invoke("UserConnected", currentUserId);
    });
}

// =========================================
// REAKCIÓ RENDSZER (Üzenetekhez)
// =========================================
let currentReactionMsgId = null;

window.openReactionPicker = function(event, msgId) {
    currentReactionMsgId = msgId;
    let picker = document.getElementById('ReactionPicker');
    
    // Legeneráljuk az emojikat (ugyanazt a listát használja, mint a chat input)
    if (picker.innerHTML === '') {
        picker.innerHTML = naryanEmojis.map(e => 
            `<div class="emoji-item" onclick="sendReaction('${e}')">${e}</div>`
        ).join('');
    }

    // Pozicionálás pontosan az egérkattintás helyére!
    picker.style.top = (event.clientY - 100) + 'px'; // Kicsit feljebb toljuk
    picker.style.left = (event.clientX - 100) + 'px';
    picker.style.display = 'grid';
};

// --- 2. SEND REACTION JAVÍTÁS (signalr_client.js legalja) ---
window.sendReaction = function(emoji) {
    if (hubConnection && currentReactionMsgId) {
        let isDM = currentDMTargetId > 0; // Hozzáadjuk a flag-et a küldéshez is!
        hubConnection.invoke("AddReaction", currentReactionMsgId, currentUserId, emoji, isDM);
    }
    document.getElementById('ReactionPicker').style.display = 'none';
};

// Automatikus bezárás, ha máshova kattintasz
document.addEventListener('click', function(e) {
    let picker = document.getElementById('ReactionPicker');
    if (picker && picker.style.display === 'grid') {
        if (!picker.contains(e.target) && !e.target.closest('.btn-reaction')) {
            picker.style.display = 'none';
        }
    }
});