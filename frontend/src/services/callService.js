import { api } from './api'

// Global state for active calls
let activeCall = null
let localStream = null
let peerConnections = {} // peer_id -> RTCPeerConnection
const signalPollers = {} // call_id -> timer_id

// ICE servers configuration
const ICE_SERVERS = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302'] },
    { urls: ['stun:stun1.l.google.com:19302'] },
  ],
}

/**
 * Call state listeners: set of functions called when call state changes
 */
const callListeners = new Set()

export function onCallStateChange(listener) {
  callListeners.add(listener)
  return () => callListeners.delete(listener)
}

function notifyCallStateChange(state) {
  callListeners.forEach((fn) => fn(state))
}

/**
 * Get current active call info
 */
export function getActiveCall() {
  return activeCall
}

/**
 * Initiate a new call to one or more peers
 */
export async function initiateCall(peerIds, callType = 'audio') {
  try {
    // Request call from backend
    const response = await api.post('/calls/initiate', {
      peer_ids: Array.isArray(peerIds) ? peerIds : [peerIds],
      call_type: callType,
    })

    const { call_id, peers } = response.data

    // Get local media stream
    const constraints = {
      audio: true,
      video: callType === 'video' ? { width: 640, height: 480 } : false,
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      throw new Error(`Cannot access ${callType} device: ${err.message}`)
    }

    // Set up peer connections
    for (const peerId of peers) {
      const pc = new RTCPeerConnection(ICE_SERVERS)
      peerConnections[peerId] = pc

      // Add local stream tracks
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          api.post(`/calls/${call_id}/signal`, {
            call_id,
            from_user_id: 'self', // Will be set by backend from auth token
            to_user_id: peerId,
            message_type: 'ice-candidate',
            payload: event.candidate.toJSON(),
          }).catch(console.error)
        }
      }

      // Log ICE connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`Connection to ${peerId}: ${pc.connectionState}`)
      }
    }

    // Set active call and start polling for signals
    activeCall = { call_id, peers, initiator: true, callType, localStream }
    notifyCallStateChange({ type: 'initiated', call: activeCall })

    // Start polling for signals
    startSignalPolling(call_id)

    // Create and send offers
    for (const peerId of peers) {
      const pc = peerConnections[peerId]
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await api.post(`/calls/${call_id}/signal`, {
        call_id,
        from_user_id: 'self',
        to_user_id: peerId,
        message_type: 'offer',
        payload: offer,
      })
    }

    return { call_id, peers }
  } catch (err) {
    console.error('Call initiation failed:', err)
    notifyCallStateChange({ type: 'error', error: err.message })
    throw err
  }
}

/**
 * Accept an incoming call
 */
export async function acceptCall(callId) {
  try {
    await api.post(`/calls/${callId}/respond`, { action: 'accept' })
    notifyCallStateChange({ type: 'accepted', call_id: callId })
  } catch (err) {
    console.error('Failed to accept call:', err)
    throw err
  }
}

/**
 * Decline an incoming call
 */
export async function declineCall(callId) {
  try {
    await api.post(`/calls/${callId}/respond`, { action: 'decline' })
    notifyCallStateChange({ type: 'declined', call_id: callId })
  } catch (err) {
    console.error('Failed to decline call:', err)
    throw err
  }
}

/**
 * End current call
 */
export async function endCall(callId) {
  try {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      localStream = null
    }

    Object.values(peerConnections).forEach((pc) => pc.close())
    peerConnections = {}

    stopSignalPolling(callId)

    if (callId) {
      await api.post(`/calls/${callId}/end`)
    }

    activeCall = null
    notifyCallStateChange({ type: 'ended' })
  } catch (err) {
    console.error('Error ending call:', err)
  }
}

/**
 * Start polling for incoming signals in a call
 */
function startSignalPolling(callId) {
  stopSignalPolling(callId)
  const pollerId = setInterval(async () => {
    try {
      const response = await api.get(`/calls/${callId}/signals`)
      const { signals } = response.data

      for (const signal of signals) {
        handleSignal(callId, signal)
      }
    } catch (err) {
      console.error('Error polling signals:', err)
    }
  }, 1000) // Poll every 1 second

  signalPollers[callId] = pollerId
}

/**
 * Stop polling for signals
 */
function stopSignalPolling(callId) {
  if (signalPollers[callId]) {
    clearInterval(signalPollers[callId])
    delete signalPollers[callId]
  }
}

/**
 * Handle incoming signal (offer, answer, ICE candidate)
 */
async function handleSignal(callId, signal) {
  try {
    const { from: fromUserId, type: messageType, payload } = signal

    if (!peerConnections[fromUserId]) {
      // Create new peer connection if not exists
      const pc = new RTCPeerConnection(ICE_SERVERS)
      peerConnections[fromUserId] = pc

      if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          api.post(`/calls/${callId}/signal`, {
            call_id: callId,
            from_user_id: 'self',
            to_user_id: fromUserId,
            message_type: 'ice-candidate',
            payload: event.candidate.toJSON(),
          }).catch(console.error)
        }
      }

      pc.ontrack = (event) => {
        notifyCallStateChange({ type: 'remote-stream', peer_id: fromUserId, stream: event.streams[0] })
      }
    }

    const pc = peerConnections[fromUserId]

    if (messageType === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await api.post(`/calls/${callId}/signal`, {
        call_id: callId,
        from_user_id: 'self',
        to_user_id: fromUserId,
        message_type: 'answer',
        payload: answer,
      })
    } else if (messageType === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(payload))
    } else if (messageType === 'ice-candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload))
      } catch (err) {
        console.error('Error adding ICE candidate:', err)
      }
    }
  } catch (err) {
    console.error('Error handling signal:', err, signal)
  }
}

/**
 * Get local video stream element
 */
export function getLocalStream() {
  return localStream
}

/**
 * Get remote stream for a peer
 */
export function getPeerConnection(peerId) {
  return peerConnections[peerId]
}

/**
 * Mute/unmute audio
 */
export function toggleAudio(enabled) {
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled
    })
  }
}

/**
 * Show/hide video
 */
export function toggleVideo(enabled) {
  if (localStream) {
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled
    })
  }
}
