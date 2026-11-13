# Architecture

How Gaia's parts fit together at run time. The rules and the folder map are in `CLAUDE.md`; every versioned document named here is in
`docs/contracts.md`.

```
Gaia.app ──runs──► gaia launch ──starts──► gaia serve (Bun, 127.0.0.1)
                       │                        ├─ reads    ~/.forge-monitor/projects.json
                       │                        ├─ reads    each Overseer: identity, monitor stream or summary
                       └─opens─► browser app    ├─ sends    each Overseer: control commands, session codes
                                 window         ├─ runs     the forge program, for what no Overseer API can do
                                    │           └─ writes   ~/.gaia/settings.json, ~/.gaia/token, ~/.forge-monitor/gaia/server.json
                                    ▼                │
                                 the page ◄──SSE─────┘
                                    └─frames──► one forge's Bridge, at the forge's own origin
```

## Processes

- **`gaia serve`** (`src/Main.ts`) is the one long-lived process. It holds every forge's token and no state a restart loses, except the
  page sessions. It refuses to start when Gaia's health route already answers on its port.
- **`gaia launch`** (`src/features/launcher/`) probes the health route, starts `gaia serve` as an owned child when nothing answers, opens
  a Chrome or Edge app window with Gaia's kept browser profile, follows that window through the browser's debugging port, and when no
  window is left stops the browser and only the server it started.
- **`Gaia.app`** is generated into `~/Applications` by `gaia install-app` (`src/features/app-install/`): a compiled stub that runs a
  generated script, which runs `gaia launch` from this checkout.
- **The page** (`page/`) is built by `Bun.build` on its first request and kept in memory. It reaches nothing but Gaia's own server, and
  one forge's Bridge in a frame.

## A reading, from forge to screen

1. `services/ForgeWatch.ts` reads the registry through `adapters/forge-registry/`, and again when its content hash changes. A hidden forge
   is left out.
2. A registry entry that names no Overseer is dormant, or missing when its folder is gone. For the others it asks the Overseer's identity
   through `lib/forge-client/`; no answer, or an answer as another forge, is unreachable. The identity's `contracts` decide the
   fidelity: a known monitor contract is followed as a stream of snapshots, a forge with only the summary is polled, and a newer monitor
   contract is shown as one Gaia cannot read in full. Every document passes its ingestion in `adapters/forge-api/` and becomes a
   `ForgeReading`.
3. `features/fleet/FleetAssembly.ts` turns the readings, the machine's facts and the settings into one `FleetSnapshot`, purely: attention
   across forges, the forges that need a look, agents, activity and the figures.
4. `services/FleetStore.ts` keeps the latest snapshot. `features/page-server/FleetBroker.ts` maps it out through `adapters/page-api/` as a
   `FleetDocument`, answers `GET /api/fleet`, and sends a `fleet` event to every open `GET /api/events` stream.
5. The page's `api/FleetStreamClient.ts` follows that stream, and each view derives what it shows from the document in its own model.

A forge that is down is an ordinary reading, never a throw. A reading that stops arriving keeps its last value, marked as last reported.

## A command, from button to forge

1. The page sends one command per request to `POST /api/commands` (`page/api/CommandSender.ts`).
2. `features/page-server/routes/CommandsRoute.ts` reads it in through `adapters/page-api/GaiaCommandIngestion.ts` and hands it to the
   command port that `src/Main.ts` wires to `features/forge-control/ForgeControl.ts`.
3. `ForgeControl` picks the carrier: the Overseer's control API while it answers and its control contract is known; the forge program
   (`adapters/forge-program/`, through `lib/process-run/`) for what no API can do, such as start, update and add; Gaia's own settings for
   hiding a forge or a setting. One command per forge is on its way at a time.
4. It answers a verdict. A forge's refusal passes through unchanged; only `page-server` maps the verdict to an HTTP status and the command
   answer. On the way out, `adapters/page-api/ForgeSentenceUtil.ts` puts a forge sentence that names a command into Gaia's words, in the
   command answer, the frame session answer and the fleet document's notices and warnings alike, so no screen tells User to run one (D10).
5. The change itself reaches the page as the next fleet snapshot, not through the answer.

## One forge in place

The page asks `POST /api/forges/<trackerId>/frame-session`. Gaia asks that forge's Overseer for a one-time session code with the forge's
token and answers the Bridge's address with the code in its fragment, which the page sets as the frame's `src`. The token never reaches
the page. The Bridge and the page talk only over the embed channel (`page/views/forge-frame/EmbedChannel.ts`). A forge lets Gaia's
origin frame it because Gaia writes `~/.forge-monitor/gaia/server.json` while it serves.

## Guards and sessions

The server binds `127.0.0.1` only and checks Host and Origin on every request (`lib/local-http-guards/`); no route answers a cross-origin
read. Every data route needs the session cookie or Gaia's bearer token. The launcher reads `~/.gaia/token`, buys a one-time code at
`POST /api/session-codes`, and opens the window with it; the page spends it at `POST /api/session` for an `HttpOnly`, `SameSite=Strict`
cookie.

## Errors

Deciders answer verdicts, and a forge that refuses or is down is one of them. One app-level error, `GaiaError` (`src/shared/GaiaError.ts`),
is `refused` (User can act) or `unrepaired` (Gaia will not repair it). `page-server` alone maps a verdict to an HTTP status and an answer,
and `src/Main.ts` alone maps a `GaiaError` to an exit code and exits.

## Tests and recordings

Every outside system is reached through one boundary util, and every spec but the boundary's own recording spec answers it from recorded
answers. `CLAUDE.md` ("Boundaries") lists the boundaries and how a recording is taken and checked.
