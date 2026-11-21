/** One screen of the board's live jobs, one line each, then a footer of Hephaestus and what is open for User. Read-only, no lock. */
import { readingBoardOf }      from '../../src/lib/tracker-model/ReadingBoard.ts';
import { hephaestusFilesIn }   from '../../src/services/hephaestus/HephaestusFiles.ts';
import { HephaestusLock }      from '../../src/services/hephaestus/HephaestusLock.ts';
import { IncidentRouter }      from '../../src/services/hephaestus/IncidentRouter.ts';
import { PRODUCT_NAMES }       from '../../src/shared/constants/ProductNames.ts';
import { boardStoreOf }        from '../BoardStoreOf.ts';
import type { CommandHandler } from '../CommandHandler.ts';
import { OutputUtil }          from '../utils/OutputUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} jobs [--json]`;

const JOB_ID_COLUMN_WIDTH = 6;
const ROLE_COLUMN_WIDTH   = 18;
const STATE_COLUMN_WIDTH  = 19;

export const jobsCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const { workspace, store } = boardStoreOf(context);
  const progress  = store.reads.requireProgress();
  const board     = readingBoardOf(progress, [], []);
  const jobs      = progress.jobs ?? [];
  const hephaestusLock     = HephaestusLock.newestOf(context.platformPorts, hephaestusFilesIn(workspace.trackerDirectory).hephaestusDirectory);
  const concurrency = board.concurrency();
  const footer = {
    hephaestus:         hephaestusLock.verdict === 'live' ? { state: 'live', url: hephaestusLock.record.url } : { state: 'down' },
    paused:             board.hephaestusState() === 'paused',
    agentsInFlight:     concurrency.agentsInFlight,
    limit:              concurrency.limit,
    openDecisions:      (progress.decisions ?? []).length,
    openIncidents:      (progress.incidents ?? []).length,
    defaultedIncidents: IncidentRouter.defaultedIncidentsOf(store.reads.requireBoard().storedLog.records),
  };
  const warningLines = footer.defaultedIncidents.map(({
    incidentId, move, cause, at
  }) => `warning: incident ${incidentId} took its default, ${move} (${cause}), ${at}`);
  const jobLines = jobs.map((job) => [
    OutputUtil.padColumn(job.id, JOB_ID_COLUMN_WIDTH),
    OutputUtil.padColumn(`${job.kind}/${job.role ?? '-'}`, ROLE_COLUMN_WIDTH),
    OutputUtil.padColumn(job.state, STATE_COLUMN_WIDTH),
    job.ticketIds.length === 0 ? '-' : job.ticketIds.map((ticketId) => `#${ticketId}`).join(','),
    `attempt ${job.attempt}`,
    `child ${job.childInstance}`,
    ...(job.stopRequest === undefined ? [] : [`(${job.stopRequest} asked)`]),
  ].join('  '));
  const hephaestusText = footer.hephaestus.state === 'live' ? `hephaestus: live at ${hephaestusLock.verdict === 'live' ? hephaestusLock.record.url : ''}` : 'hephaestus: down';
  const footerText = `${hephaestusText}; ${footer.paused ? 'paused' : 'not paused'}; agents ${footer.agentsInFlight}/${footer.limit}; `
    + `open decisions ${footer.openDecisions}; open incidents ${footer.openIncidents}`;
  const text = [...(jobLines.length === 0 ? ['No job is live.'] : jobLines), footerText, ...warningLines].join('\n');
  OutputUtil.printEntity(commandArguments, context, { jobs, ...footer }, text);
  return Promise.resolve();
};
