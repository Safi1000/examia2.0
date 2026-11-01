/**
 * "amelia.k" → "Amelia K". Usernames are typed lowercase; people aren't.
 * The bits added to make a username unique ("ahmed2", "ali.student") aren't
 * part of anyone's name, so they're left out.
 */
export function displayName(username: string): string {
  return username
    .replace(/[._-]student$/i, "")
    .replace(/(\D)\d+$/, "$1")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
