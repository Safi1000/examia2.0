/**
 * Single source of truth for brand surfacing.
 * Swap COMPANY_NAME and the slug derives automatically; it appears on the
 * login hero, the admin header, and the export filename.
 */
export const COMPANY_NAME = "Meridian Academy";

export const COMPANY_SLUG = COMPANY_NAME.toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

/** Persistent build credit shown on every screen. */
export const BUILD_CREDIT = "Developed by Techxserve";
