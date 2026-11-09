"use client";

import { useEffect } from "react";

/**
 * Links the install manifest only while a signed-in student or the teacher is
 * in the portal, so Chrome offers "Install app" to them and never to public
 * visitors. The manifest lives at /manifest.webmanifest (same address as
 * before, so copies already installed keep getting updates).
 */
export function PortalManifest({ on }: { on: boolean }) {
  useEffect(() => {
    if (!on) return;
    if (document.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/manifest.webmanifest";
    document.head.appendChild(link);
    return () => link.remove();
  }, [on]);
  return null;
}
