"use client";

import { supabase } from "@/lib/supabase";

/**
 * Phone notifications in the browser: what this device can do, and turning
 * them on (shared by Settings and the welcome flow). Sending lives in
 * lib/push-server.ts.
 */

export const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushStatus = "notReady" | "iphone" | "unsupported" | "blocked" | "off" | "on";
export type Device = "iphone" | "android" | "other";

export function device(): Device {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** Opened from the home-screen icon (needed for notifications on iPhone). */
export const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export async function pushStatus(): Promise<PushStatus> {
  if (!VAPID) return "notReady";
  if (device() === "iphone" && !installed()) return "iphone";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission and register this device. Throws if saving fails. */
export async function enablePush(): Promise<"on" | "blocked" | "off"> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  // Claims the device for this student (a phone shared by siblings moves over).
  const { error } = await supabase().rpc("claim_push_device", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
  return "on";
}
