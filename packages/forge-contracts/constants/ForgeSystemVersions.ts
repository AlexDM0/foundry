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
 * The minimum supported is the current major's first version: no client built for forge 2 is served. The current version is raised with
 * every change to a route, a document, a command or a message, in its minor when the change only adds; the minimum only to retire what the
 * registry keeps.
 */
export const FORGE_SYSTEM_VERSIONS: VersionsDocument = {
  current:          { major: 3, minor: 0 },
  minimumSupported: { major: 3, minor: 0 },
};
