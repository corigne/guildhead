import { once } from "node:events";
import { createServer, type Server } from "node:http";

import { CharacterLinkError, type CharacterLinks } from "./character-links.js";

export function createCharacterCallback(
  links: Pick<CharacterLinks, "callback">,
  redirectUri: string,
): Server {
  const callbackPath = new URL(redirectUri).pathname;
  return createServer((request, response) => {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    void (async () => {
      try {
        const url = new URL(request.url!, "http://localhost");
        if (request.method !== "GET" || url.pathname !== callbackPath) {
          response.writeHead(404).end("Not found.");
          return;
        }
        const states = url.searchParams.getAll("state");
        const codes = url.searchParams.getAll("code");
        const errors = url.searchParams.getAll("error");
        if (states.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(states[0]!) ||
            codes.length > 1 || errors.length > 1 ||
            (codes.length === 1) === (errors.length === 1) ||
            (codes.length === 1 && (codes[0]!.length === 0 || codes[0]!.length > 2_048))) {
          response.writeHead(400).end("Invalid callback parameters. Start again in Discord.");
          return;
        }
        await links.callback(states[0]!, codes[0] ?? null);
        response.end("Authorization received. Return to Discord: use the character command's list subcommand to review, then confirm. Nothing is linked until you confirm there.");
      } catch (error) {
        response.writeHead(400).end(error instanceof CharacterLinkError
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
