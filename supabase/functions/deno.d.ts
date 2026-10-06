// Minimal stand-ins so an editor running the Node/Next TypeScript server can
// read these files. Deno supplies the real definitions at runtime, and the Deno
// extension (see .vscode/settings.json) supersedes this file when installed.
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: { get(key: string): string | undefined };
};

// Edge functions import straight from a URL, which bare TypeScript cannot
// resolve. Typing these as `any` is no worse than the unresolved import it
// replaces.
declare module "https://*";
