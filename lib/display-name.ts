/** "amelia.k" → "Amelia K". Usernames are typed lowercase; people aren't. */
export function displayName(username: string): string {
  return username
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
