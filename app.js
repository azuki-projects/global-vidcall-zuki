const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve the all-in-one UI
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
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

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
            padding: 1rem 2rem;
            text-align: center;
            border-bottom: 1px solid #2d2d2d;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        #video-grid {
            flex: 1;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            padding: 2rem;
            align-content: center;
            justify-content: center;
            max-width: 1400px;
            width: 100%;
            margin: 0 auto;
            overflow-y: auto;
        }

        .video-container {
            position: relative;
            background-color: var(--bg-card);
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 16 / 9;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            border: 1px solid #2d2d2d;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transform: scaleX(-1); /* Mirror effect for natural view */
        }
        
        /* Don't mirror the back camera or remote streams if preferred, but uniform here for simplicity */
        .remote-video {
            transform: none;
        }

        .video-placeholder {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: var(--bg-secondary);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2;
            transition: opacity 0.2s ease;
        }

        .video-placeholder svg {
            width: 64px;
            height: 64px;
            fill: var(--text-muted);
            background: #2a2a2a;
            padding: 15px;
            border-radius: 50%;
            margin-bottom: 0.5rem;
        }

        .video-container.cam-on .video-placeholder {
            opacity: 0;
            pointer-events: none;
        }

        .peer-label {
            position: absolute;
            bottom: 1rem;
            left: 1rem;
            background: rgba(0, 0, 0, 0.6);
            padding: 0.35rem 0.75rem;
            border-radius: 20px;
            font-size: 0.85rem;
            z-index: 3;
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        #controls {
            background-color: var(--bg-secondary);
            padding: 1.5rem;
            display: flex;
            justify-content: center;
            gap: 1rem;
            border-top: 1px solid #2d2d2d;
            z-index: 10;
        }

        button {
            background-color: var(--bg-card);
            border: 1px solid #333;
            color: var(--text-main);
            padding: 0.85rem 1.5rem;
            border-radius: 30px;
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        }

        button:hover {
            background-color: #2a2a2a;
            border-color: #444;
            transform: translateY(-1px);
        }

        button:active {
            transform: translateY(1px);
        }

        button.active-off {
            background-color: var(--accent-danger);
            border-color: var(--accent-danger);
            color: white;
        }
        
        button.active-off:hover {
            background-color: #dc2626;
        }
    </style>
</head>
<body>

    <header>GLOBAL REALTIME CALL</header>

    <div id="video-grid">
        <!-- Local User Video Container -->
        <div id="local-container" class="video-container cam-on">
            <div class="video-placeholder">
                <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5-4-8-4z"/></svg>
                <span>Camera Off</span>
            </div>
            <div class="peer-label">You</div>
            <video id="localVideo" autoplay playsinline muted></video>
        </div>
    </div>

    <div id="controls">
        <button id="toggleMic" onclick="toggleMic()">
            <span>🎤</span> Mic On
        </button>
        <button id="toggleCam" onclick="toggleCam()">
            <span>📷</span> Cam On
        </button>
        <button id="switchCam" onclick="switchCamera()">
            <span>🔄</span> Flip Camera
        </button>
    </div>

    <script>
        const socket = io();
        const videoGrid = document.getElementById('video-grid');
        const localVideo = document.getElementById('localVideo');
        const localContainer = document.getElementById('local-container');

        let localStream;
        let peers = {}; // Holds RTCPeerConnection instances indexed by socket ID
        let isCamOn = true;
        let isMicOn = true;
        let currentFacingMode = 'user'; // 'user' = front, 'environment' = back

        const rtcConfig = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        async function init() {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: true
                });
                localVideo.srcObject = localStream;
                
                // Let the server know we are ready to connect to others
                socket.emit('join-room');
            } catch (err) {
                console.error('Error accessing media devices:', err);
                alert('Please allow access to your camera and microphone.');
            }
        }

        // --- SIGNALLING PLATFORM HANDLING COLLISION ---
        socket.on('user-connected', async (userId) => {
            console.log('User connected:', userId);
            createPeerConnection(userId, true);
        });

        socket.on('signal', async ({ from, signal }) => {
            if (!peers[from]) {
                createPeerConnection(from, false);
            }
            
            const pc = peers[from];
            if (signal.sdp) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('signal', { to: from, signal: { sdp: pc.localDescription } });
                }
            } else if (signal.ice) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
                } catch (e) {
                    console.error('Error adding received ice candidate', e);
                }
            }
        });

        socket.on('user-disconnected', (userId) => {
            console.log('User disconnected:', userId);
            if (peers[userId]) {
                peers[userId].close();
                delete peers[userId];
            }
            const el = document.getElementById(\`container-\${userId}\`);
            if (el) el.remove();
        });

        // Remote user changed their camera state
        socket.on('cam-state-change', ({ userId, enabled }) => {
            const container = document.getElementById(\`container-\${userId}\`);
            if (container) {
                if (enabled) {
                    container.classList.add('cam-on');
                } else {
                    container.classList.remove('cam-on');
                }
            }
        });

        function createPeerConnection(userId, isInitiator) {
            const pc = new RTCPeerConnection(rtcConfig);
            peers[userId] = pc;

            // Add local tracks to track pipeline
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('signal', { to: userId, signal: { ice: event.candidate } });
                }
            };

            // Avoid collision by linking incoming tracks directly to predictable structural UI IDs
            pc.ontrack = (event) => {
                let container = document.getElementById(\`container-\${userId}\`);
                if (!container) {
                    container = document.createElement('div');
                    container.id = \`container-\${userId}\`;
                    container.className = 'video-container cam-on'; // defaults to on

                    container.innerHTML = \`
                        <div class="video-placeholder">
                            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5-4-8-4z"/></svg>
                            <span>Camera Off</span>
                        </div>
                        <div class="peer-label">Remote User</div>
                        <video class="remote-video" autoplay playsinline></video>
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
                    try {
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
                    } catch (err) {
                        console.error(err);
                    }
                };
            }
        }

        // --- HARDWARE FEATURE CONTROLS ---

        function toggleMic() {
            isMicOn = !isMicOn;
            localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
            
            const btn = document.getElementById('toggleMic');
            btn.className = isMicOn ? '' : 'active-off';
            btn.innerHTML = isMicOn ? '<span>🎤</span> Mic On' : '<span>🔇</span> Mic Off';
        }

        function toggleCam() {
            isCamOn = !isCamOn;
            localStream.getVideoTracks().forEach(track => track.enabled = isCamOn);
            
            // UI Handler: toggle local state representation
            if (isCamOn) {
                localContainer.classList.add('cam-on');
            } else {
                localContainer.classList.remove('cam-on');
            }

            const btn = document.getElementById('toggleCam');
            btn.className = isCamOn ? '' : 'active-off';
            btn.innerHTML = isCamOn ? '<span>📷</span> Cam On' : '<span>🚫</span> Cam Off';

            // Broadcast state to remote users so they hide our video slot element cleanly
            socket.emit('cam-state-change', isCamOn);
        }

        async function switchCamera() {
            if (!localStream) return;
            
            // Toggle orientation
            currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
            
            try {
                // Fetch fresh stream configuration constraints
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: currentFacingMode },
                    audio: isMicOn // preserve audio state
                });

                const newVideoTrack = newStream.getVideoTracks()[0];
                const oldVideoTrack = localStream.getVideoTracks()[0];

                // Replace track at structural source stream level
                localStream.removeTrack(oldVideoTrack);
                oldVideoTrack.stop();
                localStream.addTrack(newVideoTrack);
                localVideo.srcObject = localStream;

                // Seamlessly swap tracks for all active peer senders without breaking renegotiation
                for (let userId in peers) {
                    const senders = peers[userId].getSenders();
                    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                    if (videoSender) {
                        await videoSender.replaceTrack(newVideoTrack);
                    }
                }
                
                // Mirror layout optimization adjustments
                if(currentFacingMode === 'environment') {
                    localVideo.style.transform = "scaleX(1)";
                } else {
                    localVideo.style.transform = "scaleX(-1)";
                }

            } catch (err) {
                console.error('Failed to flip camera:', err);
                alert('Target camera system orientation unavailable.');
            }
        }

        // Launch Application Frame Loop Initialization
        init();
    </script>
</body>
</html>
    `);
});

// --- SERVER SIGNALLING ARCHITECTURE ---
io.on('connection', (socket) => {
    socket.on('join-room', () => {
        // Broadcast arrival to all other sockets inside mesh space
        socket.broadcast.emit('user-connected', socket.id);
    });

    socket.on('signal', ({ to, signal }) => {
        // Direct SDP/ICE message transfer execution
        io.to(to).emit('signal', {
            from: socket.id,
            signal: signal
        });
    });

    socket.on('cam-state-change', (enabled) => {
        socket.broadcast.emit('cam-state-change', {
            userId: socket.id,
            enabled: enabled
        });
    });

    socket.on('disconnect', () => {
        io.emit('user-disconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening live on http://localhost:${PORT}`);
});
