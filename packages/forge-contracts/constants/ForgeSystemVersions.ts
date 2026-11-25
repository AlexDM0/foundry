/**
 * What a forge answers at `GET /api/versions`, unversioned and never removed: its own system version and the oldest forge version a
 * client may have been built for and still be served. Forge alone decides that minimum, whoever calls it.
 */
import type { VersionsDocument } from 'system-versions/VersionsDocument';

/**
 * Forge 2.0 is the headless forge: it serves an API and no page. Against forge 1: no page of its own, no browser session or session code, no embed
 * contract and no frame-ancestor record; no Flint's brain in the monitor or the commands; the monitor names what an entry opens by a typed
 * target; the board document carries Markdown (`bodyMarkdown`, `descriptionMarkdown`, `constitutionMarkdown`) where it carried rendered
 * HTML; the Assistant is a switch of the board (the command pipeline-assistant-set, the pipeline's `assistant` key, the default cause
 * assistant-off); and a pipeline has one format, whose gate key is `forgeOnly`. The registry dates the endpoints this changed at 2.0
 * (`ForgeCompatibilityRegistry.ts`).
 * Forge 3.0 names its serving process Hephaestus. Against forge 2: the summary, the monitor and the board document carry the process's facts
 * under the key `hephaestus` (the board's own switch is `hephaestusState`, its log kind hephaestus-set), and the four lifecycle commands are
 * hephaestus-pause, hephaestus-unpause, hephaestus-stop and hephaestus-restart. The registry dates the endpoints this changed at 3.0.
 * Forge 4.0 restarts Hephaestus after a preflight of the code on disk, with no handshake through a file. Against forge 3: the process's state
 * while it restarts is `restarting` in the summary, the monitor and the board document, the warning kind of a failed restart is
 * restart-failed, and the board document carries that failure as `restartWarning`. The registry dates the endpoints this changed at 4.0.
 * Forge 4.1 adds each forge's agent: the board document's `agent`, the setup step `agent` and the record's `agent` and `tools`, a job's
 * `notLaunched`, the pipeline's `agent` and `tools`, the draft field `tools`, and the commands pipeline-setup-agent, pipeline-agent-set,
 * pipeline-tools-set, agent-look-again and machine-agent-program-set.
 * Forge 4.2 adds a ticket's documents in the spec-then-plan route: their endpoint, the user's commands on them, the `documents` event and
 * the new members of the board's unions. Most reach a client only once a board sets that route, but the board's limits name the
 * defaults of the two new roles, `specAgent` and `planAgent`, on every board: a key added to a record a client reads, which only adds.
 * Forge 4.3 puts the agent step before billing, since the agent's vendor decides how it can bill: pipeline-setup-start carries the agent
 * and optionally the billing, the record's `billing` is `null` until chosen, each vendor names its `billingOptions`, and a job is not
 * launched `billing-not-offered` when its billing names a way its vendor does not bill. The owner decided it is a minor.
 * The minimum supported is the current major's first version: no client built for forge 3 is served. The current version is raised with
 * every change to a route, a document, a command or a message, in its minor when the change only adds; the minimum only to retire what the
 * registry keeps.
 */
export const FORGE_SYSTEM_VERSIONS: VersionsDocument = {
  current:          { major: 4, minor: 3 },
  minimumSupported: { major: 4, minor: 0 },
};
