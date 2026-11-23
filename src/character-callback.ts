import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server, type ServerResponse } from "node:http";

import { CharacterLinkError, type CharacterLinks } from "./character-links.js";

const styles = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; min-height: 100svh; padding: 1.5rem;
    display: grid; place-items: center; color: #e8dfce;
    background: radial-gradient(ellipse at top, #382a20, #101316 70%);
    font: 1rem/1.7 system-ui, sans-serif;
  }
  main {
    width: min(100%, 36rem); padding: clamp(1.5rem, 5vw, 3rem);
    border: 1px solid #806138; border-top: 3px solid #cba35b;
    border-radius: .5rem; background: #1c1b19;
    box-shadow: 0 1.5rem 5rem #0008, inset 0 0 2rem #cba35b08;
  }
  .brand { margin: 0; color: #d7b574; font: bold 1.5rem Georgia, serif; }
  .eyebrow {
    margin: .5rem 0 1.75rem; color: #c1b5a3;
    font-size: .75rem; letter-spacing: .12em; text-transform: uppercase;
  }
  h1 { margin: 0 0 1rem; color: #f2cf89; font: bold clamp(1.8rem, 6vw, 2.5rem)/1.2 Georgia, serif; }
  .message { overflow-wrap: anywhere; }
  ol { padding-left: 1.5rem; }
  li { margin: .5rem 0; }
  code { padding: .1rem .4rem; border: 1px solid #655139; border-radius: .2rem; color: #f2cf89; }
  footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #4c4031; color: #c1b5a3; font-size: .85rem; }
`;
const styleHash = createHash("sha256").update(styles).digest("base64");

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function sendPage(response: ServerResponse, status: number, title: string, message: string): void {
  response.writeHead(status).end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Guildhead</title>
  <style>${styles}</style>
</head>
<body>
  <main>
    <header>
      <p class="brand">Guildhead</p>
      <p class="eyebrow">Battle.net character verification</p>
    </header>
    <h1>${escapeHtml(title)}</h1>
    <p class="message">${escapeHtml(message)}</p>
    ${status === 200 ? `<ol aria-label="Manage your links in Discord">
      <li>Return to your Discord server.</li>
      <li>Use your character command's <code>list</code> subcommand to view your linked characters.</li>
      <li>Use <code>unlink</code> if you want to remove them.</li>
    </ol>` : ""}
    <footer>You can close this tab and return to Discord. Safe travels, adventurer.</footer>
  </main>
</body>
</html>`);
}

export function createCharacterCallback(
  links: Pick<CharacterLinks, "callback">,
  redirectUri: string,
): Server {
  const callbackPath = new URL(redirectUri).pathname;
  return createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'sha256-${styleHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    void (async () => {
      try {
        const url = new URL(request.url!, "http://localhost");
        if (request.method !== "GET" || url.pathname !== callbackPath) {
          sendPage(response, 404, "Path not found", "This path leads nowhere. Start character linking from Discord.");
          return;
        }
        const states = url.searchParams.getAll("state");
        const codes = url.searchParams.getAll("code");
        const errors = url.searchParams.getAll("error");
        if (states.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(states[0]!) ||
            codes.length > 1 || errors.length > 1 ||
            (codes.length === 1) === (errors.length === 1) ||
            (codes.length === 1 && (codes[0]!.length === 0 || codes[0]!.length > 2_048))) {
          sendPage(response, 400, "Unable to continue", "Invalid callback parameters. Start again in Discord.");
          return;
        }
        await links.callback(states[0]!, codes[0] ?? null);
        sendPage(response, 200, "Characters linked", "Your guild characters are linked to your Discord account. No roles were changed and profession claims remain unverified.");
      } catch (error) {
        sendPage(response, 400, "Unable to continue", error instanceof CharacterLinkError
          ? error.message
          : "Could not verify Battle.net characters. No link was saved. Start again in Discord.");
      }
    })();
  });
}

export async function startCharacterCallback(
  links: CharacterLinks,
  redirectUri: string,
  port: number,
): Promise<Server> {
  const server = createCharacterCallback(links, redirectUri);
  server.listen(port, "0.0.0.0");
  await once(server, "listening");
  return server;
}
