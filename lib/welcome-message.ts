import { displayName } from "@/lib/display-name";

/**
 * The WhatsApp message Hamza sends a new student with their login. Warm,
 * short, and only what they need for the first two minutes. Written in
 * Hamza's voice (first person, contractions, one clear next step).
 */
export function welcomeMessage({ username, password }: { username: string; password: string }) {
  const first = displayName(username).split(" ")[0];
  return [
    `Assalam o Alaikum ${first}, welcome to Hamza Teaches.`,
    "",
    "Your student portal is ready. Your classes, tests, notes and results all live here, in one place.",
    "",
    "*Your login*",
    `Username: ${username}`,
    `Password: ${password}`,
    "Sign in: www.hamzateaches.com/login",
    "",
    "*Your first two minutes*",
    "1. Sign in, then pick your avatar, your target grades and your weekly study goal.",
    "2. Add the portal to your home screen so it opens like an app. iPhone: Share, then Add to Home Screen. Android: ⋮, then Add to Home screen.",
    "3. Turn on notifications, so you get a nudge before class and the moment a result is out.",
    "",
    "*On class days*",
    "Open Home 5 minutes before class and tap the gold *Join* button. That's it.",
    "",
    "You can change your password anytime in Settings. Stuck on anything? Message me here.",
    "",
    "See you in class,",
    "Hamza",
  ].join("\n");
}

/** Shorter message for a password reset. */
export function resetMessage({ username, password }: { username: string; password: string }) {
  const first = displayName(username).split(" ")[0];
  return [
    `Hi ${first}, here's your new portal password.`,
    "",
    `Username: ${username}`,
    `Password: ${password}`,
    "Sign in: www.hamzateaches.com/login",
    "",
    "You can change it anytime in Settings.",
  ].join("\n");
}
