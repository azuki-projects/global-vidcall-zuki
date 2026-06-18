const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Global Video Call</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        :root {
            --bg-primary: #0a0a0a;
            --bg-secondary: #141414;
            --bg-card: #1f1f1f;
            --accent: #3b82f6;
            --accent-danger: #ef4444;
            --accent-warn: #f59e0b;
            --accent-success: #10b981;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }

        body {
            background-color: var(--bg-primary);
            color: var(--text-main);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        header {
            background-color: var(--bg-secondary);
            padding: 1rem;
            text-align: center;
            border-bottom: 1px solid #2d2d2d;
            font-weight: bold;
        }

        #error-banner {
            background: var(--accent-danger);
            color: white;
            text-align: center;
            padding: 10px;
            display: none;
            font-size: 0.9rem;
        }

        #video-grid {
            flex: 1;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1rem;
            padding: 1.5rem;
            align-content: center;
            justify-content: center;
            overflow-y: auto;
        }

        .video-container {
            position: relative;
            background-color: var(--bg-card);
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 16 / 9;
            border: 1px solid #333;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        video { width: 100%; height: 100%; object-fit: cover; }
        .mirrored { transform: scaleX(-1); }

        .status-overlay {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(20, 20, 20, 0.85);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2;
            transition: opacity 0.3s;
        }

        .cam-on .status-overlay { opacity: 0; pointer-events: none; }
        .force-show { opacity: 1 !important; }

        .peer-info {
            position: absolute;
            bottom: 1rem;
            left: 1rem;
            background: rgba(0, 0, 0, 0.7);
            padding: 0.4rem 0.8rem;
            border-radius: 20px;
            font-size: 0.85rem;
            z-index: 3;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: var(--text-muted);
        }
        .status-dot.connecting { background: var(--accent-warn); box-shadow: 0 0 8px var(--accent-warn); animation: pulse 1s infinite; }
        .status-dot.connected { background: var(--accent-success); box-shadow: 0 0 8px var(--accent-success); }
        .status-dot.failed { background: var(--accent-danger); }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        #controls {
            background-color: var(--bg-secondary);
            padding: 1rem;
            display: flex;
            justify-content: center;
            gap: 1rem;
            border-top: 1px solid #2d2d2d;
            flex-wrap: wrap;
        }

        button {
            background-color: var(--bg-card);
            border: 1px solid #444;
            color: white;
            padding: 0.75rem 1.25rem;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 500;
        }
        button:hover { background-color: #333; }
        button.active-off { background-color: var(--accent-danger); border-color: var(--accent-danger); }
    </style>
</head>
<body>

    <header>GLOBAL MESH CALL</header>
    <div id="error-banner"></div>

    <div id="video-grid">
        <div id="local-container" class="video-container cam-on">
            <div class="status-overlay" id="local-overlay">
                <span>Camera Off</span>
            </div>
            <div class="peer-info">
                <div class="status-dot connected"></div>
                You (<span id="device-type">Device</span>)
            </div>
            <video id="localVideo" class="mirrored" autoplay playsinline muted></video>
        </div>
    </div>

    <div id="controls">
        <button id="toggleMic" onclick="toggleMic()">🎤 Mic On</button>
        <button id="toggleCam" onclick="toggleCam()">📷 Cam On</button>
        <button id="switchCam" onclick="switchCamera()">🔄 Flip Camera</button>
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

        // Detect if mobile or desktop for UI labels
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        document.getElementById('device-type').innerText = isMobile ? 'Mobile' : 'Desktop';

        function showError(msg) {
            errorBanner.style.display = 'block';
            errorBanner.innerText = msg;
            console.error(msg);
        }

        async function init() {
            // CRITICAL CHECK: Ensure browser allows media devices
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showError('Camera API blocked! You MUST use HTTPS or localhost to access the camera on other devices.');
                document.getElementById('local-overlay').classList.add('force-show');
                document.getElementById('local-overlay').innerHTML = '<span>HTTPS Required</span>';
                return;
            }

            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: true
                });
                localVideo.srcObject = localStream;
                socket.emit('join-room');
            } catch (err) {
                showError('Camera access denied or device not found: ' + err.message);
            }
        }

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
            } catch (err) {
                console.error('Signal error:', err);
            }
        });

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

        function createPeerConnection(userId, isInitiator) {
            // Using public Google STUN servers to bypass basic NAT restrictions
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
            peers[userId] = pc;

            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            // Connection State Management UI
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
                    statusText.innerText = 'Connection Failed';
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', { to: userId, signal: { ice: event.candidate } });
                }
            };

            pc.ontrack = (event) => {
                let container = document.getElementById(\`container-\${userId}\`);
                if (!container) {
                    container = document.createElement('div');
                    container.id = \`container-\${userId}\`;
                    container.className = 'video-container cam-on';
                    container.innerHTML = \`
                        <div class="status-overlay" id="overlay-\${userId}">
                            <span>Awaiting Video...</span>
                        </div>
                        <div class="peer-info">
                            <div id="dot-\${userId}" class="status-dot connecting"></div>
                            Peer (<span id="status-text-\${userId}">Connecting...</span>)
                        </div>
                        <video autoplay playsinline></video>
                    \`;
                    videoGrid.appendChild(container);
                }
                container.querySelector('video').srcObject = event.streams[0];
            };

            if (isInitiator) {
                pc.onnegotiationneeded = async () => {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
                };
            }
        }

        function toggleMic() {
            if(!localStream) return;
            isMicOn = !isMicOn;
            localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
            const btn = document.getElementById('toggleMic');
            btn.className = isMicOn ? '' : 'active-off';
            btn.innerText = isMicOn ? '🎤 Mic On' : '🔇 Mic Off';
        }

        function toggleCam() {
            if(!localStream) return;
            isCamOn = !isCamOn;
            localStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
            
            const container = document.getElementById('local-container');
            isCamOn ? container.classList.add('cam-on') : container.classList.remove('cam-on');

            const btn = document.getElementById('toggleCam');
            btn.className = isCamOn ? '' : 'active-off';
            btn.innerText = isCamOn ? '📷 Cam On' : '🚫 Cam Off';

            socket.emit('cam-state-change', isCamOn);
        }

        async function switchCamera() {
            if (!localStream) return;
            
            // hardware check: check if multiple cameras actually exist
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            if (videoDevices.length < 2) {
                alert("Only one camera detected. Cannot flip.");
                return;
            }

            currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
            
            try {
                // Soft constraints: remove 'exact' so it doesn't crash if hardware is weird
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: isMicOn
                });

                const newVideoTrack = newStream.getVideoTracks()[0];
                const oldVideoTrack = localStream.getVideoTracks()[0];

                localStream.removeTrack(oldVideoTrack);
                oldVideoTrack.stop();
                localStream.addTrack(newVideoTrack);
                localVideo.srcObject = localStream;

                for (let userId in peers) {
                    const sender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) await sender.replaceTrack(newVideoTrack);
                }
                
                localVideo.className = (currentFacingMode === 'environment') ? '' : 'mirrored';

            } catch (err) {
                showError('Camera switch failed: ' + err.message);
            }
        }

        init();
    </script>
</body>
</html>
    `);
});

io.on('connection', (socket) => {
    socket.on('join-room', () => socket.broadcast.emit('user-connected', socket.id));
    socket.on('signal', ({ to, signal }) => io.to(to).emit('signal', { from: socket.id, signal }));
    socket.on('cam-state-change', (enabled) => socket.broadcast.emit('cam-state-change', { userId: socket.id, enabled }));
    socket.on('disconnect', () => io.emit('user-disconnected', socket.id));
});

server.listen(PORT, () => console.log(`Server live at http://localhost:${PORT}`));
