"use client";

// Proximity voice chat for walk mode — a push-to-talk "walkie-talkie" between
// Normies who meet in the street.
//
// Transport: WebRTC peer-to-peer MESH. Audio flows directly browser↔browser
// (never through a server, so it's private and free). Signalling (the SDP +
// ICE handshake) rides the Firebase Realtime Database we already use for ghost
// presence, under a `voice/{uid}/inbox` mailbox. There is no media server.
//
// Privacy: nothing happens until the visitor explicitly enables voice (which
// triggers the one mic-permission prompt). The mic track exists but stays
// DISABLED until they hold the push-to-talk key, so you're muted by default.
//
// Scaling: a mesh is right for small proximity groups (you only connect to the
// handful of Normies near you). Some restrictive NATs need a TURN relay to
// connect; only STUN is configured here, so add a TURN server later if remote
// users can't hear each other. Everything no-ops when presence is disabled.

import {
  ref,
  push,
  set,
  remove,
  onChildAdded,
  onDisconnect,
  type Database,
} from "firebase/database";
import { ensureAnonAuth, getPresenceDb, presenceEnabled } from "./firebase";

// STUN finds your public address; TURN relays media when a direct path is
// impossible (symmetric NATs, strict corporate/mobile networks). Without a TURN
// server, two users on different restrictive networks often can't connect at
// all — so we include the well-known free OpenRelay TURN servers as a fallback.
// Swap these for a dedicated TURN service if reliability matters at scale.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const TALK_THRESHOLD = 0.012; // RMS above which a remote peer counts as "talking"

// Spatial audio falloff (world units).
const REF_DISTANCE = 12; // full volume within this
const MAX_DISTANCE = 110; // inaudible past this

/** Non-reactive set of peer uids currently speaking, for the 3D layer (Ghosts)
 *  to show a "speaking" indicator above the right avatar without prop drilling. */
export const talkingRegistry = { ids: new Set<string>() };

export interface VoiceState {
  enabled: boolean;
  transmitting: boolean;
  /** True when the visitor has muted everyone else (output mute). */
  outputMuted: boolean;
  /** Peer uids with a live audio connection. */
  connected: string[];
  /** Peer uids currently speaking (remote audio above threshold). */
  talking: string[];
}

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser?: AnalyserNode;
  data?: Uint8Array<ArrayBuffer>;
  src?: MediaStreamAudioSourceNode;
  panner?: PannerNode;
  polite: boolean; // true when we are NOT the offer initiator
}

type Listener = (s: VoiceState) => void;

class VoiceManager {
  private db: Database | null = null;
  private uid: string | null = null;
  private stream: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private nearby = new Set<string>();
  private listeners = new Set<Listener>();
  private inboxUnsub: (() => void) | null = null;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = false;
  private transmitting = false;
  private outputMuted = false;
  private talking: string[] = [];
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  onState(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  private snapshot(): VoiceState {
    return {
      enabled: this.enabled,
      transmitting: this.transmitting,
      outputMuted: this.outputMuted,
      connected: [...this.peers.keys()],
      talking: this.talking,
    };
  }

  /** Lazily build the WebAudio graph: panners → masterGain → speakers. */
  private ensureAudio(): boolean {
    if (this.audioCtx && this.masterGain) return true;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.outputMuted ? 0 : 1;
      this.masterGain.connect(this.audioCtx.destination);
      return true;
    } catch {
      this.audioCtx = null;
      this.masterGain = null;
      return false;
    }
  }

  private emit() {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }

  /** Turn voice on: request the mic (one-time prompt) and open the mailbox. */
  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    if (!presenceEnabled()) return false;
    try {
      const uid = await ensureAnonAuth();
      if (!uid) return false;
      this.uid = uid;
      this.db = getPresenceDb();
      if (!this.db) return false;

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      // Start muted — push-to-talk unmutes.
      for (const t of this.stream.getAudioTracks()) t.enabled = false;

      // Fresh mailbox; auto-clean on disconnect.
      const selfRef = ref(this.db, `voice/${uid}`);
      await remove(selfRef).catch(() => {});
      onDisconnect(selfRef).remove();

      const inbox = ref(this.db, `voice/${uid}/inbox`);
      this.inboxUnsub = onChildAdded(inbox, (snap) => {
        const msg = snap.val();
        remove(snap.ref).catch(() => {});
        if (msg) this.onSignal(msg).catch(() => {});
      });

      // Build + resume the audio graph now (V is a user gesture, so autoplay
      // is allowed). A suspended context would otherwise produce silence.
      this.ensureAudio();
      await this.audioCtx?.resume().catch(() => {});

      this.enabled = true;
      this.startMeter();
      this.emit();
      // Connect to anyone already in range.
      this.reconcile();
      return true;
    } catch (err) {
      console.warn("[voice] enable failed:", (err as Error)?.message ?? err);
      this.cleanup();
      return false;
    }
  }

  /** Turn voice off and tear everything down. */
  disable() {
    if (!this.enabled && this.peers.size === 0) return;
    this.cleanup();
    this.emit();
  }

  private cleanup() {
    this.enabled = false;
    this.transmitting = false;
    this.talking = [];
    talkingRegistry.ids = new Set();
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    for (const [, p] of this.peers) this.closePeer(p);
    this.peers.clear();
    this.nearby.clear();
    this.inboxUnsub?.();
    this.inboxUnsub = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.db && this.uid) {
      remove(ref(this.db, `voice/${this.uid}`)).catch(() => {});
    }
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        /* ignore */
      }
      this.masterGain = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  /** Hold-to-talk: unmute (true) or mute (false) the local mic. */
  setTransmitting(on: boolean) {
    if (!this.enabled || !this.stream) return;
    if (this.transmitting === on) return;
    this.transmitting = on;
    for (const t of this.stream.getAudioTracks()) t.enabled = on;
    this.emit();
  }

  /** Manual mute of everyone else (you stay connected, just don't hear them). */
  setOutputMuted(on: boolean) {
    this.outputMuted = on;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(on ? 0 : 1, this.audioCtx.currentTime, 0.02);
    }
    // Fallback for any peer whose spatial graph didn't build (plain <audio>).
    for (const [, p] of this.peers) {
      if (!p.panner) p.audio.muted = on;
    }
    this.emit();
  }

  /**
   * Position the listener (you) and each connected peer in 3D so voices pan by
   * direction and fade with distance. Called on a throttle by VoiceController.
   * `heading` is the camera yaw (radians) as written by WalkControls.
   */
  updateSpatial(
    self: { x: number; z: number; heading: number },
    positions: Map<string, { x: number; z: number }>,
  ) {
    const ctx = this.audioCtx;
    if (!ctx) return;
    const fx = Math.sin(self.heading);
    const fz = Math.cos(self.heading);
    const L = ctx.listener as AudioListener & {
      positionX?: AudioParam;
      forwardX?: AudioParam;
      upX?: AudioParam;
    };
    if (L.positionX) {
      L.positionX.value = self.x;
      L.positionY!.value = 0;
      L.positionZ!.value = self.z;
      L.forwardX!.value = fx;
      L.forwardY!.value = 0;
      L.forwardZ!.value = fz;
      L.upX!.value = 0;
      L.upY!.value = 1;
      L.upZ!.value = 0;
    } else {
      L.setPosition?.(self.x, 0, self.z);
      L.setOrientation?.(fx, 0, fz, 0, 1, 0);
    }
    for (const [id, p] of this.peers) {
      if (!p.panner) continue;
      const pos = positions.get(id);
      if (!pos) continue;
      const pan = p.panner as PannerNode & { positionX?: AudioParam };
      if (pan.positionX) {
        pan.positionX.value = pos.x;
        pan.positionY!.value = 0;
        pan.positionZ!.value = pos.z;
      } else {
        pan.setPosition?.(pos.x, 0, pos.z);
      }
    }
  }

  /** Update the set of in-range peer uids; opens/closes connections to match. */
  setNearby(ids: string[]) {
    this.nearby = new Set(ids);
    if (this.enabled) this.reconcile();
  }

  private reconcile() {
    if (!this.uid) return;
    // Open connections to newly in-range peers.
    for (const id of this.nearby) {
      if (id === this.uid) continue;
      if (!this.peers.has(id)) this.connect(id);
    }
    // Drop connections to peers that walked out of range.
    for (const id of [...this.peers.keys()]) {
      if (!this.nearby.has(id)) {
        const p = this.peers.get(id);
        if (p) this.closePeer(p);
        this.peers.delete(id);
      }
    }
    this.emit();
  }

  // --- WebRTC plumbing -----------------------------------------------------

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // We are the polite peer (answerer) when our uid is the larger one.
    const polite = this.uid! > id;

    if (this.stream) {
      for (const t of this.stream.getAudioTracks()) pc.addTrack(t, this.stream);
    }

    const audio = document.createElement("audio");
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    audio.style.display = "none";
    document.body.appendChild(audio);

    const peer: Peer = { pc, audio, polite };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendTo(id, { kind: "ice", candidate: JSON.stringify(e.candidate.toJSON()) });
      }
    };
    pc.ontrack = (e) => {
      const [remote] = e.streams;
      if (remote) {
        audio.srcObject = remote;
        // Some browsers won't pull a remote WebRTC stream into WebAudio unless
        // it's also bound to a media element — keep it, but mute it when the
        // spatial graph drives the sound so we don't double-play.
        audio.play().catch(() => {});
        this.attachAudio(peer, remote);
      }
    };
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        // Drop; reconcile will re-open if still in range.
        if (this.peers.get(id) === peer) {
          this.closePeer(peer);
          this.peers.delete(id);
          if (this.nearby.has(id) && pc.connectionState === "failed") this.connect(id);
          this.emit();
        }
      }
    };

    this.peers.set(id, peer);
    return peer;
  }

  /** Initiate a connection (we send the offer when we're the impolite peer). */
  private async connect(id: string) {
    if (!this.uid) return;
    const peer = this.peers.get(id) ?? this.createPeer(id);
    // Only the impolite (smaller-uid) side makes the first offer; the other
    // waits for it. Avoids glare.
    if (peer.polite) return;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendTo(id, { kind: "offer", sdp: offer.sdp ?? "" });
    } catch (err) {
      console.warn("[voice] offer failed:", (err as Error)?.message ?? err);
    }
  }

  private async onSignal(msg: {
    from?: string;
    kind?: string;
    sdp?: string;
    candidate?: string;
  }) {
    const from = msg.from;
    if (!from || !this.uid || !this.enabled) return;
    // Ignore peers that aren't in range (with a small grace: still answer so a
    // peer that just saw us can connect).
    const peer = this.peers.get(from) ?? this.createPeer(from);

    try {
      if (msg.kind === "offer" && msg.sdp) {
        await peer.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendTo(from, { kind: "answer", sdp: answer.sdp ?? "" });
      } else if (msg.kind === "answer" && msg.sdp) {
        if (peer.pc.signalingState !== "stable") {
          await peer.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
        }
      } else if (msg.kind === "ice" && msg.candidate) {
        const cand = JSON.parse(msg.candidate) as RTCIceCandidateInit;
        await peer.pc.addIceCandidate(cand).catch(() => {});
      }
    } catch (err) {
      console.warn("[voice] signal error:", (err as Error)?.message ?? err);
    }
  }

  private sendTo(id: string, payload: Record<string, unknown>) {
    if (!this.db || !this.uid) return;
    const inbox = ref(this.db, `voice/${id}/inbox`);
    set(push(inbox), { from: this.uid, ts: Date.now(), ...payload }).catch(() => {});
  }

  private closePeer(p: Peer) {
    try {
      p.pc.onicecandidate = null;
      p.pc.ontrack = null;
      p.pc.onconnectionstatechange = null;
      p.pc.close();
    } catch {
      /* ignore */
    }
    try {
      p.src?.disconnect();
      p.panner?.disconnect();
      p.analyser?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      p.audio.srcObject = null;
      p.audio.remove();
    } catch {
      /* ignore */
    }
  }

  // --- Remote audio graph: spatial panner + talking meter ------------------

  private attachAudio(peer: Peer, stream: MediaStream) {
    if (!this.ensureAudio() || !this.audioCtx || !this.masterGain) return;
    try {
      const ctx = this.audioCtx;
      const src = ctx.createMediaStreamSource(stream);

      // Talking meter (a side branch, not routed to the speakers).
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      peer.analyser = analyser;
      peer.data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      // Spatial panner: pans by direction, fades with distance.
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = REF_DISTANCE;
      panner.maxDistance = MAX_DISTANCE;
      panner.rolloffFactor = 1.3;
      src.connect(panner);
      panner.connect(this.masterGain);
      peer.src = src;
      peer.panner = panner;

      // Spatial graph owns the sound now — mute the element to avoid doubling.
      peer.audio.muted = true;
    } catch {
      // Spatial graph failed — fall back to plain stereo via the element.
      peer.audio.muted = this.outputMuted;
    }
  }

  private startMeter() {
    if (this.meterTimer) return;
    this.meterTimer = setInterval(() => {
      if (this.peers.size === 0) return;
      const talking: string[] = [];
      for (const [id, p] of this.peers) {
        if (!p.analyser || !p.data) continue;
        p.analyser.getByteTimeDomainData(p.data);
        let sum = 0;
        for (let i = 0; i < p.data.length; i++) {
          const v = (p.data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / p.data.length);
        if (rms > TALK_THRESHOLD) talking.push(id);
      }
      const changed =
        talking.length !== this.talking.length ||
        talking.some((t) => !this.talking.includes(t));
      if (changed) {
        this.talking = talking;
        talkingRegistry.ids = new Set(talking);
        this.emit();
      }
    }, 200);
  }
}

// Singleton — one mic, one mailbox per tab.
let _vm: VoiceManager | null = null;
export function getVoiceManager(): VoiceManager {
  if (!_vm) _vm = new VoiceManager();
  return _vm;
}
