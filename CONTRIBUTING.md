# Contributing

## Development

Guildhead requires Node.js 24.17 or newer.

```sh
npm ci
npm test
```

Keep changes focused. Add tests for changed behavior and preserve exact-name
matching, bounded message processing, and explicit error reporting.

## Pull requests

- Explain the user-visible behavior changed.
- Include focused tests.
- Keep secrets and `.env` files out of commits.
- Confirm `npm test` and `docker build .` pass.
