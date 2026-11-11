import { guardMessage, messageName, studentHello } from "@/lib/outgoing-message";

/**
 * The WhatsApp message Hamza sends a new student with their login. Warm,
 * short, and only what they need for the first two minutes. Written in
 * Hamza's voice (first person, contractions, one clear next step).
 */
export function welcomeMessage({ username, password }: { username: string; password: string }) {
  const first = messageName(username);
  const text = [
    `Assalamualaikum${first ? ` ${first}` : ""}, and welcome. I'm really glad you're joining my classes.`,
    "",
    "Your student portal is ready. Your classes, tests, notes and results are all in one place there.",
    "",
    "*Your login*",
    `Username: ${username}`,
    `Password: ${password}`,
    "Sign in: www.hamzateaches.com/login",
    "",
    "*Your first two minutes*",
    "Sign in, then pick your avatar, your target grades and your weekly study goal.",
    "Add the portal to your home screen so it opens like an app. On iPhone: Share, then Add to Home Screen. On Android: ⋮, then Add to Home screen.",
    "Turn on notifications, so you get a reminder before class and hear from me the moment a result is out.",
    "",
    "*On class days*",
    "Open Home 5 minutes before class and tap the gold *Join* button. That's all.",
    "",
    "You can change your password any time in Settings. If anything is unclear or you get stuck, message me here. I'd much rather you ask than struggle on your own.",
    "",
    "See you in class,",
    "Hamza",
  ].join("\n");
  return guardMessage(text, text, [username, password]);
}

/** Their username changed; the password didn't, so it isn't sent again. */
export function usernameMessage({ username }: { username: string; password?: string }) {
  const hi = studentHello(`${username}|username`, messageName(username));
  const text = [
    `${hi} I've changed your portal username.`,
    "",
    `Your username is now: *${username}*`,
    "Your password stays the same.",
    "Sign in: www.hamzateaches.com/login",
    "",
    "If it doesn't let you in, message me and I'll sort it out.",
  ].join("\n");
  return guardMessage(text, text, [username]);
}

/** Shorter message for a password reset. */
export function resetMessage({ username, password }: { username: string; password: string }) {
  const hi = studentHello(`${username}|reset`, messageName(username));
  const text = [
    `${hi} here's your new portal password.`,
    "",
    `Username: ${username}`,
    `Password: ${password}`,
    "Sign in: www.hamzateaches.com/login",
    "",
    "You can change it any time in Settings. If you have any trouble signing in, message me.",
  ].join("\n");
  return guardMessage(text, text, [username, password]);
}
