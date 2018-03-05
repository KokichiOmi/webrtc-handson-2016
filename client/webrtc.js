const localVideo = document.getElementById('local_video');
const remoteVideo = document.getElementById('remote_video');
const textForSendSdp = document.getElementById('text_for_send_sdp');
const textToReceiveSdp = document.getElementById('text_for_receive_sdp');
let localStream = null;
let peerConnection = null;

// シグナリングサーバへ接続する
const wsUrl = 'ws://localhost:3001/';
const ws = new WebSocket(wsUrl);
ws.onopen = (evt) => {
    console.log('ws open()');
};
ws.onerror = (err) => {
    console.error('ws onerror() ERR:', err);
};
ws.onmessage = (evt) => {
    console.log('ws onmessage() data:', evt.data);
    const message = JSON.parse(evt.data);
    if (message.type === 'offer') {
        // offer 受信時
        console.log('Received offer ...');
        textToReceiveSdp.value = message.sdp;
        setOffer(message);
    }
    else if (message.type === 'answer') {
        // answer 受信時
        console.log('Received answer ...');
        textToReceiveSdp.value = message.sdp;
        setAnswer(message);
    }
    else if (message.type === 'candidate') {
        // ICE candidate 受信時
        console.log('Received ICE candidate ...');
        const candidate = new RTCIceCandidate(message.ice);
        console.log(candidate);
        addIceCandidate(candidate);
    }
    else if (message.type === 'close') {
        // closeメッセージ受信時
        console.log('peer is closed ...');
        hangUp();
    }
};

// ICE candaidate受信時にセットする
function addIceCandidate(candidate) {
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// ICE candidate生成時に送信する
function sendIceCandidate(candidate) {
    console.log('---sending ICE candidate ---');
    const message = JSON.stringify({ type: 'candidate', ice: candidate });
    console.log('sending candidate=' + message);
    ws.send(message);
}

// getUserMediaでカメラ、マイクにアクセス
async function startVideo() {
    try{
        localStream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        playVideo(localVideo,localStream);
    } catch(err){
        console.error('mediaDevice.getUserMedia() error:', err);
    }
}

// Videoの再生を開始する
function playVideo(element, stream) {
    element.srcObject = stream;
    var playPromise = element.play();
    if (playPromise !== undefined) {
      playPromise.then(_ => {
        // Automatic playback started!
      })
      .catch(error => {
        // Auto-play was prevented
      });
    };
}

// WebRTCを利用する準備をする
function prepareNewConnection() {
    // RTCPeerConnectionを初期化する
    const pc_config = {"iceServers":[ {"urls":"stun:stun.skyway.io:3478"} ]};
    const peer = new RTCPeerConnection(pc_config);

    // リモートのストリームを受信した場合のイベントをセット
    peer.ontrack = evt => {
        console.log('-- peer.ontrack()');
        playVideo(remoteVideo, event.streams[0]);
    };

    // ICE Candidateを収集したときのイベント
    peer.onicecandidate = evt => {
        if (evt.candidate) {
            console.log(evt.candidate);
            sendIceCandidate(evt.candidate);
        } else {
            console.log('empty ice event');
            // sendSdp(peer.localDescription);
        }
    };

    // ICEのステータスが変更になったときの処理
    peer.oniceconnectionstatechange = () => {
        console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
        switch (peer.iceConnectionState) {
            case 'closed':
            case 'failed':
                // ICEのステートが切断状態または異常状態になったら切断処理を実行する
                if (peerConnection) {
                    hangUp();
                }
                break;
            case 'dissconnected':
                break;
        }
    };

    // ローカルのストリームを利用できるように準備する
    if (localStream) {
        console.log('Adding local stream...');
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }
    else {
        console.warn('no local stream, but continue.');
    }

    return peer;
}

// 手動シグナリングのための処理を追加する
function sendSdp(sessionDescription) {
    console.log('---sending sdp ---');
    textForSendSdp.value = sessionDescription.sdp;
    /*---
     textForSendSdp.focus();
     textForSendSdp.select();
     ----*/
    const message = JSON.stringify(sessionDescription);
    console.log('sending SDP=' + message);
    ws.send(message);
}

// Connectボタンが押されたら処理を開始
function connect() {
    if (! peerConnection) {
        console.log('make Offer');
        makeOffer();
    }
    else {
        console.warn('peer already exist.');
    }
}

// Offer SDPを生成する
function makeOffer() {
    peerConnection = prepareNewConnection();
    try {
        peerConnection.onnegotiationneeded = async () => {
            const offer = await peerConnection.createOffer();
            console.log('createOffer() succsess in promise');
            await peerConnection.setLocalDescription(offer);
            console.log('setLocalDescription() succsess in promise');
            sendSdp(peerConnection.localDescription);
        }
    } catch(err){
        console.error(err);
    }
}

// Answer SDPを生成する
async function makeAnswer() {
    console.log('sending Answer. Creating remote session description...' );
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    try{
        await peerConnection.setLocalDescription(await peerConnection.createAnswer());
        console.log('createAnswer() succsess in promise');
        console.log('setLocalDescription() succsess in promise');
        sendSdp(peerConnection.localDescription);
    } catch(err){
        console.error(err);
    }
}

// SDPのタイプを判別しセットする
function onSdpText() {
    const text = textToReceiveSdp.value;
    if (peerConnection) {
        // Offerした側が相手からのAnserをセットする場合
        console.log('Received answer text...');
        setAnswer(text);
    }
    else {
        // Offerを受けた側が相手からのOfferをセットする場合
        console.log('Received offer text...');
        setOffer(text);
    }
    textToReceiveSdp.value ='';
}

// Offer側のSDPをセットした場合の処理
function setOffer(sessionDescription) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection();   
    peerConnection.onnegotiationneeded = async () => {
        try {
            await peerConnection.setRemoteDescription(sessionDescription);
            console.log('setRemoteDescription(answer) succsess in promise');
            makeAnswer();
        } catch(err){
            console.error('setRemoteDescription ERROR: ', err);
        }
    }
}

// Answer側のSDPをセットした場合の処理
async function setAnswer(sessionDescription) {
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    try{
        await peerConnection.setRemoteDescription(sessionDescription);
        console.log('setRemoteDescription(answer) succsess in promise');
    } catch(err){
        console.error('setRemoteDescription(answer) ERROR: ', err);
    }
}

// P2P通信を切断する
function hangUp(){
    if (peerConnection) {
        if(peerConnection.iceConnectionState !== 'closed'){
            peerConnection.close();
            peerConnection = null;
            const message = JSON.stringify({ type: 'close' });
            console.log('sending close message');
            ws.send(message);
            cleanupVideoElement(remoteVideo);
            textForSendSdp.value = '';
            textToReceiveSdp.value = '';
            return;
        }
    }
    console.log('peerConnection is closed.');
}

// ビデオエレメントを初期化する
function cleanupVideoElement(element) {
    element.pause();
    element.srcObject = null;
}
