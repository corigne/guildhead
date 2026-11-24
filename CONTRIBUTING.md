# Contributing

## Development

Guildhead requires Node.js 24.17 or newer.

```sh
npm ci
npm test
```

For resource-limited local checks on Linux with a user systemd session, run
`npm run test:low-impact`. It serializes checks and limits CPU and memory.
Use `sh scripts/low-impact.sh npm run build` for a build under the same limits.
These limits do not constrain an existing Docker daemon; prefer hosted image
builds when local resources are needed for other work.

Keep changes focused. Add tests for changed behavior and preserve exact-name
matching, bounded message processing, and explicit error reporting.

## Pull requests

- Explain the user-visible behavior changed.
- Include focused tests.
- Keep secrets and `.env` files out of commits.
- Confirm `npm test` and `docker build .` pass.
