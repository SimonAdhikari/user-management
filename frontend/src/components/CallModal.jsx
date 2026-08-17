import { useState, useEffect, useRef } from 'react'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X } from 'lucide-react'
import { initiateCall, acceptCall, declineCall, endCall, onCallStateChange, getActiveCall, getLocalStream, toggleAudio, toggleVideo } from '../services/callService'
import { useAuth } from '../context/AuthContext'
import '../styles/CallModal.css'

export default function CallModal() {
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall] = useState(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [remoteStreams, setRemoteStreams] = useState({}) // peer_id -> stream
  const [error, setError] = useState(null)
  const { user } = useAuth()

  const localVideoRef = useRef(null)
  const remoteVideoRefs = useRef({})

  // Listen for call state changes
  useEffect(() => {
    return onCallStateChange((state) => {
      console.log('Call state changed:', state)
      if (state.type === 'initiated') {
        setActiveCall(state.call)
        setError(null)
      } else if (state.type === 'ended') {
        setActiveCall(null)
        setRemoteStreams({})
      } else if (state.type === 'remote-stream') {
        setRemoteStreams((prev) => ({ ...prev, [state.peer_id]: state.stream }))
      } else if (state.type === 'error') {
        setError(state.error)
      }
    })
  }, [])

  // Display local video stream
  useEffect(() => {
    const localStream = getLocalStream()
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }
  }, [activeCall])

  // Display remote video streams
  useEffect(() => {
    Object.entries(remoteStreams).forEach(([peerId, stream]) => {
      if (remoteVideoRefs.current[peerId]) {
        remoteVideoRefs.current[peerId].srcObject = stream
      }
    })
  }, [remoteStreams])

  // Simulate incoming call for testing (in real app, server would push this)
  const simulateIncomingCall = (callerId) => {
    setIncomingCall({
      call_id: `CALL_${Date.now()}`,
      from_user_id: callerId,
      call_type: 'audio',
    })
  }

  const handleAcceptCall = async () => {
    try {
      if (incomingCall) {
        await acceptCall(incomingCall.call_id)
        setIncomingCall(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeclineCall = async () => {
    try {
      if (incomingCall) {
        await declineCall(incomingCall.call_id)
        setIncomingCall(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEndCall = async () => {
    try {
      if (activeCall) {
        await endCall(activeCall.call_id)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleAudio = () => {
    toggleAudio(!audioEnabled)
    setAudioEnabled(!audioEnabled)
  }

  const handleToggleVideo = () => {
    toggleVideo(!videoEnabled)
    setVideoEnabled(!videoEnabled)
  }

  // Incoming call notification
  if (incomingCall) {
    return (
      <div className="call-notification">
        <div className="call-notification-content">
          <div className="call-notification-icon">
            <Phone size={32} />
          </div>
          <div>
            <h3>Incoming Call</h3>
            <p>{incomingCall.from_user_id}</p>
            <p className="call-type">{incomingCall.call_type}</p>
          </div>
          <div className="call-notification-actions">
            <button className="btn-accept" onClick={handleAcceptCall}>
              <Phone size={20} /> Accept
            </button>
            <button className="btn-decline" onClick={handleDeclineCall}>
              <PhoneOff size={20} /> Decline
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Active call interface
  if (activeCall) {
    const peerId = activeCall.peers[0] // For simplicity, show first peer
    return (
      <div className="call-modal">
        <div className="call-modal-header">
          <h3>{activeCall.callType} Call</h3>
          <span className="call-participants">{activeCall.peers.length} participant(s)</span>
        </div>

        <div className="call-video-container">
          {/* Remote video (large) */}
          {remoteStreams[peerId] ? (
            <video
              ref={(ref) => {
                remoteVideoRefs.current[peerId] = ref
              }}
              autoPlay
              playsInline
              className="remote-video"
            />
          ) : (
            <div className="video-placeholder">
              <div className="avatar large">{peerId?.[0].toUpperCase()}</div>
              <p>Waiting for {peerId}...</p>
            </div>
          )}

          {/* Local video (small PIP) */}
          {activeCall.callType === 'video' && (
            <video ref={localVideoRef} autoPlay playsInline muted className="local-video-pip" />
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="call-controls">
          <button
            className={`btn-control ${audioEnabled ? '' : 'disabled'}`}
            onClick={handleToggleAudio}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {activeCall.callType === 'video' && (
            <button
              className={`btn-control ${videoEnabled ? '' : 'disabled'}`}
              onClick={handleToggleVideo}
              title={videoEnabled ? 'Stop video' : 'Start video'}
            >
              {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
          )}

          <button className="btn-end-call" onClick={handleEndCall} title="End call">
            <PhoneOff size={20} /> End
          </button>
        </div>

        {/* Show other participants */}
        {activeCall.peers.length > 1 && (
          <div className="call-participants-list">
            <h4>Participants</h4>
            {activeCall.peers.map((peerId) => (
              <div key={peerId} className="participant-item">
                <div className="avatar small">{peerId[0].toUpperCase()}</div>
                <span>{peerId}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
