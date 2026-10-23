/**
 * A smaller copy of a Cloudinary image for thumbnails and previews: resized
 * on Cloudinary's side, auto quality and format (WebP/AVIF where the phone
 * supports it). A 2000px answer photo at thumbnail size drops from ~500 KB to
 * ~30 KB. Other URLs pass through untouched.
 *
 * Never use this where annotations are drawn on top: those are positioned in
 * the original photo's pixels.
 */
export function cld(url: string, width: number): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) return url;
  const t = `w_${width},c_limit,q_auto,f_auto`;
  // PDF pages (pg_N) keep their page step first.
  if (/\/upload\/pg_\d+\//.test(url)) return url.replace(/(\/upload\/pg_\d+)\//, `$1/${t}/`);
  return url.replace("/upload/", `/upload/${t}/`);
}
