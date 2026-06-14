"use client";

// Ephemeral ghost-presence over Firebase Realtime Database.
//
// While a visitor is in walk mode we publish their position to
// `presence/{uid}` a few times a second and mirror everyone else's positions
// back. `onDisconnect().remove()` guarantees a ghost vanishes the instant its
// tab closes or the network drops. Stale entries (no update for >10 s) are
// pruned client-side as a backstop.
//
// Purely visual co-presence: no interaction, no collision between ghosts, no
// chat. If presence is disabled (no databaseURL) every export no-ops.

import {
  ref,
  set,
  update,
  onDisconnect,
  onValue,
  remove,
  type Database,
} from "firebase/database";
import { ensureAnonAuth, getPresenceDb, presenceEnabled } from "./firebase";

export interface PresenceState {
  x: number;
  z: number;
  heading: number; // camera yaw in radians
  normieId: number; // avatar
  ts: number; // last update (ms epoch)
}

export interface RemotePresence extends PresenceState {
  id: string; // session uid
}

const STALE_MS = 10_000;

/** Mutable local walker pose, written every frame by WalkControls (no React
 *  re-render) and read on a throttle by the Ghosts publisher. `active` is true
 *  only while the visitor is in walk mode. */
export const localWalker = {
  x: 0,
  z: 0,
  heading: 0,
  active: false,
};

export interface PresenceHandle {
  /** Push the local walker state. Cheap; throttle at the call site. */
  publish: (s: Omit<PresenceState, "ts">) => void;
  /** Tear down: remove our node + detach listeners. */
  dispose: () => void;
}

/**
 * Joins the presence channel. Returns a handle to publish self-state, and
 * invokes `onPeers` whenever the set of OTHER walkers changes. Returns null
 * synchronously is impossible (auth is async), so we return a handle whose
 * publish() buffers until auth resolves.
 */
export function joinPresence(
  onPeers: (peers: RemotePresence[]) => void,
): PresenceHandle {
  if (!presenceEnabled()) {
    return { publish: () => {}, dispose: () => {} };
  }

  let uid: string | null = null;
  let db: Database | null = null;
  let disposed = false;
  let unsub: (() => void) | null = null;
  let pending: Omit<PresenceState, "ts"> | null = null;
  let pruneTimer: ReturnType<typeof setInterval> | null = null;
  let latestPeers: RemotePresence[] = [];

  ensureAnonAuth().then((id) => {
    if (disposed || !id) return;
    uid = id;
    db = getPresenceDb();
    if (!db) return;

    const selfRef = ref(db, `presence/${uid}`);
    // Auto-cleanup when the connection drops.
    onDisconnect(selfRef).remove();

    // Flush any state that was published before auth resolved.
    if (pending) {
      set(selfRef, { ...pending, ts: Date.now() }).catch(() => {});
      pending = null;
    }

    // Subscribe to the whole presence tree; emit everyone except self.
    const rootRef = ref(db, "presence");
    unsub = onValue(rootRef, (snap) => {
      const val = (snap.val() ?? {}) as Record<string, PresenceState>;
      const now = Date.now();
      const peers: RemotePresence[] = [];
      for (const [pid, p] of Object.entries(val)) {
        if (pid === uid) continue;
        if (!p || typeof p.x !== "number") continue;
        if (now - (p.ts ?? 0) > STALE_MS) continue;
        peers.push({ id: pid, ...p });
      }
      latestPeers = peers;
      onPeers(peers);
    });

    // Backstop prune: re-emit filtered peers on a timer so stale ghosts
    // disappear even if no new snapshot arrives.
    pruneTimer = setInterval(() => {
      const now = Date.now();
      const fresh = latestPeers.filter((p) => now - p.ts <= STALE_MS);
      if (fresh.length !== latestPeers.length) {
        latestPeers = fresh;
        onPeers(fresh);
      }
    }, 3000);
  });

  return {
    publish: (s) => {
      if (disposed) return;
      if (!uid || !db) {
        pending = s; // buffer until auth resolves
        return;
      }
      const selfRef = ref(db, `presence/${uid}`);
      update(selfRef, { ...s, ts: Date.now() }).catch(() => {});
    },
    dispose: () => {
      disposed = true;
      if (pruneTimer) clearInterval(pruneTimer);
      unsub?.();
      if (uid && db) {
        const selfRef = ref(db, `presence/${uid}`);
        remove(selfRef).catch(() => {});
      }
    },
  };
}
