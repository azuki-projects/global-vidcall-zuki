const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Render sets the PORT dynamically. Default to 3000 for local fallback.
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Global Mesh Call</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --bg-primary: #050505;
            --bg-card: #141414;
            --accent-danger: #ef4444;
            --accent-warn: #f59e0b;
            --accent-success: #10b981;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }

        body {
            background-color: var(--bg-primary);
            color: var(--text-main);
            height: 100vh;
            width: 100vw;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }

        #error-banner {
            background: var(--accent-danger);
            color: white;
            text-align: center;
            padding: 12px;
            display: none;
            font-size: 0.9rem;
            z-index: 1000;
        }

        #video-grid {
            flex: 1;
            display: grid;
            /* Auto-fit layout prevents collision by dynamically scaling squares */
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1rem;
            padding: 1rem;
            padding-bottom: 100px; /* Space for hovering buttons */
            align-content: center;
            justify-content: center;
            overflow-y: auto;
            width: 100%;
            height: 100%;
        }

        .video-container {
            position: relative;
            background-color: var(--bg-card);
            border-radius: 16px;
            overflow: hidden;
            aspect-ratio: 4 / 3; /* Better ratio for mobile grids */
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #2a2a2a;
        }

        video { width: 100%; height: 100%; object-fit: cover; }
        .mirrored { transform: scaleX(-1); }

        .status-overlay {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(10, 10, 10, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2;
            transition: opacity 0.3s;
            font-weight: 500;
        }

        .cam-on .status-overlay { opacity: 0; pointer-events: none; }

        .peer-info {
            position: absolute;
            bottom: 12px;
            left: 12px;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            z-index: 3;
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--text-muted);
        }
        .status-dot.connecting { background: var(--accent-warn); animation: pulse 1s infinite; }
        .status-dot.connected { background: var(--accent-success); }
        .status-dot.failed { background: var(--accent-danger); }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        /* Mobile-Friendly Hovering Controls */
        #floating-controls {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30, 30, 30, 0.75);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            padding: 12px 24px;
            border-radius: 50px;
            display: flex;
            gap: 20px;
            z-index: 100;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .control-btn {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: none;
            background: rgba(255,255,255,0.1);
            color: white;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .control-btn:active { transform: scale(0.9); }
        .control-btn.active-off { background: var(--accent-danger); color: white; }

        @media (max-width: 600px) {
            #floating-controls { width: 85%; max-width: 350px; justify-content: space-between; bottom: 20px; padding: 12px 20px; }
            .control-btn { width: 48px; height: 48px; }
            .video-container { aspect-ratio: 3 / 4; } /* Taller blocks for mobile */
        }
    </style>
</head>
<body>

    <div id="error-banner"></div>

    <div id="video-grid">
        <div id="local-container" class="video-container cam-on">
            <div class="status-overlay" id="local-overlay">
                <span>📷 Camera Off</span>
            </div>
            <div class="peer-info">
                <div class="status-dot connected"></div>
                You (<span id="device-type">Device</span>)
            </div>
            <video id="localVideo" class="mirrored" autoplay playsinline muted></video>
        </div>
    </div>

    <div id="floating-controls">
        <button id="toggleMicBtn" class="control-btn" onclick="toggleMic()" title="Toggle Microphone">🎤</button>
        <button id="toggleCamBtn" class="control-btn" onclick="toggleCam()" title="Toggle Camera">📷</button>
        <button id="switchCamBtn" class="control-btn" onclick="switchCamera()" title="Flip Camera">🔄</button>
    </div>

    <script>
        const socket = io();
        const videoGrid = document.getElementById('video-grid');
        const localVideo = document.getElementById('localVideo');
        const errorBanner = document.getElementById('error-banner');
        
        let localStream;
        let peers = {}; 
        let isCamOn = true;
        let isMicOn = true;
        let currentFacingMode = 'user';

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        document.getElementById('device-type').innerText = isMobile ? 'Mobile' : 'Desktop';

        // WebRTC Configuration with TURN servers for NAT firewall traversal (Mobile Networks)
        const rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
                { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
                { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
            ]
        };

        function showError(msg) {
            errorBanner.style.display = 'block';
            errorBanner.innerText = msg;
            setTimeout(() => { errorBanner.style.display = 'none'; }, 8000);
        }

        async function init() {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: true
                });
                localVideo.srcObject = localStream;
                socket.emit('join-room');
            } catch (err) {
                showError('Media Access Error: ' + err.message);
                document.getElementById('local-overlay').innerHTML = '<span>Permission Denied</span>';
            }
        }

        // Signaling logic
        socket.on('user-connected', (userId) => createPeerConnection(userId, true));

        socket.on('signal', async ({ from, signal }) => {
            if (!peers[from]) createPeerConnection(from, false);
            
            const pc = peers[from];
            try {
                if (signal.sdp) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                    if (signal.sdp.type === 'offer') {
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socket.emit('signal', { to: from, signal: { sdp: pc.localDescription } });
                    }
                } else if (signal.ice) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
                }
            } catch (err) { console.error('Signaling processing error:', err); }
        });

        // Anti-collision: Clean destruction of the exact UI node mapped to the departing user
        socket.on('user-disconnected', (userId) => {
            if (peers[userId]) { peers[userId].close(); delete peers[userId]; }
            const el = document.getElementById(\`container-\${userId}\`);
            if (el) el.remove();
        });

        socket.on('cam-state-change', ({ userId, enabled }) => {
            const container = document.getElementById(\`container-\${userId}\`);
            if (container) {
                enabled ? container.classList.add('cam-on') : container.classList.remove('cam-on');
            }
        });

        // Anti-collision Peer Engine
        function createPeerConnection(userId, isInitiator) {
            const pc = new RTCPeerConnection(rtcConfig);
            peers[userId] = pc;

            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            pc.oniceconnectionstatechange = () => {
                const dot = document.getElementById(\`dot-\${userId}\`);
                const statusText = document.getElementById(\`status-text-\${userId}\`);
                if (!dot || !statusText) return;

                if (pc.iceConnectionState === 'checking') {
                    dot.className = 'status-dot connecting';
                    statusText.innerText = 'Connecting...';
                } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    dot.className = 'status-dot connected';
                    statusText.innerText = 'Connected';
                    document.getElementById(\`overlay-\${userId}\`).style.opacity = '0';
                } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                    dot.className = 'status-dot failed';
                    statusText.innerText = 'Disconnected';
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', { to: userId, signal: { ice: event.candidate } });
                }
            };

            // Strict rendering map to isolate streams and prevent layout collision
            pc.ontrack = (event) => {
                let container = document.getElementById(\`container-\${userId}\`);
                if (!container) {
                    container = document.createElement('div');
                    container.id = \`container-\${userId}\`;
                    container.className = 'video-container cam-on';
                    container.innerHTML = \`
                        <div class="status-overlay" id="overlay-\${userId}">
                            <span>Receiving...</span>
                        </div>
                        <div class="peer-info">
                            <div id="dot-\${userId}" class="status-dot connecting"></div>
                            <span id="status-text-\${userId}">Connecting...</span>
                        </div>
                        <video autoplay playsinline></video>
                    \`;
                    videoGrid.appendChild(container);
                }
                const remoteVideo = container.querySelector('video');
                if (remoteVideo.srcObject !== event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                }
            };

            if (isInitiator) {
                pc.onnegotiationneeded = async () => {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
                };
            }
        }

        // --- Hardware Controls ---

        function toggleMic() {
            if(!localStream) return;
            isMicOn = !isMicOn;
            localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
            
            const btn = document.getElementById('toggleMicBtn');
            btn.className = isMicOn ? 'control-btn' : 'control-btn active-off';
            btn.innerText = isMicOn ? '🎤' : '🔇';
        }

        function toggleCam() {
            if(!localStream) return;
            isCamOn = !isCamOn;
            localStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
            
            const container = document.getElementById('local-container');
            isCamOn ? container.classList.add('cam-on') : container.classList.remove('cam-on');

            const btn = document.getElementById('toggleCamBtn');
            btn.className = isCamOn ? 'control-btn' : 'control-btn active-off';
            
            socket.emit('cam-state-change', isCamOn);
        }

        async function switchCamera() {
            if (!localStream) return;
            
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices.filter(d => d.kind === 'videoinput');
                
                if (videoDevices.length < 2) {
                    showError("No secondary camera detected on this device.");
                    return;
                }

                currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
                
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: isMicOn // Keep current audio state
                });

                const newVideoTrack = newStream.getVideoTracks()[0];
                const oldVideoTrack = localStream.getVideoTracks()[0];

                localStream.removeTrack(oldVideoTrack);
                oldVideoTrack.stop();
                localStream.addTrack(newVideoTrack);
                localVideo.srcObject = localStream;

                // Anti-collision: Use replaceTrack to swap the stream pipeline seamlessly without breaking the connection layout
                for (let userId in peers) {
                    const sender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) await sender.replaceTrack(newVideoTrack);
                }
                
                localVideo.className = (currentFacingMode === 'environment') ? '' : 'mirrored';

            } catch (err) {
                showError('Hardware error flipping camera.');
            }
        }

        // Start 
        init();
    </script>
</body>
</html>
    `);
});

// Server Signaling
io.on('connection', (socket) => {
    socket.on('join-room', () => socket.broadcast.emit('user-connected', socket.id));
    socket.on('signal', ({ to, signal }) => io.to(to).emit('signal', { from: socket.id, signal }));
    socket.on('cam-state-change', (enabled) => socket.broadcast.emit('cam-state-change', { userId: socket.id, enabled }));
    socket.on('disconnect', () => io.emit('user-disconnected', socket.id));
});

server.listen(PORT, () => console.log(`Production Server listening on port ${PORT}`));
