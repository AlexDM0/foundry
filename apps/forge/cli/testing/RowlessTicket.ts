/**
 * Leaves a filed ticket with no row, as an older board stored a pending low ticket: no command makes one now that a ready ticket keeps its
 * row at every priority, so the scratch board's stored files are edited the way that board wrote them.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                     from 'node:path';

import type { TrackerProgress } from '../../src/lib/tracker-model/@types/TrackerProgress.ts';
import { workspacePathsFor }    from '../../src/services/tracker/Workspace.ts';

const TASK_LINE_PATTERN = /^task: \d+$/m;

/** The scratch board's file of a ticket `ticket add` filed: `<id>-<slug>.md` in its tickets folder. */
function storedTicketFileOf(ticketsDirectory: string, ticketId: string): string {
  const fileName = readdirSync(ticketsDirectory).find((candidate) => candidate.startsWith(`${ticketId}-`));
  if (fileName === undefined) throw new Error(`No file of ticket #${ticketId} is stored in ${ticketsDirectory}`);
  return join(ticketsDirectory, fileName);
}

export function dropTicketRow(repositoryDirectory: string, ticketId: string): void {
  const { progressFilePath, ticketsDirectory } = workspacePathsFor(repositoryDirectory);
  const progress = JSON.parse(readFileSync(progressFilePath, 'utf8')) as TrackerProgress;
  progress.tasks = progress.tasks.filter((task) => task.ticket !== ticketId);
  writeFileSync(progressFilePath, `${JSON.stringify(progress, null, 2)}\n`);
  const ticketFilePath = storedTicketFileOf(ticketsDirectory, ticketId);
  writeFileSync(ticketFilePath, readFileSync(ticketFilePath, 'utf8').replace(TASK_LINE_PATTERN, 'task: null'));
}
