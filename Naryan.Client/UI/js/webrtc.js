// ==========================================
// HANGCSATORNA ÉS DIAVETÍTÉS
// ==========================================

async function startVoiceRoom() {
    activeCallTargetId = currentChannelId; isVideoCall = false;
    activeVoiceRoomId = currentChannelId; // Eltároljuk, hogy bent vagyunk
    document.getElementById('PresentationStage').innerHTML = '';
    hubConnection.invoke("JoinVoiceChannel", currentChannelId, currentUserId);
    try {
        localCamStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        isMicMuted = false;
        document.getElementById('BtnVoiceMic').classList.remove('muted');
        hubConnection.invoke("RequestCall", currentUserId, activeCallTargetId, 'audio_room', currentUsername);
    } catch (e) {
        isMicMuted = true; document.getElementById('BtnVoiceMic').classList.add('muted');
        hubConnection.invoke("RequestCall", currentUserId, activeCallTargetId, 'audio_room', currentUsername);
    }
}

function leaveVoiceRoom(navigateAway = true) {
    if (localCamStream) {
        localCamStream.getTracks().forEach(t => t.stop());
        localCamStream = null;
    }
    stopPresentation();
    if (hubConnection)
        hubConnection.invoke("LeaveVoiceChannel", currentUserId);

    activeVoiceRoomId = 0; // Nullázzuk az állapotot

    if (navigateAway)
        openMembersView(); // Csak akkor dobjon ki a kezdőlapra, ha direkt a piros gombot nyomtuk
}

function leaveVoiceRoomForPrivateCall() {
    if (hubConnection)
        hubConnection.invoke("LeaveVoiceChannel", currentUserId);

    stopPresentation();

    if (localCamStream) {
        localCamStream.getTracks().forEach(t => t.stop());
        localCamStream = null;
    }
    activeVoiceRoomId = 0; // Itt is nullázni kell!
}

function toggleAudio() {
    if (localCamStream && localCamStream.getAudioTracks().length > 0) {
        isMicMuted = !isMicMuted; localCamStream.getAudioTracks()[0].enabled = !isMicMuted;
        let m1 = document.getElementById('BtnMic');
        let m2 = document.getElementById('BtnVoiceMic');

        if (isMicMuted) {
            if (m1) m1.classList.add('muted');
            if (m2) m2.classList.add('muted');
        }
        else {
            if (m1) m1.classList.remove('muted');
            if (m2) m2.classList.remove('muted');
        }
    }
}

let preziInterval = null; let preziStream = null;
async function togglePresentation() {
    if (preziStream) {
        stopPresentation();
        return;
    }
    try {
        preziStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        document.getElementById('BtnVoicePrezi').style.color = "var(--accent)";
        document.getElementById('BtnVoicePrezi').style.borderColor = "var(--accent)";
        let video = document.createElement('video');
        video.srcObject = preziStream; video.play();
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        preziStream.getVideoTracks()[0].onended = stopPresentation;

        preziInterval = setInterval(() => {
            if (video.videoWidth === 0) return;
            let w = video.videoWidth; let h = video.videoHeight;
            if (w > 1280) { h = Math.floor(h * (1280 / w)); w = 1280; }
            canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
            let base64 = canvas.toDataURL('image/webp', 0.4);
            hubConnection.invoke("SendPresentationFrame", currentChannelId, currentUserId, base64);
        }, 1000 / myStreamFps);
    } catch (e) {
        showToast("Képernyőmegosztás megszakítva.", true);
    }
}

function stopPresentation() {
    if (preziStream) {
        preziStream.getTracks().forEach(t => t.stop());
        preziStream = null;
    }
    if (preziInterval) {
        clearInterval(preziInterval);
        preziInterval = null;
    }
    document.getElementById('BtnVoicePrezi').style.color = "";
    document.getElementById('BtnVoicePrezi').style.borderColor = "";
    if (hubConnection && currentChannelId > 0) {
        hubConnection.invoke("SendPresentationFrame", currentChannelId, currentUserId, "");
    }
}

// ==========================================
// PRIVÁT HÍVÁS ÉS KÖZÖS VIDEÓ GRID
// ==========================================
async function startCall(type) {
    if (currentDMTargetId === 0)
        return;

    // --- ÚJ: OFFLINE ELLENŐRZÉS ---
    // Megkeressük a hívni kívánt partnert a gyorsítótárban
    let targetUser = serverUsersCache.find(u => u.id === currentDMTargetId);
    // Ha megtaláltuk, de offline állapotban van, azonnal megszakítjuk a hívást!
    if (targetUser && !targetUser.isOnline) {
        showToast(`Sikertelen hívás: ${targetUser.username} jelenleg offline!`, true);

        // Ha van valami hiba hangod (pl. click.mp3 vagy error), azt is lejátszhatod itt:
        // playSound('click'); 

        return;
    }
    // ------------------------------

    leaveVoiceRoomForPrivateCall();

    isVideoCall = (type === 'video');
    activeCallTargetId = currentDMTargetId;
    playSound('call');
    showCallUI("Hívás indítása...", true, false);
    isInPrivateCall = true;
    try {
        localCamStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
        isCamOff = !isVideoCall;
        isMicMuted = false;
        if (isVideoCall)
            createLocalGridVideo(localCamStream, "Te (Kamera)");

        hubConnection.invoke("RequestCall", currentUserId, activeCallTargetId, type, currentUsername);
    } catch (e) {
        showToast("Kamera/Mikrofon hiba!", true);
        closeCallUI();
    }
}

async function answerCall() {
    stopRingtone();
    leaveVoiceRoomForPrivateCall();
    isInPrivateCall = true;
    try {
        localCamStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
    }
    catch (e) {
        if (isVideoCall) {
            try {
                isVideoCall = false; localCamStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                showToast("Kamera nem elérhető! Hanghívásra váltva.", true);
            } catch (e2) {
                declineCall();
                return;
            }
        }
        else {
            declineCall();
            return;
        }
    }
    isCamOff = !isVideoCall;
    isMicMuted = false;
    showCallUI("Vonalban", true, false);

    if (isVideoCall)
        createLocalGridVideo(localCamStream, "Te (Kamera)");

    hubConnection.invoke("AnswerCall", currentUserId, activeCallTargetId);
}

function showCallUI(status, showControls, isRecv) {
    switchAppView('CallOverlay');
    document.getElementById('CallStatusText').innerText = status;
    document.getElementById('ActiveCallBanner').style.display = 'none';

    document.getElementById('IncomingCallControls').style.display = isRecv ? 'flex' : 'none';
    document.getElementById('ActiveCallControls').style.display = showControls && !isRecv ? 'flex' : 'none';

    if (showControls && !isRecv) {
        if (!isCamOff)
            document.getElementById('BtnCam').classList.remove('muted');
        else
            document.getElementById('BtnCam').classList.add('muted');
        if (!isMicMuted)
            document.getElementById('BtnMic').classList.remove('muted');
        else
            document.getElementById('BtnMic').classList.add('muted');
    }
}

function closeCallUI() {
    stopRingtone(); isInPrivateCall = false;
    document.getElementById('ActiveCallBanner').style.display = 'none';
    document.getElementById('CallOverlay').style.display = 'none';
    document.getElementById('ChatRoomView').style.display = 'flex';

    if (localCamStream) {
        localCamStream.getTracks().forEach(t => t.stop());
        localCamStream = null;
    }
    if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
        localScreenStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    document.getElementById('VideoGridContainer').innerHTML = '';
    isMicMuted = false;
    isCamOff = true;
    isSharingScreen = false;
    activeCallTargetId = 0;
}

function declineCall() {
    stopRingtone();
    hubConnection.invoke("DeclineCall", currentUserId, activeCallTargetId); closeCallUI();
}
function endCall() {
    stopRingtone();
    hubConnection.invoke("EndCall", currentUserId, activeCallTargetId); closeCallUI();

    if (currentDMTargetId === 0) {
        leaveVoiceRoom();
    }
}

function toggleVideoCallAudio() {
    if (localCamStream && localCamStream.getAudioTracks().length > 0) {
        isMicMuted = !isMicMuted;
        localCamStream.getAudioTracks()[0].enabled = !isMicMuted;
        let m1 = document.getElementById('BtnMic');

        if (isMicMuted) {
            if (m1) m1.classList.add('muted');
        } else {
            if (m1) m1.classList.remove('muted');
        }
    }
}

function createRemoteVideo(stream) {
    let grid = document.getElementById('VideoGridContainer');
    if (document.getElementById(`remote-vid-${stream.id}`))
        return;

    let wrapper = document.createElement('div');
    wrapper.id = `remote-vid-${stream.id}`;

    let video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    wrapper.appendChild(video);

    let label = document.createElement('div');
    label.className = 'video-label';

    const updateVisibility = () => {
        let hasVid = stream.getVideoTracks().length > 0;
        if (hasVid) {
            wrapper.style.display = 'flex';
            wrapper.className = 'video-wrapper';
            label.innerText = "Partner";

            if (!wrapper.contains(label))
                wrapper.appendChild(label);

            wrapper.onclick = function () {
                document.querySelectorAll('.video-wrapper').forEach(el => {
                    if (el !== wrapper)
                        el.classList.remove('fullscreen');
                });
                wrapper.classList.toggle('fullscreen');
            };
        } else {
            wrapper.style.display = 'none';
            wrapper.className = '';
            wrapper.classList.remove('fullscreen');

            if (wrapper.contains(label))
                wrapper.removeChild(label);

            wrapper.onclick = null;
        }
    };

    updateVisibility();
    grid.appendChild(wrapper);
    document.getElementById('CallStatusText').innerText = "Vonalban";

    stream.onaddtrack = () => updateVisibility();

    stream.onremovetrack = () => {
        if (stream.getTracks().length === 0) {
            let el = document.getElementById(`remote-vid-${stream.id}`);
            if (el) el.remove();
        } else {
            updateVisibility();
        }
    };
}

function createLocalGridVideo(stream, labelText) {
    let boxId = labelText.includes('Képernyő') ? 'local-vid-screen' : 'local-vid-cam';
    let existingBox = document.getElementById(boxId);

    if (existingBox) {
        existingBox.querySelector('video').srcObject = stream;
        return;
    }

    let wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper'; wrapper.id = boxId;
    let video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;

    if (!labelText.includes('Képernyő'))
        video.style.transform = 'scaleX(-1)';

    let label = document.createElement('div');
    label.className = 'video-label'; label.innerText = labelText;

    wrapper.appendChild(video); wrapper.appendChild(label);
    document.getElementById('VideoGridContainer').appendChild(wrapper);

    wrapper.onclick = function () {
        document.querySelectorAll('.video-wrapper').forEach(el => {
            if (el !== wrapper) el.classList.remove('fullscreen');
        });
        wrapper.classList.toggle('fullscreen');
    };
}

function removeLocalGridVideo(isScreen) {
    let boxId = isScreen ? 'local-vid-screen' : 'local-vid-cam';
    let box = document.getElementById(boxId);

    if (box) {
        box.remove();
    }
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    peerConnection.ontrack = (event) => {
        createRemoteVideo(event.streams[0]);
    };
    peerConnection.onicecandidate = (event) => {
        if (event.candidate)
            hubConnection.invoke("SendWebRTCSignal", currentUserId, activeCallTargetId, JSON.stringify({ ice: event.candidate }));
    };
    peerConnection.onnegotiationneeded = async () => { try { let offer = await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer); hubConnection.invoke("SendWebRTCSignal", currentUserId, activeCallTargetId, JSON.stringify({ sdp: peerConnection.localDescription })); } catch (e) { } };
}

async function toggleVideo() {
    if (isCamOff) {
        try {
            if (!localCamStream)
                localCamStream = await navigator.mediaDevices.getUserMedia({ audio: !isMicMuted });

            let newStream = await navigator.mediaDevices.getUserMedia({ video: true });
            let newTrack = newStream.getVideoTracks()[0]; localCamStream.addTrack(newTrack);

            if (peerConnection)
                peerConnection.addTrack(newTrack, localCamStream);

            createLocalGridVideo(localCamStream, "Te (Kamera)"); isCamOff = false;
            document.getElementById('BtnCam').classList.remove('muted');
        } catch (e) { }
    } else {
        if (localCamStream && localCamStream.getVideoTracks().length > 0) {
            let track = localCamStream.getVideoTracks()[0];
            track.stop();
            localCamStream.removeTrack(track);

            if (peerConnection) {
                let sender = peerConnection.getSenders().find(s => s.track === track);
                if (sender) peerConnection.removeTrack(sender);
            }

            removeLocalGridVideo(false);
            isCamOff = true; document.getElementById('BtnCam').classList.add('muted');
        }
    }
}

let screenSender = null;
async function toggleScreenShare() {
    if (isSharingScreen) {
        if (localScreenStream)
            localScreenStream.getTracks().forEach(t => t.stop());

        if (peerConnection && screenSender) {
            peerConnection.removeTrack(screenSender); screenSender = null;
        }

        removeLocalGridVideo(true);
        isSharingScreen = false;
        document.getElementById('BtnScreen').classList.add('muted');
    } else {
        try {
            localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            localScreenStream.getVideoTracks()[0].onended = () => {
                if (isSharingScreen)
                    toggleScreenShare();
            };

            if (peerConnection) {
                localScreenStream.getTracks().forEach(track => {
                    screenSender = peerConnection.addTrack(track, localScreenStream);
                });
            }
            createLocalGridVideo(localScreenStream, "Te (Képernyő)");
            isSharingScreen = true;
            document.getElementById('BtnScreen').classList.remove('muted');
        } catch (e) { }
    }
}