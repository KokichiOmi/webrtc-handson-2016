let localVideo = document.getElementById('local_video');
let remoteVideo = document.getElementById('remote_video');
let localStream = null;
let peerConnection = null;
let textForSendSdp = document.getElementById('text_for_send_sdp');
let textToReceiveSdp = document.getElementById('text_for_receive_sdp');

// 互換性対応
RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;

// getUserMediaでカメラ、マイクにアクセス
function startVideo() {
    navigator.mediaDevices.getUserMedia({video: true, audio: true})
        .then(function (stream) { // success
            playVideo(localVideo,stream);
            localStream = stream;
        }).catch(function (error) { // error
            console.error('mediaDevice.getUserMedia() error:', error);
        return;
    });
}

// Videoの再生を開始する
function playVideo(element, stream) {
    if ('srcObject' in element) {
        element.srcObject = stream;
    }
    else {
        element.src = window.URL.createObjectURL(stream);
    }
    element.play();
}

// WebRTCを利用する準備をする
function prepareNewConnection() {

    // RTCPeerConnectionを初期化する
    let pc_config = {"iceServers":[ {"urls":"stun:stun.skyway.io:3478"} ]};
    let peer = new RTCPeerConnection(pc_config);

    // リモートのストリームを受信した場合のイベントをセット
    if ('ontrack' in peer) {
        peer.ontrack = function(event) {
            console.log('-- peer.ontrack()');
            let stream = event.streams[0];
            playVideo(remoteVideo, stream);
        };
    }
    else {
        peer.onaddstream = function(event) {
            console.log('-- peer.onaddstream()');
            let stream = event.stream;
            playVideo(remoteVideo, stream);
        };
    }

    // ICE Candidateを収集したときのイベント
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log(evt.candidate);
        } else {
            console.log('empty ice event');
            sendSdp(peer.localDescription);
        }
    };

    // ICEのステータスが変更になったときの処理
    peer.oniceconnectionstatechange = function() {
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
        peer.addStream(localStream);
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
    textForSendSdp.focus();
    textForSendSdp.select();
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
    peerConnection.onnegotiationneeded = function(){
        peerConnection.createOffer()
            .then(function (sessionDescription) {
                console.log('createOffer() succsess in promise');
                return peerConnection.setLocalDescription(sessionDescription);
            }).then(function() {
                console.log('setLocalDescription() succsess in promise');
            }).catch(function(err) {
                console.error(err);
        });
    }
}

// Answer SDPを生成する
function makeAnswer() {
    console.log('sending Answer. Creating remote session description...' );
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.createAnswer()
        .then(function (sessionDescription) {
            console.log('createAnswer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(function() {
            console.log('setLocalDescription() succsess in promise');
        }).catch(function(err) {
            console.error(err);
    });
}

// SDPのタイプを判別しセットする
function onSdpText() {
    let text = textToReceiveSdp.value;
    if (peerConnection) {
        // Offerした側が相手からのAnserをセットする場合
        console.log('Received answer text...');
        let answer = new RTCSessionDescription({
            type : 'answer',
            sdp : text,
        });
        setAnswer(answer);
    }
    else {
        // Offerを受けた側が相手からのOfferをセットする場合
        console.log('Received offer text...');
        let offer = new RTCSessionDescription({
            type : 'offer',
            sdp : text,
        });
        setOffer(offer);
    }
    textToReceiveSdp.value ='';
}

// Offer側のSDPをセットした場合の処理
function setOffer(sessionDescription) {
    if (peerConnection) {
        console.error('peerConnection alreay exist!');
    }
    peerConnection = prepareNewConnection();
    peerConnection.onnegotiationneeded = function () {
        peerConnection.setRemoteDescription(sessionDescription)
            .then(function() {
                console.log('setRemoteDescription(offer) succsess in promise');
                makeAnswer();
            }).catch(function(err) {
                console.error('setRemoteDescription(offer) ERROR: ', err);
        });
    }
}

// Answer側のSDPをセットした場合の処理
function setAnswer(sessionDescription) {
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(answer) succsess in promise');
        }).catch(function(err) {
            console.error('setRemoteDescription(answer) ERROR: ', err);
    });
}

// P2P通信を切断する
function hangUp(){
    if (peerConnection) {
        if(peerConnection.iceConnectionState !== 'closed'){
            peerConnection.close();
            peerConnection = null;
            cleanupVideoElemet(remoteVideo);
            textForSendSdp.value = '';
            return;
        }
    }
    console.log('peerConnection is closed.');

}

// ビデオエレメントを初期化する
function cleanupVideoElemet(element) {
    element.pause();
    if ('srcObject' in element) {
        element.srcObject = null;
    }
    else {
        if (element.src && (element.src !== '') ) {
            window.URL.revokeObjectURL(element.src);
        }
        element.src = '';
    }
}
