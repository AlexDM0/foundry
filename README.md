# Gaia

One window over every forge on this machine: what waits on User across all boards, every running agent, and the state and controls of
every forge. One forge's own views are its Bridge, shown in place under Gaia's bar.

Gaia is a Bun server and a React page in TypeScript, opened as a macOS app. It runs no agent and is optional: a forge works the same
without it.

## Develop

```bash
bun install
```

```bash
bun run verify
```

```bash
bun src/Main.ts help
```

```bash
bun src/Main.ts launch
```

opens Gaia's window in Google Chrome or Microsoft Edge, starting its server when none runs, and stops that server when the window closes.

The rules for working in this repository are in `CLAUDE.md`.
