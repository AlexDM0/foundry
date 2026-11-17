# Architecture

How Gaia's parts fit together at run time. The rules and the folder map are in `CLAUDE.md`; every versioned document named here is in
`docs/contracts.md`.

```
Gaia.app ──runs──► gaia launch ──starts──► gaia serve (Bun, 127.0.0.1)
                       │                        ├─ reads    ~/.forge-monitor/projects.json
                       │                        ├─ reads    each Overseer: identity, monitor stream or summary
                       └─opens─► browser app    ├─ sends    each Overseer: control commands, session codes
                                 window         ├─ runs     the forge program, for what no Overseer API can do
                                    │           └─ writes   ~/.gaia/settings.json, ~/.gaia/token, ~/.forge-monitor/frame-ancestors/gaia.json
                                    ▼                │
                                 the page ◄──SSE─────┘
                                    └─frames──► one forge's Bridge, at the forge's own origin
```

## Processes

- **`gaia serve`** (`src/Main.ts`) is the one long-lived process. It holds every forge's token and no state a restart loses, except the
  page sessions. It refuses to start when Gaia's health route already answers on its port.
- **`gaia launch`** (`src/features/launcher/`) probes the health route, starts `gaia serve` as an owned child when nothing answers, opens
  a Chrome or Edge app window with Gaia's kept browser profile, follows that window through the browser's debugging pipe, and when no
  window of Gaia's is left (the one it opened, or one at Gaia's address) stops the browser, whatever other window it still shows on
  that profile, and only the server it started; a server it started that ends closes the window with a dialog.
- **`Gaia.app`** is generated into `~/Applications` by `gaia install-app` (`src/features/app-install/`): a compiled stub that runs a
  generated script, which runs `gaia launch` from this checkout.
- **The page** (`page/`) is built by `Bun.build` on its first request and kept in memory, drawn with Forge's linked `design-system`
  package, whose stylesheet and fonts Gaia's server serves from its own origin. It reaches nothing but Gaia's own server, and one forge's
  Bridge in a frame.

## A reading, from forge to screen

1. `services/ForgeWatch.ts` reads the registry through `adapters/forge-registry/`, and again when its content hash changes. A hidden forge
   is left out.
2. A registry entry that names no Overseer is dormant, or missing when its folder is gone. For the others it asks the Overseer's
   `/api/versions` through `lib/forge-client/`, and its verdict against the one forge version Gaia supports decides whether Gaia talks to
   it at all (`docs/contracts.md`): a newer or an older forge, one that serves no versions included, is asked nothing more. Of the others
   it asks the identity at its versioned path; no answer, or an answer as another forge, is unreachable. The identity's `contracts`
   decide the fidelity: the known monitor contract is followed as a stream of snapshots, or its summary polled where the registry names no
   token file, and any other monitor contract is shown as one Gaia cannot read. Every document passes its ingestion in
   `adapters/forge-api/` and becomes a `ForgeReading`.
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
origin frame it because Gaia writes its frame-ancestor record, `~/.forge-monitor/frame-ancestors/gaia.json`, while it serves.

## Flint's brain

Each forge runs its own Flint and its brain; Gaia runs none and calls no model. A forge at the version Gaia supports reports
`flintBrain` in its monitor snapshot, which its ingestion maps into the reading's `brain` (`'not-reported'` for a forge without Flint).
The fleet adds a running brain as an agent row of role `brain` that counts in no figure, limit or slot Gaia computes, and shows an ended run as the
forge's one activity entry for it. Wake and Stop are the commands `forge-brain-start` and `forge-brain-stop`, sent as the control
contract's `flint-brain-start` and `flint-brain-stop`. The page counts the forge's `endsAt` down for display only: the brain leaves when
the forge reports it ended.

## Guards and sessions

The server binds `127.0.0.1` only and checks Host and Origin on every request (`lib/local-http-guards/`); no route answers a cross-origin
read. Every data route needs the session cookie or Gaia's bearer token. The launcher opens the window on the splash, never on an address
with a code, since a program's arguments are readable by every account on the Mac. Once the window is listed it reads `~/.gaia/token`,
buys a one-time code at `POST /api/session-codes`, and moves the window to Gaia's page with the code in the fragment; the page spends it
at `POST /api/session` for an `HttpOnly`, `SameSite=Strict` cookie.

Two decisions hold these guards together:

- **The window is followed over the browser's debugging pipe, not a port.** The browser starts with `--remote-debugging-pipe` and speaks
  its DevTools protocol over descriptors 3 and 4, which only the launcher holds (`lib/process-run/` hands them over). A debugging port on
  `127.0.0.1` would let any local process, of any account, drive the window that holds the session cookie and so pass every guard of the
  server; the browser therefore opens none.
- **The session cookie stays host-only on `127.0.0.1`.** Cookies ignore ports, so a forge's Bridge in Gaia's frame, served on another port
  of `127.0.0.1`, carries Gaia's cookie on its own requests. Serving Gaia on another host name to keep the cookie apart would make the
  framed Bridge's own session cookie cross-site to the page, which the browser then withholds, and the frame would lose its session. The
  only program that receives Gaia's cookie this way is a local forge, which Gaia already trusts with that forge's token.

## Errors

Deciders answer verdicts, and a forge that refuses or is down is one of them. One app-level error, `GaiaError` (`src/shared/GaiaError.ts`),
is `refused` (User can act) or `unrepaired` (Gaia will not repair it). `page-server` alone maps a verdict to an HTTP status and an answer,
and `src/Main.ts` alone maps a `GaiaError` to an exit code and exits.

## Tests and recordings

Every outside system is reached through one boundary util, and every spec but the boundary's own recording spec answers it from recorded
answers. `CLAUDE.md` ("Boundaries") lists the boundaries and how a recording is taken and checked.
