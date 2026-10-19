"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { META_PIXEL_ID } from "@/lib/config";
import { isPublicPath } from "@/lib/public-paths";

/**
 * Meta (Facebook) pixel.
 *
 * `beforeInteractive` puts the snippet in the server-rendered <head>, which is
 * where Meta's instructions say it goes and where their verifier looks for it.
 * Only the tiny inline stub is blocking; fbevents.js is fetched async, and the
 * stub queues calls until it lands so the first PageView is never lost.
 *
 * App Router navigations do not reload the document, so the snippet's own
 * PageView fires once per full load; the effect below covers every route change
 * after that.
 *
 * Public pages only. The portal, admin and parent report pages never load it:
 * their URLs carry private ids and report tokens that must not reach Meta.
 *
 * Consent: visitors whose clock is on a European time zone (UK and EU, plus a
 * few neighbours, which is the safe side) only get the pixel after they accept
 * the cookie banner (CookieBanner.tsx); everyone else gets it straight away.
 * No <noscript> image, so nothing is sent without that check.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // The inline snippet already counted this one.
      return;
    }
    if (isPublicPath(pathname)) window.fbq?.("track", "PageView");
  }, [pathname]);

  if (!META_PIXEL_ID || !isPublicPath(pathname)) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="beforeInteractive">
        {`(function(){
var tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
var choice=null;try{choice=localStorage.getItem('ht-cookies');}catch(e){}
window.__htNeedsConsent=tz.indexOf('Europe')===0||/^Atlantic.(Reykjavik|Canary|Madeira|Azores|Faroe)/.test(tz);
window.__htLoadPixel=function(){
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');
};
if(!window.__htNeedsConsent||choice==='yes')window.__htLoadPixel();
})();`}
      </Script>
    </>
  );
}
