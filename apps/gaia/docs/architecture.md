# Architecture

How Gaia's parts fit together at run time. The rules and the folder map are in `CLAUDE.md`; every versioned document named here is in
`docs/contracts.md`.

```
Gaia.app ──runs──► gaia launch ──starts──► gaia serve (Bun, 127.0.0.1)
                       │                        ├─ reads    ~/.forge-monitor/projects.json
                       │                        ├─ reads    each Hephaestus: identity, monitor stream or summary
                       └─opens─► browser app    ├─ sends    each Hephaestus: control and board commands
                                 window         ├─ runs     the forge program, for what no Hephaestus API can do
                                    │           └─ writes   ~/.gaia/settings.json, ~/.gaia/token
                                    ▼                │
                                 the page ◄──SSE─────┘   (each forge's board relayed too)
```

## Processes

- **`gaia serve`** (`src/Main.ts`) is the one long-lived process. It holds every forge's token and no state a restart loses, except the
  page sessions. It refuses to start when Gaia's health route already answers on its port.
- **`gaia launch`** (`src/features/launcher/`) probes the health route, starts `gaia serve` as an owned child when nothing answers, opens
  a Chrome or Edge app window with Gaia's kept browser profile, follows that window through the browser's debugging pipe, and when no
  window of Gaia's is left (the one it opened, or one at Gaia's address) stops the browser, whatever other window it still shows on
  that profile, and only the server it started; a server it started that ends closes the window with a dialog.
- **`Gaia.app`** is generated into `~/Applications` by `gaia install-app` (`src/features/app-install/`): a compiled stub that runs a
  generated script, which runs `gaia launch` from this checkout. The stub is the process macOS knows as Gaia: it stays for as long as
  the script runs, as its parent, and opening `Gaia.app` again brings Gaia's window forward.
- **The page** (`page/`) is built by `Bun.build` on its first request and kept in memory, drawn with Forge's linked `design-system`
  package, whose stylesheet and fonts Gaia's server serves from its own origin. It reaches nothing but Gaia's own server, and frames no
  forge's page.

## A reading, from forge to screen

1. `services/ForgeWatch.ts` reads the registry through `adapters/forge-registry/`, and again when its content hash changes. A hidden forge
   is left out.
2. A registry entry that names no Hephaestus is dormant, or missing when its folder is gone. For the others it asks Hephaestus's
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
3. `ForgeControl` picks the carrier: Hephaestus's control API while it answers and its control contract is known; the forge program
   (`adapters/forge-program/`, through `lib/process-run/`) for what no API can do, such as start, update and add; Gaia's own settings for
   hiding a forge or a setting. One command per forge is on its way at a time.
4. It answers a verdict. A forge's refusal passes through unchanged, its sentence the one the forge's command line prints (decision 45);
   only `page-server` maps the verdict to an HTTP status and the command answer. On the way out, `adapters/page-api/ForgeSentenceUtil.ts`
   puts a notice, a warning or another forge sentence that names a command into Gaia's words, so no screen but a refusal tells User to run
   one (D10).
5. The change itself reaches the page as the next fleet snapshot, not through the answer.

## One forge in place

A forge's board opens at `#forge/<trackerId>[/<tab>[/<item>]]`, in Gaia's window or in a browser tab of its own, and only there: Gaia's
bar, then the board's own header and tabs (`page/board/Board.tsx`). Every tab is drawn by Gaia's own view, which
`page/board/shell/BoardTabViews.tsx` names for each. A forge serves no page and has no command that opens a
board, so the board opens one way, through Gaia. A forge whose board Gaia's relay cannot read, or
whose version Gaia cannot talk to, shows why in place of the board.

## A forge's board

Gaia's server reads one forge's board document through `lib/forge-client/` and maps it at its boundary, `adapters/forge-api/`, into its
own model, `ForgeBoard` (`shared/@types/board/`): the last document read, held per forge, never written to a forge or a file. Every forge
value list maps into Gaia's own union, every refusal keeps the forge's code, fields and sentence, and every fact the forge serves (attention
with its typed target, notices, today's figures, the open decisions in answering order, each ticket's and job's offers, the effective
pipelines, the entities draft with its refusals, the Apply refusal, the step run times, limits and defaults) is read as served, never
recomputed. The board's event stream is read as change signals only, since its events carry forge's internal state: a `board` event
means the board document is read again. The page never sees this model; it reads the board contract Gaia serves
(`page/@types/board/`), which `adapters/page-api/BoardDocumentMapUtil.ts` maps the model out to, key by key. A board command comes in
the other way: the page's body is read into Gaia's `BoardCommand` (`adapters/page-api/BoardCommandIngestion.ts`) and sent as the forge's
command of the same kind (`adapters/forge-api/utils/BoardCommandMapUtil.ts`).

The page reaches a forge's board only through Gaia's server, which keeps the token (`features/page-server/`): `ForgeAccess.ts` turns a
tracker id into Hephaestus's address and token, or a refusal; the board route reads the document afresh, sharing one read per forge
among the requests that come while it is on its way; `BoardStreams.ts` holds every relayed stream, one forge stream per page stream,
opened with Gaia's handshake, each event mapped once per forge and closed together at the server's stop; the picture and command routes
read their body to their own bound and forward it. The page reads change signals from the stream and the board afresh from the route.

A ticket in the spec-then-plan route has a spec and a plan, which the page reads from their own route,
`GET /api/v1/forges/<trackerId>/tickets/<ticketId>/documents` (`routes/TicketDocumentsRoute.ts`), again after each `documents` signal.
Their Markdown reaches the page as source text, never as HTML: the page parses it itself and draws every block as React elements, so no
agent's HTML reaches the page. A ticket document's save carries the whole document, so the board's command route reads a body to
`TICKET_DOCUMENT_COMMAND_BODY_BOUND_BYTES`, and the command's ingestion keeps every other kind to the smaller bound.

### The diagram frame

A mermaid block of a document is drawn in a diagram frame: `<iframe sandbox="allow-scripts" src="/diagram-frame/">`, with an opaque
origin, so it reaches neither the page, its cookie nor Gaia's API. Its files are page files, unversioned like `/` and served without a
session: a hand-written `page/diagram-frame/index.html` and one classic script, `DiagramFrameScript.ts` bundled with mermaid
(`routes/PageFilesRoute.ts`), under the frame's own policy (`routes/DiagramFrameRoute.ts`): `default-src 'none'; script-src 'self';
style-src 'self' 'unsafe-inline'; img-src data:; sandbox allow-scripts`, the inline styles being the ones a drawn diagram carries. The
script stays classic because a module script from an opaque origin asks with `Origin: null`, which the Origin guard refuses; a classic
script asks with no Origin, so the guards and the page's own policy stay as they are. Mermaid runs at its `strict` level with no HTML
labels, and its drawing is parsed as SVG, never set as markup. The page and the frame speak the `gaia-diagram-frame` protocol
(`page/shared/@types/DiagramFrameMessages.ts`), each message carrying its version both ways: the page sends the source and the board's
colour tokens as mermaid's theme variables, and the frame answers the drawing's height and nodes, the node the pointer is on, or why it
could not draw. Each side takes a message only from the other's window and drops one of another version.

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
- **The session cookie stays host-only on `127.0.0.1`.** Cookies ignore ports, so a request the same browser makes to a forge's API, served
  on another port of `127.0.0.1`, carries Gaia's cookie. The only program that receives Gaia's cookie this way is a local forge, which
  Gaia already trusts with that forge's token.

## Errors

Deciders answer verdicts, and a forge that refuses or is down is one of them. One app-level error, `GaiaError` (`src/shared/GaiaError.ts`),
is `refused` (User can act) or `unrepaired` (Gaia will not repair it). `page-server` alone maps a verdict to an HTTP status and an answer,
and `src/Main.ts` alone maps a `GaiaError` to an exit code and exits.

## Tests and recordings

Every outside system is reached through one boundary util, and every spec but the boundary's own recording spec answers it from recorded
answers. `CLAUDE.md` ("Boundaries") lists the boundaries and how a recording is taken and checked.
