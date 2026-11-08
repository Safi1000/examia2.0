"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { GA_ID } from "@/lib/config";
import { isPublicPath } from "@/lib/public-paths";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __htLoadGa?: () => void;
  }
}

/**
 * Google Analytics 4, public pages only (same rule as the Meta pixel: portal,
 * admin and parent report URLs carry private ids and never load it).
 *
 * Loads after the page is interactive so it never slows the first paint.
 * Consent follows the Meta pixel: European time zones wait for "yes" in the
 * cookie banner (CookieBanner.tsx calls window.__htLoadGa), everyone else gets
 * it straight away. Route changes are counted by GA4's own history tracking.
 *
 * Every tap on a WhatsApp link anywhere on a public page is sent as a
 * `whatsapp_click` event with the page it came from, which is how the monthly
 * report answers "which pages bring students".
 *
 * Never inside the phone app (see MetaPixel.tsx): the app collects no analytics.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const on = !!GA_ID && isPublicPath(pathname);

  useEffect(() => {
    if (!on) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !/wa\.me|whatsapp\.com/.test(a.href)) return;
      window.gtag?.("event", "whatsapp_click", {
        page_path: window.location.pathname,
        link_text: (a.textContent || "").trim().slice(0, 60),
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [on]);

  if (!on) return null;

  return (
    <Script id="ga4" strategy="afterInteractive">
      {`(function(){
if(document.documentElement.dataset.app==='1'||navigator.userAgent.indexOf('HamzaTeachesApp/')>-1){window.__htLoadGa=function(){};return;}
var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
var choice=null;try{choice=localStorage.getItem('ht-cookies');}catch(e){}
var needs=tz.indexOf('Europe')===0||/^Atlantic.(Reykjavik|Canary|Madeira|Azores|Faroe)/.test(tz);
window.dataLayer=window.dataLayer||[];
window.gtag=function(){dataLayer.push(arguments);};
window.__htLoadGa=function(){
if(window.__htGaLoaded)return;window.__htGaLoaded=1;
var s=document.createElement('script');s.async=1;s.src='https://www.googletagmanager.com/gtag/js?id=${GA_ID}';document.head.appendChild(s);
gtag('js',new Date());gtag('config','${GA_ID}');
};
if(!needs||choice==='yes')window.__htLoadGa();
})();`}
    </Script>
  );
}
