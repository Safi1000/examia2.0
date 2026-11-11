import { guardMessage, messageName, studentHello } from "@/lib/outgoing-message";

/**
 * The WhatsApp message Hamza sends a new student with their login. Warm,
 * short, and only what they need for the first two minutes. Written in
 * Hamza's voice, lower case like a real text; only the username, password and
 * link are left exactly as they are.
 */
export function welcomeMessage({ username, password }: { username: string; password: string }) {
  const first = messageName(username);
  const text = [
    `assalamualaikum${first ? ` ${first}` : ""}, and welcome. really glad you're joining my classes.`,
    "",
    "your student portal is ready. your classes, tests, notes and results are all in one place there.",
    "",
    "*your login*",
    `username: ${username}`,
    `password: ${password}`,
    "sign in: www.hamzateaches.com/login",
    "",
    "*your first two minutes*",
    "sign in, then pick your avatar, your target grades and your weekly study goal.",
    "add the portal to your home screen so it opens like an app. on iphone: share, then add to home screen. on android: ⋮, then add to home screen.",
    "turn on notifications, so you get a reminder before class and the moment a result is out.",
    "",
    "*on class days*",
    "open home 5 minutes before class and tap the gold *join* button. that's all.",
    "",
    "you can change your password any time in settings. if sign in doesn't work, message me here.",
    "",
    "see you in class,",
    "Hamza",
  ].join("\n");
  return guardMessage(text, text, [username, password]);
}

/** Their username changed; the password didn't, so it isn't sent again. */
export function usernameMessage({ username }: { username: string; password?: string }) {
  const hi = studentHello(`${username}|username`, messageName(username));
  const text = [
    `${hi} i've changed your portal username.`,
    "",
    `your username is now: *${username}*`,
    "your password stays the same.",
    "sign in: www.hamzateaches.com/login",
    "",
    "if sign in doesn't work, message me here.",
  ].join("\n");
  return guardMessage(text, text, [username]);
}

/** Shorter message for a password reset. */
export function resetMessage({ username, password }: { username: string; password: string }) {
  const hi = studentHello(`${username}|reset`, messageName(username));
  const text = [
    `${hi} here's your new portal password.`,
    "",
    `username: ${username}`,
    `password: ${password}`,
    "sign in: www.hamzateaches.com/login",
    "",
    "you can change it any time in settings. if sign in doesn't work, message me here.",
  ].join("\n");
  return guardMessage(text, text, [username, password]);
}
