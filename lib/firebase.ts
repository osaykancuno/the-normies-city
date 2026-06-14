"use client";

// Firebase client for the main app — used only for lightweight ephemeral
// presence (ghost walkers). Reuses the existing `the-normies-tagbattle`
// project. The config below is a PUBLIC client config (already exposed in the
// /tag-battle bundle), so it's safe to ship; security is enforced by the RTDB
// rules (database.rules.json), not by hiding the config.
//
// Presence is OFF until a databaseURL is provided (env
// NEXT_PUBLIC_FIREBASE_DATABASE_URL). Until then every helper here no-ops, so
// walk mode stays a safe single-player experience and the live app is never
// affected.

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import { getDatabase, type Database } from "firebase/database";

const FIREBASE_CONFIG = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyBlUOFnCFVFdtM11HdxSGAdPvgLdtlXOaQ",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "the-normies-tagbattle.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "the-normies-tagbattle",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "631300514470",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:631300514470:web:edbf5e15c9b3cfc59b0a67",
  // The RTDB URL is the one piece that must be set after enabling Realtime
  // Database in the Firebase console. No default — its absence is the
  // feature flag that keeps presence disabled.
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "",
};

/** True when presence can run — i.e. a Realtime Database URL is configured. */
export function presenceEnabled(): boolean {
  return Boolean(FIREBASE_CONFIG.databaseURL);
}

let app: FirebaseApp | null = null;
let db: Database | null = null;
let authInstance: Auth | null = null;
let signInPromise: Promise<string | null> | null = null;

function ensureApp(): FirebaseApp | null {
  if (!presenceEnabled()) return null;
  if (app) return app;
  app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  return app;
}

/** Returns the RTDB instance, or null if presence is disabled. */
export function getPresenceDb(): Database | null {
  if (db) return db;
  const a = ensureApp();
  if (!a) return null;
  db = getDatabase(a);
  return db;
}

/** Anonymous sign-in (idempotent). Resolves to the uid, or null on failure /
 *  when presence is disabled. Anonymous Auth must be enabled in the console. */
export function ensureAnonAuth(): Promise<string | null> {
  if (!presenceEnabled()) return Promise.resolve(null);
  if (signInPromise) return signInPromise;
  const a = ensureApp();
  if (!a) return Promise.resolve(null);
  authInstance = getAuth(a);
  if (authInstance.currentUser) {
    return Promise.resolve(authInstance.currentUser.uid);
  }
  signInPromise = signInAnonymously(authInstance)
    .then((cred) => cred.user.uid)
    .catch((err) => {
      console.warn("[presence] anonymous auth failed:", err?.message ?? err);
      signInPromise = null;
      return null;
    });
  return signInPromise;
}
