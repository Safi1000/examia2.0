/**
 * Public marketing routes. They touch no localStorage, so they skip the
 * hydration gate and render in the server HTML, which is what search engines
 * and link previews read. Keep in sync with app/sitemap.ts.
 */
const PUBLIC_PREFIXES = ["/blog", "/guides", "/tools", "/privacy", "/terms", "/board-lab"];
export function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
