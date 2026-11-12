"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
// A browser that says it has no PDF viewer at all would show an empty box.
const hasPdfViewer = () => (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
const useViewer = () => useSyncExternalStore(noSubscribe, hasPdfViewer, () => true);

/**
 * The PDF preview, only where it shows. The page already leaves it out for
 * Android and in-app browsers (from the user agent); here a browser without a
 * PDF viewer drops it too.
 */
export function ReportPreview({ src, initialShow }: { src: string; initialShow: boolean }) {
  const viewer = useViewer();
  if (!initialShow || !viewer) return null;
  return <iframe src={src} title="Monthly report" className="mt-8 h-[70vh] w-full rounded-[20px] border border-hairline bg-surface" />;
}

/** "Open the report" in a new tab, only where the browser can show a PDF itself. The page leaves it out on Android. */
export function OpenReportLink({ href }: { href: string }) {
  const viewer = useViewer();
  if (!viewer) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex h-12 items-center justify-center rounded-full border border-hairline px-6 text-[16px] font-semibold text-ink transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      Open the report
    </a>
  );
}
