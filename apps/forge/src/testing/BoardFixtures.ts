/**
 * A Board over synthetic records, with a logger that keeps every record in a list, for the Board's specs to assert reason codes, records
 * and changed tickets against. Test-only: nothing that ships may import `src/testing/`.
 */
import type { Draft }                                            from '../lib/tracker-model/@types/Draft.ts';
import type { Epic, EpicFrontmatter }                            from '../lib/tracker-model/@types/Epic.ts';
import type { GateProfilesReading }                              from '../lib/tracker-model/@types/GateProfile.ts';
import type { LogRecord }                                        from '../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline, PipelineEntity }                         from '../lib/tracker-model/@types/Pipeline.ts';
import type { ConstitutionSourcesReading, PipelineSetupReading } from '../lib/tracker-model/@types/PipelineSetup.ts';
import type { Task }                                             from '../lib/tracker-model/@types/Task.ts';
import type {
  RowedTicketStatus,
  Ticket,
  TicketFrontmatter,
  TicketStatus
} from '../lib/tracker-model/@types/Ticket.ts';
import type { TrackerProgress }    from '../lib/tracker-model/@types/TrackerProgress.ts';
import { Board }                   from '../lib/tracker-model/Board.ts';
import type { BoardRefusalDetail } from '../lib/tracker-model/BoardRefusal.ts';
import { refusalIsBoardRefusal }   from '../lib/tracker-model/BoardRefusal.ts';
import { createLogger }            from '../lib/tracker-model/Logger.ts';
import { PipelineUtil }            from '../lib/tracker-model/utils/PipelineUtil.ts';

const FIXTURE_STARTED_AT = '2026-09-18T09:00:00+02:00';

export const FIXTURE_TICKETS_DIRECTORY = '/example-agency/storefront/.agent-progress/tickets';

export const FIXTURE_EPICS_DIRECTORY = '/example-agency/storefront/.agent-progress/epics';

export interface BoardFixture {
  board:    Board;
  progress: TrackerProgress;
  tickets:  Ticket[];
  records:  LogRecord[];
}

export function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id:     1,
    name:   'Example storefront task',
    status: 'pending',
    start:  null,
    end:    null,
    owner:  'Alex Example',
    note:   '',
    ticket: null,
    tokens: null,
    ...overrides,
  };
}

export function ticketFixture(overrides: Partial<TicketFrontmatter> = {}): Ticket {
  const frontmatter: TicketFrontmatter = {
    id:          '001',
    title:       'Example checkout page',
    type:        'ticket',
    status:      'pending',
    filed:       FIXTURE_STARTED_AT,
    updated:     FIXTURE_STARTED_AT,
    started:     null,
    finished:    null,
    delivered:   null,
    abandonedAt: null,
    task:        null,
    extra:       [],
    ...overrides,
  };
  return { frontmatter, body: '', filePath: `${FIXTURE_TICKETS_DIRECTORY}/${frontmatter.id}-example.md` };
}

export function epicFixture(overrides: Partial<EpicFrontmatter> = {}): Epic {
  const frontmatter: EpicFrontmatter = {
    key:   'example-checkout',
    title: 'Example checkout redesign',
    slot:  1,
    extra: [],
    ...overrides,
  };
  return { frontmatter, body: '', filePath: `${FIXTURE_EPICS_DIRECTORY}/${frontmatter.key}.md` };
}

function entityFixture(kind: PipelineEntity['kind'], home: string): PipelineEntity {
  return {
    kind, home: [home], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  };
}

/** A forge at the repository's root over the root entity, the app `web` and the package `design-system`, with no gate anywhere. */
export function entityPipelineFixture(): Pipeline {
  return {
    ...PipelineUtil.minimalPipelineOf(),
    entities: {
      'root':          entityFixture('root', '/'),
      'web':           entityFixture('app', '/apps/web'),
      'design-system': entityFixture('package', '/packages/design-system'),
    },
  };
}

/** The next task id is one past the highest row handed in, as a tracker that filed those rows itself would hold. */
export function boardFixture(contents: {
  tasks?:               Task[];
  tickets?:             Ticket[];
  epics?:               Epic[];
  drafts?:              Draft[];
  concurrencyLimit?:    number;
  pipeline?:            Pipeline;
  pipelineSetup?:       PipelineSetupReading;
  gateProfiles?:        GateProfilesReading;
  constitutionSources?: ConstitutionSourcesReading;
} = {}): BoardFixture {
  const tasks      = contents.tasks ?? [];
  const tickets    = contents.tickets ?? [];
  const epics      = contents.epics ?? [];
  const records: LogRecord[] = [];
  const progress: TrackerProgress = {
    trackerId:  'example-tracker-id',
    project:    'Example Agency',
    startedAt:  FIXTURE_STARTED_AT,
    view:       { kind: 'auto' },
    nextTaskId: Math.max(0, ...tasks.map((task) => task.id)) + 1,
    ...(contents.concurrencyLimit === undefined ? {} : { concurrencyLimit: contents.concurrencyLimit }),
    tasks,
  };
  const board = new Board({
    progress,
    tickets,
    epics,
    drafts: contents.drafts ?? [],
    logger: createLogger((record) => records.push(record)),
    ...(contents.pipeline === undefined ? {} : { pipeline: contents.pipeline }),
    ...(contents.pipelineSetup === undefined ? {} : { pipelineSetup: contents.pipelineSetup }),
    ...(contents.gateProfiles === undefined ? {} : { gateProfiles: contents.gateProfiles }),
    ...(contents.constitutionSources === undefined ? {} : { constitutionSources: contents.constitutionSources }),
  });
  return {
    board,
    progress,
    tickets,
    records,
  };
}

/** The detail of the Board refusal the change throws; any other error is rethrown, and a change that is not refused fails. */
export function refusalDetailOf(change: () => unknown): BoardRefusalDetail {
  try {
    change();
  } catch (error) {
    if (refusalIsBoardRefusal(error)) return error.detail;
    throw error;
  }
  throw new Error('The change was not refused.');
}

/** A ticket has a row once readied: filing and the filer's close file none. */
function statusHasARow(status: TicketStatus): status is RowedTicketStatus {
  return status !== 'draft' && status !== 'ready-for-review';
}

/** One ticket `001` in the status, held or not, with its row where the status has one, and no job on it. */
export function ticketInStatusFixture(status: TicketStatus, hold: string | null, contents: { pipeline?: Pipeline } = {}): BoardFixture {
  const hasARow = statusHasARow(status);
  const ticket  = ticketFixture({ status, task: hasARow ? 1 : null, ...(hold === null ? {} : { hold }) });
  return boardFixture({
    ...contents,
    tickets: [ticket],
    tasks:   hasARow ? [taskFixture({ ticket: '001', status })] : [],
  });
}
