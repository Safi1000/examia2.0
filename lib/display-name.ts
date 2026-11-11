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

/**
 * The name a message to a student or parent uses: "amelia.k2" → "Amelia",
 * "ahmed_ali" → "Ahmed". No real name is stored, so it comes from the tidied
 * username. If the first part is a lone letter or nothing usable, the whole
 * tidied username is used instead ("k.amelia" → "K Amelia").
 */
export function firstName(username: string): string {
  const full = displayName(username);
  const first = full.split(" ")[0] ?? "";
  if (first.length >= 2 && /\p{L}/u.test(first)) return first;
  return full || username;
}

/**
 * Usernames Hamza keeps for trying the student side. Lower case. Add another
 * name here to treat that account the same way.
 */
const TEST_ACCOUNT_NAMES = new Set(["test"]);

/**
 * Hamza's own practice account. It signs in and works like any student and
 * stays in the roster, but it is never chased, counted, averaged or ranked:
 * reminders, Today, activity, analytics and the leaderboard all skip it.
 * Matches the username or the name the roster shows ("test", "Test", "test2").
 */
export function isTestAccount(student: { username?: string | null } | null | undefined): boolean {
  const u = (student?.username ?? "").trim();
  if (!u) return false;
  return TEST_ACCOUNT_NAMES.has(u.toLowerCase()) || TEST_ACCOUNT_NAMES.has(displayName(u).toLowerCase());
}
