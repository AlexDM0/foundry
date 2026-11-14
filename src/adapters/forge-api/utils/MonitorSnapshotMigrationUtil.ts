/**
 * Migrates a checked monitor snapshot of contract 1 to the shape of contract 2, so one mapper reads both. A warning of contract 1 is the
 * forge's sentence alone and reads as the kind that names no kind; contract 1 knows no current usage window, so it is `null`. The
 * document keeps its `monitorVersion`, so the reading still names the number the forge serves.
 */
import type { MonitorSnapshotDocument, MonitorSnapshotDocumentOfVersionOne } from '../@types/MonitorSnapshotDocument.ts';

/** The kind a warning of monitor contract 1 reads as: the forge sends its sentence and names no kind. */
export const FORGE_WARNING_WITHOUT_KIND = 'forge-warning';

function currentDocumentOf(document: MonitorSnapshotDocumentOfVersionOne): MonitorSnapshotDocument {
  return {
    ...document,
    warnings: document.warnings.map((sentence) => ({ kind: FORGE_WARNING_WITHOUT_KIND, text: sentence })),
    usage:    {
      resetsAt:              document.usage.resetsAt,
      window:                document.usage.window,
      currentWindow:         null,
      currentWindowResetsAt: null,
    },
  };
}

export const MonitorSnapshotMigrationUtil = { currentDocumentOf } as const;
