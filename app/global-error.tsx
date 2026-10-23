"use client";

/**
 * Last-resort screen when the whole app fails to draw. It replaces the root
 * layout, so the site's styles and fonts aren't loaded here: plain inline
 * styles in the portal's colours keep it calm instead of a blank page.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "0 24px",
          textAlign: "center",
          background: "#1a1d20",
          color: "#f2f0eb",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <title>Something went wrong</title>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Something went wrong.</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#b9b6ae" }}>Check your internet, then try again.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{ height: 44, padding: "0 22px", borderRadius: 999, border: 0, background: "#FBC159", color: "#1a1d20", fontWeight: 600, fontSize: 14 }}
          >
            Try again
          </button>
          {/* A full page load on purpose: the app's own navigation is what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 22px", borderRadius: 999, border: "1px solid #4a4f55", color: "#f2f0eb", fontWeight: 600, fontSize: 14, textDecoration: "none" }}
          >
            Home
          </a>
        </div>
      </body>
    </html>
  );
}
