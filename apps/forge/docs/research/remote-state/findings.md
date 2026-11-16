# Remote state, login and cloud workers

> **Question:** What would it take to keep forge's state in a remote database, log a user in at `init`, and run
> jobs on local workers or cloud Claude Code sessions?  
> **Time:** 20 minutes.  
> **Read first:** [The system in twenty minutes](../../concepts/overview.md).  
> **Next:** [the same findings as a page with diagrams](findings.html), [Backlog](../../backlog.md).

Research of 15 November 2026. Nothing here is decided or built. File paths are those of commit `db64ed0a`, before
the move to a monorepo, where the same files sit under `apps/forge/`. Every claim was checked against the code or
the primary page it cites; what could not be confirmed was left out, and what is our own reading says so.

## Summary

| Question | Answer |
| --- | --- |
| Move all state to a remote database? | Move the durable board records only. Board writes already pass through one function, so a store port is feasible. The Overseer talks to a small backend of the owner's, never to the database. |
| How does `init` log in and configure a machine? | GitHub login against a small service on the owner's VPS. The service checks the repository permission and issues short-lived tokens. No connection string reaches a laptop. |
| Switch between local workers and cloud sessions? | Possible per job, at launch. It needs a new worker host seam in the Overseer, and a cloud job must come back as a pushed branch. The cloud CLI gives a daemon no event stream and no stop. |

**The rule that shapes all three.** An agent's output is a claim; only the Overseer turns a claim into state.
Otherwise a session could record "gates passed" without the gates passing. Agents never hold the credential of the
remote store.

## 1. State today

Everything forge persists is a file on one machine. The tracker is `.forge/` (found by walking up from the current
directory, then through git's common directory, so all worktrees share it), worktrees are in `.forge-worktrees/`
beside it, and machine-wide state is in `~/.forge-monitor/`.

### Inventory

| Path | Holds | Written by | Kind | Remote? |
| --- | --- | --- | --- | --- |
| `.forge/progress.json` | The board: rows, jobs, decisions, incidents, merge-queue flags, id counters | CLI commands, Overseer | Durable record | Yes |
| `.forge/tickets/<id>-<slug>.md` | Tickets: frontmatter owned by the CLI, body edited by hand | CLI, Overseer, the owner by hand | Durable record | Yes, with a decision on hand editing |
| `.forge/epics/<key>.md` | Epic key, title, colour slot, description | `epic` commands | Durable record | Yes |
| `.forge/filing-cabinet/D<n>.json` | Filing drafts | `draft` commands | Durable record | Yes |
| `.forge/log.jsonl` | Record of every board change | Any hold that logs | Durable record | Yes, as appends |
| `.forge/pipeline.json` and the gate profile files | Gate pipeline, setup record, constitution sources | Pipeline commands, Overseer | Durable record | Yes |
| `.forge/version.json`, `session-instructions.md`, `reference.md`, briefs | Installed templates and the install version | `init`, `update` | Machine fact | No: describes this checkout's install |
| `.forge/jobs/<J>/events-<i>.ndjson` | Every line to and from an agent session | Watcher, appended and fsynced | Job stream | Shipped by the Overseer if wanted |
| `.forge/gate-profile-runs/<P>.ndjson` | Gate run output | Overseer, appended | Job stream | Shipped by the Overseer if wanted |
| `.forge/overseer.log` | Overseer log lines | Overseer, appended | Job stream | No |
| `.forge/.lock/generation-<n>` | The tracker lock | Any writer | Local coordination | No: replaced by a server-side version check |
| `.forge/hold-journal.json` | Write-ahead copy of one hold's files | A hold that changes a file | Local coordination | No |
| `.forge/overseer/baton-<n>.json` | Which process is the one Overseer | Overseer | Local coordination | No |
| `.forge/jobs/<J>/watcher-<i>.json`, `launch-<i>.json`, markers | Watcher claim, launch plan, step markers | Watcher, Overseer | Local coordination | No |
| `.forge-worktrees/hatch/<J>/requests`, `replies` | Commands a session hands to the Overseer | Session CLI, Overseer | Local coordination | No: becomes HTTPS for cloud jobs |
| `.forge-worktrees/ticket-<id>/` | Git worktrees of the builds | Overseer, agents | Machine fact | No |
| `~/.forge-monitor/projects.json` | Registry of every board on the machine | Mutating commands, Overseer | Machine fact | No |
| `~/.forge-monitor/usage-limit.json`, `machine-limits.json` | Usage marker and machine agent limit | Overseer | Machine fact | No |
| `~/.forge-monitor/agent-slots`, `gate-slots` | Held slots with board, job and process | Overseer, gate Watchers | Local coordination | No |
| `~/.forge-monitor/watchers/<trackerId>/` | API bearer token, Watcher secrets, sockets | Overseer, Watcher | Machine fact | No |
| Overseer memory | Browser session codes for the Bridge | Overseer | Machine fact | No |

Only the durable records are candidates for a database. Local coordination is communication between processes on
one machine. Machine facts cannot sensibly be remote. Job streams stay local and are shipped by the Overseer if a
remote copy is wanted.

### How writes work now

- **One funnel for the board.** Every tracker write goes through `writeTracker`
  (`src/services/tracker/TrackerPipeline.ts`), called from `cli/OpenTrackerForWriting.ts` and twice from
  `src/services/overseer/DrivePass.ts`. Reads without a lock go through `src/services/tracker/TrackerReader.ts`.
- **No storage port.** The format adapters in `src/adapters/` write file paths directly. Outside the tracker, 99
  shipping modules import `node:fs`, 26 of them under `src/services/overseer/`, and 41 use the atomic-file package.
- **A file lock with takeover.** The lock is a folder of exclusively created generation records. A holder is taken
  over when its process is gone or its stamp is older than 30 seconds (`src/services/tracker/TrackerLock.ts`).
- **A journal makes a hold all-or-nothing.** A hold that changes a file writes `hold-journal.json` first and deletes
  it after applying; a journal left by a cut-short hold is replayed by the next lock taker
  (`src/services/tracker/HoldJournal.ts`).
- **The log is rewritten whole,** atomically, in a hold that logged something (`src/adapters/log/LogFileWriter.ts`).
- **Byte-level promises.** Unknown keys are kept in order, an unchanged file is left untouched, and ticket and epic
  bodies are kept byte for byte so they can be edited by hand (`docs/cli.md`).
- **Wake-ups come from the filesystem.** The Overseer runs a pass on a 150 ms debounced watch of the data folder and
  the Hatch folders, plus a 30 second sweep (`src/services/overseer/DataFolderWatch.ts`).
- **No user identity exists.** There is one implicit owner. The Overseer accepts only requests whose Host is
  `127.0.0.1` or `localhost` on its own port, with a bearer token for writes and a cookie from a one-time code for
  the Bridge (`src/services/overseer/OverseerServer.ts`, `docs/reference/overseer-api.md`).

## 2. Moving state remote

The recommended shape: durable records move behind a store port; the Overseer reaches them through a backend the
owner runs; everything about processes and the machine stays where it is. The session's reach does not change.

| Today | With a remote store | Size |
| --- | --- | --- |
| Adapters write files; `writeTracker` plans a hold | A store port at `writeTracker` and `TrackerReader`, with a file adapter and a remote adapter | Medium, well contained |
| Lock folder, 30 s takeover, hold journal | A version check or a transaction on the server; the local lock stays for local coordination | Medium |
| File watch wakes the Overseer | A change feed from the backend, with the sweep as fallback | Small |
| CLI commands write the board directly | CLI commands ask the Overseer, which becomes the one client of the backend | Medium; changes what works with no Overseer running |
| `log.jsonl` rewritten whole when a hold logs | An append to a log collection | Small |
| Tickets edited by hand, kept byte for byte | A body string edited through commands and the Bridge, or files that sync with conflict handling | A decision, see section 8 |
| No identity | Users, tokens and repository authorization, all new | Large |
| Rules in `CLAUDE.md` on stored files and byte-identical writes | Rewritten for the records that leave the filesystem | Small, but must be explicit |

## 3. MongoDB Atlas

Atlas works as the database behind a backend. It is a poor fit when a laptop connects to it directly.

- **Identity-provider login needs M10.** Workforce Identity Federation is supported on dedicated clusters M10 and
  above running MongoDB 7.0.11 or later. It supports the authorization code flow with PKCE and the device flow, and
  only JWT access tokens. The free and Flex tiers support only SCRAM passwords, X.509 certificates and AWS IAM.
  [[1]](#sources) [[2]](#sources) [[3]](#sources)
- **GitHub cannot be the provider.** GitHub does not implement OpenID Connect in its OAuth flows and issues no ID
  tokens for users or apps; its OIDC tokens go to Actions jobs. A broker has to sit in between. [[4]](#sources)
- **Roaming laptops meet the IP access list.** A project holds up to 200 entries, and temporary entries last at most
  7 days. Private endpoints are not available on the free or Flex tiers. [[5]](#sources) [[1]](#sources)
  [[2]](#sources)
- **Access stops at the collection.** Roles scope privileges to a database and collection. Separating boards or
  users inside a collection is code the owner writes. [[6]](#sources)
- **The hosted client paths are gone.** The Atlas Device SDKs were deprecated in September 2024 and removed on 30
  September 2025. For the Data API, MongoDB points to a driver behind one's own framework or cloud function, or a
  partner product. [[7]](#sources) [[8]](#sources)
- **The driver on Bun needs a recent bson.** bson 7.3.4 (5 November 2026) guards against a throw at import time in
  Bun, tracked as NODE-7784 and affecting 7.3.0. Pin it and test on all three operating systems. [[9]](#sources)
- **Change streams** are available on every tier; on M0 and Flex the database filter accepts only strings and
  regular expressions. A transaction must by default run for less than one minute. [[1]](#sources) [[2]](#sources)
  [[10]](#sources)

| Tier | Price | Storage | Identity-provider login | Private endpoint | Change streams |
| --- | --- | --- | --- | --- | --- |
| M0 | Free | 512 MB | No | No | Yes |
| Flex | $8 to $30 a month | 5 GB | No | No | Yes |
| M10 | From $0.08 an hour (about $58 a month) | 10 GB and up | Yes | Yes | Yes |

Prices from the Atlas pricing page. [[11]](#sources)

**Behind a backend the objections fall away.** The backend has one fixed address for the access list, holds the
single database credential, and does the per-board access control. A free or Flex cluster is then enough, and the
database choice becomes low-stakes.

Alternatives worth knowing:

- **Supabase (Postgres).** Row-level security runs inside the database, and GitHub is a built-in login provider
  (with one's own GitHub OAuth app). It could replace both the database and part of the backend. [[12]](#sources)
- **Turso.** An embedded replica keeps a local copy that reads locally and syncs with the cloud database; offline
  writes are an option. Closest to today's local-file feel. [[13]](#sources)
- **Cloudflare Durable Objects.** Each object is single-threaded and a single point of coordination, so one object
  per board removes the need for a lock. [[14]](#sources)

## 4. Init and login

The user proves who they are to GitHub; the backend decides what that identity may do and hands the Overseer a
short-lived token.

1. The user runs `forge init`.
2. The Overseer opens the login page (authorization code with PKCE, loopback redirect).
3. The user signs in to the GitHub App and approves.
4. GitHub returns the code to `127.0.0.1` on this machine.
5. The Overseer exchanges the code for a user token.
6. The Overseer presents the user token and the repository to the backend.
7. The backend checks the user's permission on the repository with GitHub.
8. The backend returns a short-lived Overseer token and a refresh token.

On a machine with no browser, steps 2 to 4 are replaced by the device flow.

Why this flow:

- **Loopback with PKCE by default.** RFC 8252 requires the server to allow any port on a loopback redirect and
  requires public native clients to use PKCE. GitHub supports it: S256 only, and the loopback port need not match
  the registered callback. [[15]](#sources) [[16]](#sources)
- **Device flow only as a fallback.** It works over SSH, but RFC 8628 itself names remote phishing as its risk, and
  Microsoft recommends getting as close as possible to blocking it. On GitHub it must be enabled in the app's
  settings and needs no client secret. The AWS CLI made the same choice: PKCE by default since 2.22.0, device code
  on request. [[17]](#sources) [[18]](#sources) [[16]](#sources) [[19]](#sources)
- **Only the Overseer refreshes.** A GitHub App user token expires after eight hours and its refresh token after six
  months; each refresh replaces the refresh token, and the old one stops working. Two processes refreshing at once
  would strand one, which is another reason for CLI commands to go through the Overseer. [[20]](#sources)
- **Authorization from GitHub itself.** The collaborators API returns a user's permission and role name on a
  repository, so the backend can decide per repository without a second user list. [[21]](#sources)
- **Where the refresh token rests.** Bun has a secrets API over Keychain, libsecret and Windows Credential Manager,
  marked new and experimental; `keytar` is archived. The GitHub CLI falls back to a plain text file when no
  credential store exists, which is the realistic behaviour on a headless Linux host. [[22]](#sources)
  [[23]](#sources)

### The four candidate homes

| Rank | Option | At `init` | Database credential | To operate | Main risk |
| --- | --- | --- | --- | --- | --- |
| 1 | A small service on the owner's VPS, with GitHub login | The user signs in to a GitHub App; the service checks the repository permission and issues tokens | Never leaves the VPS; the Overseer gets a short-lived token of our own design | Patching, TLS, backups, uptime; a dependency for login and access | The VPS holds the database credential, so its compromise is total |
| 2 | Azure: Entra ID with Atlas identity federation | The user signs in to Entra; the database accepts the Entra token | Short-lived and per user without a backend | Nothing of our own, but a dedicated M10 cluster | The token is the user's full database identity; nothing per repository, and no place to enforce the gate rule |
| 3 | AWS: Identity Center with Atlas IAM authentication | The user runs an AWS single sign-on login | Atlas verifies the identity through AWS STS; available on every tier | An AWS account, Identity Center and IAM roles; Secrets Manager at $0.40 per secret per month | A lot of IAM for under ten people; nothing per repository |
| 4 | GitHub accounts alone | The user signs in with GitHub | None: GitHub holds no secret a CLI can fetch | Nothing | Something else must hold the credential, which makes this option 1 |

Option 1 is the only one that can authorize per repository and enforce who may write a gate verdict. Off-the-shelf
parts exist for it: Dex turns GitHub organizations and teams into group claims, and Vault's Atlas engine creates a
database user per lease. MongoDB documents Entra ID and Okta as identity providers for option 2, and the Node
driver takes a human callback in which our code obtains the token. [[24]](#sources) [[25]](#sources)
[[3]](#sources) [[26]](#sources) [[27]](#sources) [[28]](#sources)

**Rejected outright:** fetching one shared, long-lived connection string from a secrets manager after login.
Revoking one person means rotating it for everyone, there is no per-user audit, and one stolen laptop exposes the
whole database.

## 5. Trust boundary

Two tokens with different powers, enforced by the backend:

| Token | Held by | May | May not |
| --- | --- | --- | --- |
| Overseer token | The Overseer, in memory | Write board state, including gate verdicts, after running the gates itself | Leave the Overseer process |
| Job token | One agent session, for one job | Request, report, file a finding (what the Hatch allows today) | Write a verdict, even when used directly against the backend |

What remains is keeping the Overseer token away from a session on the same machine.

- **The sandbox is already the boundary.** The Hatch carries no token today. A session can write only its own Hatch
  folder, and the Overseer takes job and role from the job record for that folder, never from the request
  (`cli/HatchUnderJob.ts`, `src/services/control/Bouncer.ts`). A remote store inherits this boundary.
- **Windows has no boundary.** Sessions and gates run unconfined on Windows by design
  (`src/lib/claude-code/WindowsClaudeHostFacts.ts`), so the guarantee does not hold there, for today's files or for
  a token.
- **Sessions already carry a credential.** A session's environment is a five-name allowlist (`HOME`, `PATH`,
  `USER`, `LANG`, `TMPDIR`) plus the Claude login variables and config folder, git configuration, and an API key
  under API billing (`src/lib/agent-launch/PosixLaunchEnvironment.ts`, `src/lib/claude-code/ClaudeCodeAdapter.ts`).
  The Overseer token must never join that list.
- **Gates run agent-written code.** Build gates run confined in the ticket worktree; the merged-tree gate runs in
  the Airlock's own merge worktree. Gate confinement must deny the token just as the session sandbox does.

| Measure | What it gives | Limit |
| --- | --- | --- |
| Sandbox denies the token file and the credential store | The same boundary that protects `.forge/` today | Needs a test that the profile really denies keychain access; nothing on Windows |
| Access token in Overseer memory only | Nothing useful on disk except the refresh token | The refresh token still rests somewhere |
| Token bound to a key that cannot be copied | A stolen token is useless on another machine | Helps only together with the sandbox |
| Separate operating-system user for the Overseer | A boundary the operating system enforces | Heavy; conflicts with how worktrees and the login item work |
| All agent sessions in the cloud | The token never shares a machine with an agent | Gates still run agent-written code locally; gives up local workers |

**A compromised machine can still lie.** These measures stop an agent from writing a verdict. They do not prove a
verdict is true. If that matters, gates must run on a runner the agent never touched, with the backend trusting
only that runner.

## 6. Local and cloud workers

The choice can be made per job at launch. Both paths have to end the same way: commits in a worktree on the
Overseer's machine, where verification, gates, review and landing already live.

### What assumes a local process today

`AgentAdapter` (`src/lib/agent-launch/AgentAdapter.ts`) only turns a request into a command line and parses events;
it launches nothing, and no port exists for running a job on another host.

| Concern | Today | For a cloud job |
| --- | --- | --- |
| Liveness and stop | A watcher record plus process identity; signals | No documented status or stop for a cloud session |
| Events and the report | Read from the local event log; the report is the final result event | The last assistant message, posted by a Stop hook |
| Steering | A local socket with a secret from an owner-only file | A follow-up message queued through the CLI |
| Resume | `--resume` with a session id derived from the tracker and job | A separate cloud session id to store |
| Hatch | Request and reply files; the folder is the authentication | HTTPS with a per-job token |
| Network guard | A hook run from the Overseer's own Bun and entry-script paths | forge installed in the cloud environment by its setup script |
| Code location | Worktree on the Overseer's disk; forge never pushes, and `push` is a denied worker command | The branch is pushed before the job and fetched after it |

### Ways to run a session in the cloud

| Option | Start | Follow events | Stop | Billing | Main blocker |
| --- | --- | --- | --- | --- | --- |
| `claude --cloud` [[29]](#sources) | CLI, claude.ai sign-in | None documented | None documented | Plan usage | A daemon can send follow-ups but cannot follow or stop the session; completion needs a Stop hook calling a public endpoint |
| Managed Agents [[30]](#sources) | API | Event stream and webhooks | Interrupt event | API tokens plus $0.08 per running session-hour | A separate product with its own session API, so forge's launch, hooks and resume would be built again for it (our reading, not a documented statement) |
| Self-hosted environments [[31]](#sources) | CLI, on runners the customer operates | Stop-hook recipe | None documented | Organization's Claude Code usage | Team and Enterprise plans only, public beta, and the owner runs the compute |
| Scheduled task fired by API [[32]](#sources) | HTTP call with a per-task token | None documented | None documented | Plan usage | Research preview; meant for scheduled work |
| Agent SDK on one's own machine [[33]](#sources) | Our own code | Full control | Full control | API key | We build the hosting; a claude.ai login is not allowed for third-party products |

### Facts about cloud sessions that shape the design

- **Started from the CLI.** `claude --cloud "task"` creates a cloud session; `--remote` is a deprecated alias. It
  needs a claude.ai sign-in: API keys and Console logins are refused. [[29]](#sources)
- **Follow-ups are fire-and-forget.** `claude -p "message" --cloud <id>` queues the message and exits without
  waiting for a reply. Stream output is not supported with `--cloud <id>`. [[29]](#sources)
- **The repository comes from GitHub.** The session clones the remote at the current branch, not the local checkout.
  With no remote, or without the Claude GitHub App on the repository, a git bundle under 100 MB is uploaded
  automatically, without untracked files. [[29]](#sources)
- **The repository's configuration applies.** `CLAUDE.md`, `.claude/skills` and `.claude/agents` load; hooks in
  `.claude/settings.json` and `.mcp.json` load in a session with one repository. The user's `~/.claude` does not.
  [[34]](#sources)
- **Network and secrets are per environment.** Access levels are None, Limited and Full, with environment
  variables, a setup script and network secrets. On Anthropic-hosted sessions a proxy swaps in the GitHub
  credential, so it never enters the machine. [[34]](#sources)
- **Moving a session works one way.** `claude --teleport <id>` brings a cloud session to the terminal, given a clean
  git state, the same repository and account, and a pushed branch. The CLI has no path from local to cloud.
  [[29]](#sources)
- **Usage is shared.** Cloud sessions count toward the plan's usage limits, with no separate charge for the machine.
  [[29]](#sources)
- **Long-lived tokens do not help.** The one-year token from `claude setup-token` can only make model requests.
  Starting a cloud session needs an interactive claude.ai sign-in, and those sign-ins expire. [[35]](#sources)
- **Some organizations cannot use them.** Organizations with Zero Data Retention or the HIPAA configuration cannot
  use cloud session features, and those with customer-managed encryption keys cannot start cloud sessions.
  [[29]](#sources)
- **Automation on a subscription needs care.** The Consumer Terms forbid access "through automated or non-human
  means, whether through a bot, script, or otherwise", with an exception where Anthropic explicitly permits it. The
  documentation does describe sending follow-ups "from a CI script", but an Overseer that starts and steers cloud
  sessions all day goes further than that example. [[36]](#sources) [[29]](#sources)
- **A Stop hook can report back.** Its input includes the last assistant message, and a hook can post to an HTTP
  endpoint. [[37]](#sources)

## 7. Order of work

1. **Worker host seam, local only.** Put liveness, events, steering, resume and stop behind one interface in the
   Overseer, with today's Watcher as its only implementation. No behaviour changes; it is the prerequisite for any
   cloud worker.
2. **Store port with the file adapter.** Route board reads and writes through a port at `writeTracker` and
   `TrackerReader`. Still files, still local.
3. **Backend and login.** The service on the VPS, the GitHub App, the two token kinds, and the remote adapter. CLI
   commands move behind the Overseer here.
4. **Cloud worker trial.** One build job through `claude --cloud`: pushed branch in, pushed branch out, Hatch over
   HTTPS, completion through a Stop hook. Measure what the missing stream and stop cost in practice before
   committing.

## 8. Open decisions

None of these is settled by the research.

1. **Must forge keep working when the backend is unreachable?** Local-first keeps local files as the working copy
   and syncs, at the cost of a conflict design. Online-only is simplest, but an outage stops the board. A middle
   path lets running jobs continue on local buffers while board-writing commands refuse.
2. **Do tickets stay files that are edited by hand?** Keeping them means the remote mirrors files and needs a rule
   for a hand edit that meets a remote change. Dropping them removes the byte-for-byte contract and moves editing to
   commands and the Bridge.
3. **Who is this for: the owner, a few colleagues, or strangers?** One owner needs almost no authorization model.
   Colleagues need per-user identity and per-repository permission. A public product needs tenant isolation and
   limits that this research did not design.
4. **Do CLI commands go through the Overseer?** It makes the Overseer the one client of the backend and the one
   process that refreshes tokens. Commands that work today with no Overseer running would then need one, or a
   credential of their own.
5. **Is the Windows gap acceptable?** With no confinement on Windows, a session there can reach whatever the
   Overseer can. Either Windows runs cloud workers only, or the gap is accepted and documented.
6. **Where do gates run for a cloud job?** On the Overseer's machine against the fetched branch keeps today's flow
   and the verdict on the owner's side. A separate trusted runner is the stronger answer if the machine itself is
   not trusted.
7. **Will ticket branches go to GitHub?** A cloud session clones from GitHub, so the branch must be pushed first.
   forge pushes nothing today and denies workers the command, so this reverses a deliberate rule.
8. **What happens to jobs while the backend is down?** One VPS is a single point of failure. The choices are a local
   queue of writes that drains later, a read-only mode, or a stop. Running sessions, gates and landing need a stated
   answer each.
9. **How do machines on different forge versions share one store?** forge reads only the current stored format and
   refuses older files, and `init` and `update` refuse a newer install. With a shared store, the first machine to
   upgrade would strand the others unless the backend keeps a compatibility window or everyone upgrades together.
10. **Who wins when a hand-edited ticket meets a remote change?** Only relevant if tickets stay files. A workable
    rule is a compare on the content hash with a refusal on mismatch, so nothing is merged silently.
11. **Where may client data live?** Ticket text, logs and epics describe client repositories and can quote code.
    Putting them on a VPS or in Atlas raises region, processing-agreement and client-consent questions for a
    Netherlands consultancy. Cloud sessions also send repository content to the vendor's infrastructure. This
    research assessed neither.
12. **Does the Bridge stay local?** It can keep being served by the Overseer on the loopback address, or become a
    remote page served by the backend, which would show the board without a running Overseer and need its own login.
13. **Does a cloud session call back, or does the Overseer only fetch?** A callback needs a public endpoint with
    TLS, token checks, rate limits and abuse handling. Fetching the pushed branch on a timer needs no inbound
    endpoint, but then a session cannot use the Hatch while it runs and its end is noticed late.
14. **Is driving cloud sessions from the Overseer within the terms of the plan?** Get this confirmed for the plan in
    use before building on `claude --cloud`, or plan on an API-billed route.
15. **How do we get back out?** Backups, restore drills and an export to local files were not designed. The local
    files are also the format agents read, so an export path doubles as the offline fallback.

## Sources

1. Atlas free cluster limits: <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>
2. Atlas Flex cluster limits: <https://www.mongodb.com/docs/atlas/reference/flex-limitations/>
3. Atlas Workforce Identity Federation: <https://www.mongodb.com/docs/atlas/workforce-oidc/>
4. GitHub authentication discovery endpoints: <https://docs.github.com/en/apps/github-authentication-discovery-endpoints>
5. Atlas IP access list: <https://www.mongodb.com/docs/atlas/security/ip-access-list/>
6. MongoDB collection-level access control: <https://www.mongodb.com/docs/manual/core/collection-level-access-control/>
7. Atlas Device SDKs deprecation: <https://www.mongodb.com/docs/atlas/device-sdks/deprecation.md>
8. Atlas Data API deprecation: <https://www.mongodb.com/docs/data-api-deprecation/>
9. MongoDB Jira NODE-7784 and the js-bson releases: <https://jira.mongodb.org/browse/NODE-7784>
10. MongoDB transactions, production considerations: <https://www.mongodb.com/docs/manual/core/transactions-production-consideration/>
11. MongoDB Atlas pricing: <https://www.mongodb.com/pricing>
12. Supabase row-level security and GitHub login: <https://supabase.com/docs/guides/database/postgres/row-level-security>,
    <https://supabase.com/docs/guides/auth/social-login/auth-github>
13. Turso embedded replicas: <https://docs.turso.tech/features/embedded-replicas/introduction>
14. Cloudflare Durable Objects: <https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/>
15. RFC 8252, OAuth 2.0 for Native Apps, sections 6 and 7.3: <https://www.rfc-editor.org/rfc/rfc8252#section-7.3>
16. GitHub, authorizing OAuth apps: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps>
17. RFC 8628, Device Authorization Grant, section 5.4: <https://www.rfc-editor.org/rfc/rfc8628#section-5.4>
18. Microsoft Entra, block authentication flows:
    <https://learn.microsoft.com/en-us/entra/identity/conditional-access/policy-block-authentication-flows>
19. AWS CLI, IAM Identity Center sign-in: <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html>
20. GitHub, refreshing user access tokens:
    <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens>
21. GitHub REST, repository permission of a user:
    <https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user>
22. Bun secrets API: <https://bun.com/docs/runtime/secrets>; node-keytar archive notice:
    <https://github.com/atom/node-keytar>
23. GitHub CLI, `gh auth login`: <https://cli.github.com/manual/gh_auth_login>
24. Dex GitHub connector: <https://dexidp.io/docs/connectors/github/>
25. Vault MongoDB Atlas database secrets engine:
    <https://developer.hashicorp.com/vault/docs/secrets/databases/mongodbatlas>
26. MongoDB Node driver, OIDC authentication:
    <https://www.mongodb.com/docs/drivers/node/current/security/authentication/oidc/>
27. Atlas AWS IAM authentication: <https://www.mongodb.com/docs/atlas/security/aws-iam-authentication/>
28. AWS Secrets Manager pricing: <https://aws.amazon.com/secrets-manager/pricing/>
29. Claude Code on the web: <https://code.claude.com/docs/en/claude-code-on-the-web>
30. Claude Managed Agents, events and streaming:
    <https://platform.claude.com/docs/en/managed-agents/events-and-streaming>; pricing:
    <https://platform.claude.com/docs/en/about-claude/pricing#claude-managed-agents-pricing>
31. Claude Code self-hosted environments: <https://code.claude.com/docs/en/self-hosted-environments>
32. Claude Code scheduled tasks: <https://code.claude.com/docs/en/routines>
33. Claude Agent SDK overview: <https://code.claude.com/docs/en/agent-sdk/overview>
34. Claude Code cloud environments: <https://code.claude.com/docs/en/cloud-environments>
35. Claude Code authentication: <https://code.claude.com/docs/en/authentication>
36. Anthropic Consumer Terms of Service, section 3: <https://www.anthropic.com/legal/consumer-terms>
37. Claude Code hooks: <https://code.claude.com/docs/en/hooks>
