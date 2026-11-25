/**
 * The Agents view in a happy-dom document, against a fake clock, a fake transcript stream and a fake command client. What matters: builder
 * and reviewer jobs sit under the project row of the worker card and sessions in their own card, so nothing that never takes a slot sits
 * under the slot meter; a job that asks User is marked and followed by its Asks User strip, whose Answer opens the decision on the
 * Questions tab; a row carries its raw state on its palette row with a quiet or not-counted tag, its calls against its budget as a meter,
 * its subagents as squares (no subagent rows), its tickets as chips; a job interrupted by a network outage or a lost supervision reads as
 * its wait in the waiting tone, never the failure tone, and its panel says what it waits for as the forge serves it, offering Resume only
 * where it waits for the user's instruction; diagnostics add three columns and take them away again; the foot names what the figure
 * counts and the tickets in progress no job works on; the Sessions head tallies each kind of session; each card has its own empty line;
 * the elapsed time ticks each second, says "running" while the call has no result, and is tinted only while silent sweeps are above zero;
 * the transcript replays then follows, resumes after its last cursor when reopened, and renders an agent's markup as text; each control
 * posts its board command and shows a refusal verbatim, a message or answer only when written, clearing its field once applied, and an
 * answer only to the decision it was typed for; the stop modes and Fresh agent are offered as the forge offers them; the project row
 * offers the concurrency limit within the forge's bounds, Set only once the number differs; the view opens with its title row; the
 * selected job's side panel names the job and its state, holds one Flint slot (112, lane), cued by the selected job while it runs and idle
 * while it does not, unless the question panel covers it and holds the page's one slot, takes a message in its foot only where the forge
 * offers it, drops a half-typed message once another job is selected, and × routes the panel closed; and the board draws the Agents tab
 * itself, reading the board again after a change.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { ReactElement } from 'react';

import type { BoardCommandDocument }                    from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardDecisionDocument }                   from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument, BoardLaunchSlotsDocument } from '../../../@types/board/BoardDocument.ts';
import type { BoardIncidentDocument }                   from '../../../@types/board/BoardIncidentDocument.ts';
import type { BoardJobLiveFactsDocument }               from '../../../@types/board/BoardJobDocuments.ts';
import type { BoardTranscriptEntryDocument }            from '../../../@types/board/ConversationDocument.ts';
import type { TranscriptFollowOptions }                 from '../../@types/BoardServices.ts';
import type { CommandOutcome }                          from '../../api/BoardCommandClient.ts';
import type { EventStreamHandlers }                     from '../../api/BoardEventStreamClient.ts';
import type { TranscriptStreamHandlers }                from '../../api/TranscriptStreamClient.ts';
import { BoardApp }                                     from '../../shell/BoardApp.tsx';
import { BoardClockContext, type BoardClock }           from '../../shell/BoardClock.ts';
import { ControlSurroundingsContext }                   from '../../shell/ControlAvailability.ts';
import { QuestionPanelShownContext }                    from '../../shell/CoveringPanel.ts';
import { boardHrefOf, boardRouteSurroundings }          from '../../testing/BoardRouteSurroundings.tsx';
import {
  boardStateFixture,
  exampleAgentJob,
  exampleAskingDecision,
  exampleSubagent,
  exampleTicket,
  FIXTURE_TRACKER_ID
} from '../../testing/BoardStateFixture.ts';
import { elementOf, flintHabitatSceneOf, placeAt } from '../../testing/FlintHabitatScene.ts';
import { createManualFlintFrames }                 from '../../testing/ManualFlintFrames.ts';
import { pipelineBoardStateOf }                    from '../../testing/PipelineFixture.ts';
import { OPEN_INCIDENT }                           from '../../testing/WaitingOnUserFixture.ts';
import type { AgentJobDocument }                   from './AgentJobDocument.ts';
import { AgentsView }                              from './AgentsView.tsx';

const STARTED_AT = '2026-10-29T20:00:00Z';

const COMMAND_VERSION = { boardCommandVersion: 3 } as const;

const BUILD_JOB: AgentJobDocument = exampleAgentJob({
  id:         'J12',
  ticketIds:  ['042'],
  launchedAt: STARTED_AT,
  live:       {
    calls:                  12,
    callBudget:             150,
    tokens:                 48_000,
    toolCalls:              7,
    lastToolCall:           { toolName: 'Bash', startedAt: STARTED_AT, running: true },
    subagents:              [],
    toolCallsWithSubagents: 11,
    silentSweeps:           0,
    turn:                   null,
    messagesWaiting:        0,
    lastLine:               null,
  },
});

const LIVE: BoardJobLiveFactsDocument = BUILD_JOB.live;

const REVIEW_JOB = exampleAgentJob({
  id: 'J14', kind: 'review', role: 'reviewer', ticketIds: ['043']
});

const INTAKE_JOB = exampleAgentJob({
  id:        'J7',
  kind:      'product-owner',
  role:      'product-owner',
  ticketIds: [],
  intake:    { text: 'Example search suggestions and saved baskets, please', title: 'Saved baskets' },
  live:      { ...LIVE, callBudget: null, calls: 22 },
});

const ASSISTANT_JOB = exampleAgentJob({
  id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: [], live: { ...LIVE, callBudget: null }
});

/** A roleless merge, which takes no message and holds no launch slot. */
const MERGE_JOB = exampleAgentJob({
  id: 'J20', kind: 'merge', role: null, offers: { stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: false }
});

const LAUNCH_SLOTS: BoardLaunchSlotsDocument = { limit: 5, slotJobIds: ['J12', 'J14'], inProgressTicketIdsWithoutJob: ['010', '002'] };

const TICKETS = [exampleTicket({ id: '042', title: 'Example gift card ignored' }), exampleTicket({ id: '043', title: 'Example account pages dark mode' })];

function interruptedBy(interruption: 'network-outage' | 'lease-ended', waitsFor: AgentJobDocument['waitsFor']): AgentJobDocument {
  return {
    ...BUILD_JOB, state: 'interrupted', interruption, waitsFor, offers: { stopModes: [], takesFresh: false, takesMessage: false }
  };
}

interface FakeClock {
  readonly clock:   BoardClock;
  readonly advance: (seconds: number) => void;
  readonly leap:    (seconds: number) => void;
}

function fakeClock(): FakeClock {
  let current = new Date('2026-10-29T20:00:05Z').getTime();
  const ticks = new Set<() => void>();
  return {
    clock: {
      now:         () => new Date(current),
      everySecond: (tick) => {
        ticks.add(tick);
        return () => ticks.delete(tick);
      },
      after: () => () => undefined,
    },
    advance: (seconds) => {
      for (let i = 0; i < seconds; i += 1) {
        current += 1000;
        act(() => ticks.forEach((tick) => tick()));
      }
    },
    leap: (seconds) => {
      current += seconds * 1000;
      act(() => ticks.forEach((tick) => tick()));
    },
  };
}

interface FakeTranscripts {
  readonly follow:  (jobId: string, handlers: TranscriptStreamHandlers, options?: TranscriptFollowOptions) => { close: () => void };
  readonly opened:  { jobId: string; after: string | null }[];
  readonly deliver: (entries: readonly BoardTranscriptEntryDocument[]) => void;
}

function fakeTranscripts(): FakeTranscripts {
  const opened: { jobId: string; after: string | null }[] = [];
  let handlers: TranscriptStreamHandlers | null = null;
  return {
    follow: (jobId, streamHandlers, options) => {
      opened.push({ jobId, after: options?.after ?? null });
      handlers = streamHandlers;
      return { close: () => undefined };
    },
    opened,
    deliver: (entries) => act(() => handlers?.onEntries(entries)),
  };
}

type TranscriptEntryChanges = Partial<BoardTranscriptEntryDocument> & Pick<BoardTranscriptEntryDocument, 'cursor' | 'entryKey' | 'role' | 'text'>;

function transcriptEntry(changes: TranscriptEntryChanges): BoardTranscriptEntryDocument {
  return {
    at:              null,
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
    ...changes,
  };
}

const APPLIED: CommandOutcome = { verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: null } };

interface Rendered {
  readonly sent:     BoardCommandDocument[];
  readonly followed: string[];
  readonly rerender: (jobs: readonly AgentJobDocument[], selectedJobId?: string | null) => void;
}

interface RenderOptions {
  readonly selectedJobId?:        string | null;
  readonly clock?:                BoardClock;
  readonly transcripts?:          FakeTranscripts;
  readonly outcome?:              CommandOutcome;
  readonly decisions?:            readonly BoardDecisionDocument[];
  readonly incidents?:            readonly BoardIncidentDocument[];
  readonly launchSlots?:          BoardLaunchSlotsDocument;
  readonly concurrencyLimit?:     number;
  /** The question panel shows over the view, holding the page's one Flint slot. */
  readonly questionPanelIsShown?: boolean;
}

interface AgentsSurroundings {
  readonly sent:     BoardCommandDocument[];
  readonly followed: string[];
  readonly view:     (shownJobs: readonly AgentJobDocument[], selectedJobId: string | null) => ReactElement;
}

function boardOf(jobs: readonly AgentJobDocument[], options: RenderOptions): BoardDocument {
  const fixture = boardStateFixture();
  return boardStateFixture({
    project:     'Example Storefront',
    jobs,
    decisions:   options.decisions ?? [],
    incidents:   options.incidents ?? [],
    launchSlots: options.launchSlots ?? LAUNCH_SLOTS,
    concurrency: { limit: options.concurrencyLimit ?? 4, agentsInFlight: 1 },
    page:        { ...fixture.page, tickets: TICKETS },
  });
}

function agentsSurroundingsOf(options: RenderOptions): AgentsSurroundings {
  const sent: BoardCommandDocument[] = [];
  const routes = boardRouteSurroundings();
  const surroundings = {
    availability:  'enabled' as const,
    commandClient: {
      send: (command: BoardCommandDocument) => {
        sent.push(command);
        return Promise.resolve(options.outcome ?? APPLIED);
      },
    },
    onInstallHeld: () => undefined,
  };
  const clock = options.clock ?? fakeClock().clock;
  const transcripts = options.transcripts ?? fakeTranscripts();
  const view = (shownJobs: readonly AgentJobDocument[], selectedJobId: string | null) => routes.wrap(
    <ControlSurroundingsContext.Provider value={surroundings}>
      <BoardClockContext.Provider value={clock}>
        <QuestionPanelShownContext.Provider value={options.questionPanelIsShown ?? false}>
          <AgentsView board={boardOf(shownJobs, options)} selectedJobId={selectedJobId} followTranscript={transcripts.follow} />
        </QuestionPanelShownContext.Provider>
      </BoardClockContext.Provider>
    </ControlSurroundingsContext.Provider>,
  );
  return { sent, followed: routes.followed, view };
}

function renderAgents(jobs: readonly AgentJobDocument[], options: RenderOptions = {}): Rendered {
  const { sent, followed, view } = agentsSurroundingsOf(options);
  const { rerender } = render(view(jobs, options.selectedJobId ?? null));
  return { sent, followed, rerender: (shownJobs, selectedJobId = options.selectedJobId ?? null) => rerender(view(shownJobs, selectedJobId)) };
}

function card(name: 'Agents' | 'Sessions'): HTMLElement {
  return screen.getByRole('region', { name });
}

function jobRow(jobId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`tr[data-job-id="${jobId}"]`);
  if (row === null) throw new Error(`no row for ${jobId}`);
  return row;
}

function cellOf(row: Element, column: string): HTMLElement {
  const cell = row.querySelector<HTMLElement>(`td[data-column="${column}"]`);
  if (cell === null) throw new Error(`no ${column} cell`);
  return cell;
}

function rowIdsOf(region: HTMLElement): string[] {
  return [...region.querySelectorAll('tr[data-job-id]')].map((row) => row.getAttribute('data-job-id') ?? '');
}

function headTextsOf(region: HTMLElement): string[] {
  return [...region.querySelectorAll('th')].map((head) => head.textContent ?? '');
}

async function clicked(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
});

describe('the two cards', () => {
  test('the worker card lists builder and reviewer jobs under the project row, and sessions sit in their own card', () => {
    renderAgents([ASSISTANT_JOB, BUILD_JOB, INTAKE_JOB, REVIEW_JOB]);
    expect(rowIdsOf(card('Agents'))).toEqual(['J12', 'J14']);
    expect(rowIdsOf(card('Sessions'))).toEqual(['J1', 'J7']);
    const projectRow = card('Agents').querySelector('tbody tr');
    expect(projectRow?.className).toBe('agents-project-row');
    expect(projectRow?.textContent).toContain('Example Storefront');
    expect(headTextsOf(card('Agents'))).toEqual(['Job', 'Ticket', 'State', 'Calls against budget', 'Subagentsnot counted', 'Last tool', 'Tokens so far']);
    expect(headTextsOf(card('Sessions'))).toEqual(['Job', 'About', 'State', 'Calls', 'Subagentsnot counted', 'Last tool', 'Tokens so far']);
    expect(within(card('Agents')).getByText('2 jobs')).toBeDefined();
  });

  test('a row names its role once, as its tile\'s image, and links its id to the job, and each ticket is a chip of its id and title linked to its ticket row', () => {
    renderAgents([BUILD_JOB, { ...REVIEW_JOB, ticketIds: ['043', '099'] }]);
    expect(cellOf(jobRow('J12'), 'job').textContent).toBe('J12builder');
    expect(within(jobRow('J12')).getAllByRole('img', { name: 'builder' }).map((image) => image.getAttribute('data-icon'))).toEqual(['hammer']);
    expect(within(jobRow('J12')).getByText('builder').getAttribute('aria-hidden')).toBe('true');
    expect(within(jobRow('J12')).getByRole('link', { name: 'J12' }).getAttribute('href')).toBe(boardHrefOf('agents/J12'));
    const chip = within(jobRow('J12')).getByRole('link', { name: '#042 Example gift card ignored' });
    expect(chip.getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/042'));
    expect(cellOf(jobRow('J14'), 'job').textContent).toBe('J14reviewer');
    expect(within(jobRow('J14')).getByRole('img', { name: 'reviewer' }).getAttribute('data-icon')).toBe('magnifier');
    expect(within(jobRow('J14')).getByRole('link', { name: '#099' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/099'));
  });

  test('a session\'s About names its intake\'s title linked to the intake, or the Assistant\'s open incidents', () => {
    renderAgents([ASSISTANT_JOB, INTAKE_JOB], { incidents: [{ ...OPEN_INCIDENT, id: 'I3' }] });
    const about = within(jobRow('J7')).getByRole('link', { name: 'Saved baskets' });
    expect(about.getAttribute('href')).toBe(boardHrefOf('intake/J7'));
    expect(cellOf(jobRow('J1'), 'subject').textContent).toBe('1 open incident');
  });

  test('each card has its own empty line, and a tab without any agent job says no agents are running', () => {
    const { rerender } = renderAgents([]);
    expect(within(card('Agents')).getByText('No agents are running.')).toBeDefined();
    expect(within(card('Sessions')).getByText('No intake or Assistant session is live.')).toBeDefined();
    rerender([ASSISTANT_JOB]);
    expect(within(card('Agents')).getByText('No builder or reviewer is working.')).toBeDefined();
    expect(card('Agents').querySelector('.agents-project-row')?.textContent).toContain('Example Storefront');
  });
});

describe('a job that asks User', () => {
  test('gets a marked row first in its card and an Asks User strip with the question, the job it blocks, its age and an Answer link', () => {
    const { clock, advance } = fakeClock();
    renderAgents([BUILD_JOB, REVIEW_JOB], {
      clock,
      decisions: [exampleAskingDecision({ id: 'E8', jobId: 'J14', openedAt: '2026-10-29T19:51:00Z' })],
    });
    expect(rowIdsOf(card('Agents'))).toEqual(['J14', 'J12']);
    expect(jobRow('J14').hasAttribute('data-asking')).toBe(true);
    expect(jobRow('J12').hasAttribute('data-asking')).toBe(false);
    const strip = jobRow('J14').nextElementSibling;
    if (!(strip instanceof HTMLElement)) throw new Error('no Asks User strip');
    expect(strip.className).toBe('agents-ask-row');
    expect(within(strip).getByText('Your decision')).toBeDefined();
    expect(within(strip).getByText('E8')).toBeDefined();
    expect(within(strip).getByText('Should the example gift card skip payment?')).toBeDefined();
    expect(within(strip).getByText('blocks J14')).toBeDefined();
    expect(within(strip).getByText('9m 05s')).toBeDefined();
    advance(2);
    expect(within(strip).getByText('9m 07s')).toBeDefined();
    expect(within(strip).getByRole('link', { name: 'Answer' }).getAttribute('href')).toBe(boardHrefOf('questions/E8'));
    expect(within(card('Agents')).getByText('2 jobs · 1 asks User')).toBeDefined();
  });

  test('the Sessions head tallies live intake and Assistant jobs, those that wait on User, and the open incidents', () => {
    renderAgents([ASSISTANT_JOB, INTAKE_JOB, { ...INTAKE_JOB, id: 'J6' }], { decisions: [exampleAskingDecision({ id: 'E9', jobId: 'J7' })] });
    const intakeTally = within(card('Sessions')).getByRole('link', { name: /^Intake/ });
    expect(intakeTally.getAttribute('href')).toBe(boardHrefOf('intake'));
    expect(intakeTally.textContent).toBe('Intake2live1 waits on User');
    expect(within(intakeTally).getByRole('img', { name: 'Intake' }).getAttribute('data-icon')).toBe('inbox');
    const assistantTally = within(card('Sessions')).getByRole('link', { name: /^Assistant/ });
    expect(assistantTally.getAttribute('href')).toBe(boardHrefOf('assistant'));
    expect(assistantTally.textContent).toBe('Assistant1live0 incidents open');
    expect(within(assistantTally).getByRole('img', { name: 'Assistant' }).getAttribute('data-icon')).toBe('lifebuoy');
    expect(card('Sessions').querySelector('.agents-project-row')?.textContent).toBe('Example Storefront3 sessions · 1 waits on User');
  });
});

describe('a row\'s live facts', () => {
  test('the State cell shows the raw job state on its palette row, the quiet tag while silent sweeps are above zero, and the quiet tag alone', () => {
    const { rerender } = renderAgents([BUILD_JOB, { ...REVIEW_JOB, state: 'in-customs' }]);
    expect(jobRow('J12').querySelector('.design-system-state-badge')?.getAttribute('data-state-tone')).toBe('accent');
    expect(jobRow('J14').querySelector('.design-system-state-badge')?.getAttribute('data-state-tone')).toBe('info-outline');
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('running');
    rerender([{ ...BUILD_JOB, live: { ...LIVE, silentSweeps: 2 } }]);
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('runningquiet 2 sweeps');
    expect([...jobRow('J12').querySelectorAll('.design-system-tag')].map((tag) => tag.getAttribute('data-tone'))).toEqual(['warn']);
    expect(within(card('Agents')).getByText('1 job · 1 quiet')).toBeDefined();
  });

  test('a worker the forge did not count, such as a roleless merge, is tagged not counted, and a session never is', () => {
    renderAgents([BUILD_JOB, MERGE_JOB, ASSISTANT_JOB]);
    expect(cellOf(jobRow('J20'), 'state').textContent).toBe('runningnot counted');
    expect(jobRow('J20').querySelector('.design-system-tag')?.hasAttribute('data-dashed')).toBe(true);
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('running');
    expect(cellOf(jobRow('J1'), 'state').textContent).toBe('running');
  });

  test('calls read against the budget with a meter, warn near the budget, and unbounded without one', () => {
    renderAgents([{ ...BUILD_JOB, live: { ...LIVE, calls: 41 } }, { ...REVIEW_JOB, live: { ...LIVE, calls: 131 } }, INTAKE_JOB]);
    expect(cellOf(jobRow('J12'), 'calls').textContent).toBe('41 / 150');
    expect(within(jobRow('J12')).getByRole('img', { name: '41 of 150 calls' }).hasAttribute('data-near')).toBe(false);
    expect(within(jobRow('J14')).getByRole('img', { name: '131 of 150 calls' }).hasAttribute('data-near')).toBe(true);
    expect(jobRow('J14').querySelector('.agents-budget-figure')?.hasAttribute('data-near')).toBe(true);
    expect(cellOf(jobRow('J7'), 'calls').textContent).toBe('22 · none');
    expect(within(jobRow('J7')).getByRole('img', { name: '22 calls, no budget' }).hasAttribute('data-unbounded')).toBe(true);
  });

  test('subagents are squares, marked while running and named by their label, and no subagent row exists', () => {
    renderAgents([{
      ...BUILD_JOB,
      live: {
        ...LIVE,
        subagents: [
          exampleSubagent({ parentToolUseId: 'toolu-1' }),
          exampleSubagent({ parentToolUseId: 'toolu-2', state: 'ended' }),
          exampleSubagent({ parentToolUseId: 'toolu-3', state: 'ended' }),
        ],
      },
    }, REVIEW_JOB]);
    const squares = within(jobRow('J12')).getByRole('img', { name: '3 subagents, 1 running, 2 done' });
    expect([...squares.children].map((square) => square.hasAttribute('data-running'))).toEqual([true, false, false]);
    expect(squares.firstElementChild?.getAttribute('title')).toBe('Example search of the checkout code · 4 tool calls · running');
    expect(cellOf(jobRow('J12'), 'subagents').textContent).toBe('1 running · 2 done');
    expect(cellOf(jobRow('J14'), 'subagents').textContent).toBe('none');
    expect(card('Agents').querySelectorAll('tr').length).toBe(4);
    expect(cellOf(jobRow('J12'), 'subagents').querySelector('.agents-subagents')?.hasAttribute('data-one-line')).toBe(false);
  });

  test('the job panel reads its subagent figure beside the squares, on one line', () => {
    renderAgents([{ ...BUILD_JOB, live: { ...LIVE, subagents: [exampleSubagent({ parentToolUseId: 'toolu-1' })] } }], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(panel.querySelector('.agents-subagents')?.hasAttribute('data-one-line')).toBe(true);
  });

  test('Show diagnostics adds Phase, Tool calls and Silent sweeps to both cards, and takes them away again', async () => {
    renderAgents([{ ...BUILD_JOB, airlockPhase: 'gating' }, ASSISTANT_JOB]);
    const toggle = screen.getByRole('button', { name: 'Show diagnostics' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(jobRow('J12').querySelector('td[data-column="silent-sweeps"]')).toBeNull();
    await clicked('Show diagnostics');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(headTextsOf(card('Agents')).slice(-3)).toEqual(['Phase', 'Tool calls', 'Silent sweeps']);
    expect(headTextsOf(card('Sessions')).slice(-3)).toEqual(['Phase', 'Tool calls', 'Silent sweeps']);
    expect(['phase', 'tool-calls', 'silent-sweeps'].map((column) => cellOf(jobRow('J12'), column).textContent))
      .toEqual(['gating', '7 (11 with subagents)', '0']);
    expect(jobRow('J12').nextElementSibling).toBeNull();
    await clicked('Show diagnostics');
    expect(jobRow('J12').querySelector('td[data-column="silent-sweeps"]')).toBeNull();
  });
});

describe('a job that waits after a network outage or a lost supervision', () => {
  test('a network-outage job and a lease-ended job read as their wait in the waiting tone, dashed, never the failure tone', () => {
    renderAgents([interruptedBy('network-outage', 'instruction'), { ...interruptedBy('lease-ended', 'instruction'), id: 'J14', ticketIds: ['043'] }]);
    expect([cellOf(jobRow('J12'), 'state').textContent, cellOf(jobRow('J14'), 'state').textContent]).toEqual(['Network outage', 'Not supervised']);
    const badges = [jobRow('J12'), jobRow('J14')].map((row) => row.querySelector('.design-system-state-badge'));
    expect(badges.map((badge) => badge?.getAttribute('data-state-tone'))).toEqual(['neutral', 'neutral']);
    expect(badges.every((badge) => badge?.hasAttribute('data-dashed') === true)).toBe(true);
    expect(document.querySelector('[data-state-tone="error"]')).toBeNull();
  });

  test('a job interrupted by another cause reads its raw state', () => {
    renderAgents([{
      ...BUILD_JOB, state: 'interrupted', interruption: 'agent-crashed', waitsFor: 'nothing'
    }]);
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('interrupted');
  });

  test('with waitsFor instruction the panel says it waits for the user\'s resume, and Resume sends interrupted-work-resume for the job once', async () => {
    const { sent } = renderAgents([interruptedBy('network-outage', 'instruction')], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(within(panel).getByText('Network outage · 5s')).toBeDefined();
    expect(within(panel).getByText('Waits for your resume.')).toBeDefined();
    expect(panel.querySelector('.design-system-state-dot')?.getAttribute('data-state-tone')).toBe('neutral');
    await clicked('Resume');
    expect(sent).toEqual([{ ...COMMAND_VERSION, kind: 'interrupted-work-resume', target: { jobId: 'J12' } }]);
  });

  test('with waitsFor nothing the panel says it resumes by itself and offers no control', () => {
    renderAgents([interruptedBy('lease-ended', 'nothing')], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(within(panel).getByText('Resumes by itself at the forge\'s next pass.')).toBeDefined();
    expect(within(panel).queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent))
      .toEqual(['Close the job panel']);
  });

  test('an answer, a decision and never each say so in words, with no Resume', () => {
    const waits = [['answer', 'Resumes once its question is answered.'], ['decision', 'Resumes once its decision is answered.'], ['never', 'No resume restarts it.']] as const;
    for (const [waitsFor, words] of waits) {
      renderAgents([interruptedBy('network-outage', waitsFor)], { selectedJobId: 'J12' });
      expect(screen.getByText(words)).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();
      cleanup();
    }
  });
});

describe('the foot and the project row', () => {
  test('the foot names the jobs the figure counts and the tickets in progress no job works on, each linked to its place', () => {
    renderAgents([BUILD_JOB, REVIEW_JOB]);
    const foot = card('Agents').querySelector<HTMLElement>('.agents-reconciliation');
    if (foot === null) throw new Error('no foot');
    expect(foot.textContent).toBe('2 / 5 workers counts builder and reviewer jobs (J12, J14).·2 tickets in progress have no Hephaestus job: #010 #002·'
      + 'Subagents, intake and the Assistant never take a place.');
    expect(within(foot).getByRole('link', { name: 'J14' }).getAttribute('href')).toBe(boardHrefOf('agents/J14'));
    expect(within(foot).getByRole('link', { name: '#010' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/010'));
    expect(card('Agents').querySelector('.agents-project-line')?.textContent).toBe('Example Storefront2 / 5workersagents at most2 jobs here · 2 tickets in progress have no job');
    expect(within(card('Agents')).getByRole('img', { name: '2 worker jobs against a limit of 5' })).toBeDefined();
  });

  test('the slot figure reads over the limit past it', () => {
    renderAgents([BUILD_JOB, REVIEW_JOB], { launchSlots: { ...LAUNCH_SLOTS, limit: 1 } });
    expect(card('Agents').querySelector('.agents-slot-figure')?.hasAttribute('data-over')).toBe(true);
  });
});

describe('the time since the last tool call', () => {
  test('ticks each second with the tool\'s name and "running" while the call has no result', () => {
    const { clock, advance } = fakeClock();
    const { rerender } = renderAgents([BUILD_JOB], { clock });
    expect(cellOf(jobRow('J12'), 'last-tool').textContent).toBe('Bashrunning5s');
    advance(2);
    expect(cellOf(jobRow('J12'), 'last-tool').textContent).toBe('Bashrunning7s');
    advance(60);
    expect(cellOf(jobRow('J12'), 'last-tool').textContent).toBe('Bashrunning1m 07s');
    rerender([{ ...BUILD_JOB, live: { ...LIVE, lastToolCall: { toolName: 'Bash', startedAt: STARTED_AT, running: false } } }]);
    expect(cellOf(jobRow('J12'), 'last-tool').textContent).toBe('Bash1m 07s');
  });

  test('takes the warning tint only while the job\'s silent sweeps are above zero, however long the time grows', () => {
    const { clock, leap } = fakeClock();
    const { rerender } = renderAgents([BUILD_JOB], { clock });
    const tinted = () => jobRow('J12').querySelector('.agents-elapsed')?.classList.contains('agents-elapsed-silent');
    leap(3600);
    expect(cellOf(jobRow('J12'), 'last-tool').textContent).toBe('Bashrunning1h 00m 05s');
    expect(tinted()).toBe(false);
    rerender([{ ...BUILD_JOB, live: { ...LIVE, silentSweeps: 1 } }]);
    expect(tinted()).toBe(true);
    rerender([{ ...BUILD_JOB, live: { ...LIVE, silentSweeps: 0 } }]);
    expect(tinted()).toBe(false);
  });
});

describe('the transcript', () => {
  test('replays history then follows, renders agent markup as text, and resumes after its last cursor when the panel is reopened', () => {
    const transcripts = fakeTranscripts();
    const { rerender } = renderAgents([BUILD_JOB], { selectedJobId: 'J12', transcripts });
    expect(transcripts.opened).toEqual([{ jobId: 'J12', after: null }]);
    transcripts.deliver([transcriptEntry({
      cursor: '1.1', entryKey: '1.1.0', role: 'assistant', text: '<b>Reading</b> the ticket.'
    })]);
    transcripts.deliver([transcriptEntry({
      cursor: '1.2', entryKey: '1.2.0', role: 'tool-call', text: '{"command":"ls"}', toolName: 'Bash'
    })]);
    const texts = () => [...document.querySelectorAll('.board-transcript-text')].map((text) => text.textContent);
    expect(texts()).toEqual(['<b>Reading</b> the ticket.', 'Bash']);
    expect(document.querySelector('.board-transcript b')).toBeNull();
    rerender([BUILD_JOB], null);
    rerender([BUILD_JOB], 'J12');
    expect(transcripts.opened.at(-1)).toEqual({ jobId: 'J12', after: '1.2' });
    expect(texts()).toEqual(['<b>Reading</b> the ticket.', 'Bash']);
  });
});

describe('the controls', () => {
  test('Message, Answer, Wind down, Stop and Fresh agent post their board commands', async () => {
    const { sent } = renderAgents([{ ...BUILD_JOB, state: 'waiting-for-answer' }], { selectedJobId: 'J12', decisions: [exampleAskingDecision({ id: 'D3', jobId: 'J12' })] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Rebase first.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'Use the shared helper.' } });
    for (const name of ['Send message', 'Send answer', 'Wind down', 'Stop', 'Fresh agent']) await clicked(name);
    expect(sent).toEqual([
      {
        ...COMMAND_VERSION, kind: 'job-message', jobId: 'J12', text: 'Rebase first.', pictures: [], incidentId: null
      },
      {
        ...COMMAND_VERSION, kind: 'decision-answer', decisionId: 'D3', answer: { form: 'text', text: 'Use the shared helper.' }
      },
      {
        ...COMMAND_VERSION, kind: 'job-stop', jobId: 'J12', mode: 'wind-down'
      },
      {
        ...COMMAND_VERSION, kind: 'job-stop', jobId: 'J12', mode: 'stop'
      },
      {
        ...COMMAND_VERSION, kind: 'job-fresh', jobId: 'J12', incidentId: null
      },
    ]);
  });

  test('the stop modes and Fresh agent are offered only as the forge offers them', () => {
    renderAgents([{ ...BUILD_JOB, offers: { stopModes: ['stop'], takesFresh: false, takesMessage: true } }], { selectedJobId: 'J12' });
    const controls = screen.getByRole('group', { name: 'Job controls' });
    expect(within(controls).getAllByRole('button').map((button) => button.textContent)).toEqual(['Stop']);
  });

  test('Send message and Send answer stay disabled while their field is empty, and clear the field once applied', async () => {
    renderAgents([{ ...BUILD_JOB, state: 'waiting-for-answer' }], { selectedJobId: 'J12', decisions: [exampleAskingDecision({ id: 'D3', jobId: 'J12' })] });
    const messageField = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
    const answerField = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Answer' });
    fireEvent.change(messageField, { target: { value: '   ' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send message' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send answer' }).disabled).toBe(true);
    fireEvent.change(messageField, { target: { value: 'Rebase first.' } });
    fireEvent.change(answerField, { target: { value: 'Use the shared helper.' } });
    await clicked('Send message');
    await clicked('Send answer');
    expect(messageField.value).toBe('');
    expect(answerField.value).toBe('');
  });

  test('an answer half typed to one decision is dropped once the job opens another, so Send answer never posts it to that one', async () => {
    const jobs = [{ ...BUILD_JOB, state: 'waiting-for-answer' as const }];
    const firstAsk = agentsSurroundingsOf({ selectedJobId: 'J12', decisions: [exampleAskingDecision({ id: 'D3', jobId: 'J12' })] });
    const secondAsk = agentsSurroundingsOf({ selectedJobId: 'J12', decisions: [exampleAskingDecision({ id: 'D4', jobId: 'J12' })] });
    const { rerender } = render(firstAsk.view(jobs, 'J12'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'Use the shared helper.' } });
    rerender(secondAsk.view(jobs, 'J12'));
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Answer' }).value).toBe('');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send answer' }).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'Keep the old helper.' } });
    await clicked('Send answer');
    expect([...firstAsk.sent, ...secondAsk.sent]).toEqual([{
      ...COMMAND_VERSION, kind: 'decision-answer', decisionId: 'D4', answer: { form: 'text', text: 'Keep the old helper.' }
    }]);
  });

  test('Answer is offered only while one of the job\'s decisions is open', () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
  });

  test('a refusal shows its worded text beside the control', async () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12', outcome: { verdict: 'refused', refusal: 'Job J12 is not running: it is in-customs.' } });
    await clicked('Fresh agent');
    expect(screen.getByRole('status').textContent).toBe('Job J12 is not running: it is in-customs.');
  });
});

describe('the concurrency limit', () => {
  test('the project row offers the concurrency control, Set only once the number differs, and posts the limit asked for', async () => {
    const { sent } = renderAgents([BUILD_JOB], { concurrencyLimit: 4 });
    const projectRow = card('Agents').querySelector<HTMLElement>('.agents-project-row');
    if (projectRow === null) throw new Error('no project row');
    const field = within(projectRow).getByLabelText<HTMLInputElement>('Concurrency limit');
    expect([field.value, field.min, field.max]).toEqual(['4', '1', '12']);
    expect(within(projectRow).queryByRole('button', { name: 'Set' })).toBeNull();
    act(() => {
      fireEvent.change(field, { target: { value: '6' } });
    });
    await clicked('Set');
    expect(sent).toEqual([{ ...COMMAND_VERSION, kind: 'concurrency-set', limit: 6 }]);
  });

  test('a limit past the forge\'s ceiling offers no Set', () => {
    renderAgents([BUILD_JOB], { concurrencyLimit: 4 });
    act(() => {
      fireEvent.change(screen.getByLabelText('Concurrency limit'), { target: { value: '13' } });
    });
    expect(screen.queryByRole('button', { name: 'Set' })).toBeNull();
  });

  test('a refused limit shows the forge\'s words beside Set', async () => {
    renderAgents([BUILD_JOB], { concurrencyLimit: 4, outcome: { verdict: 'refused', refusal: 'The example limit is out of range.' } });
    act(() => {
      fireEvent.change(screen.getByLabelText('Concurrency limit'), { target: { value: '6' } });
    });
    await clicked('Set');
    expect(screen.getByRole('status').textContent).toBe('The example limit is out of range.');
  });
});

describe('the title row and the job panel', () => {
  test('the view opens with its title and lead sentence, and shows no panel while no job is selected', () => {
    renderAgents([BUILD_JOB]);
    expect(screen.getAllByRole('heading', { level: 2, name: 'Agents' })[0]?.dataset['typeRole']).toBe('display');
    expect(screen.getByText('The agents at work on this board. Select a job to read its transcript and steer it.')).toBeDefined();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  test('the panel names the job and its state, and holds one Flint slot', () => {
    renderAgents([BUILD_JOB, REVIEW_JOB], { selectedJobId: 'J14' });
    const panel = screen.getByRole('complementary', { name: 'Job J14' });
    const flint = within(panel).getByRole('img', { name: 'Flint, the selected job\'s agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['112', 'lane']);
    expect(panel.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
    expect(within(panel).getByRole('heading', { level: 2, name: 'Job' })).toBeDefined();
    expect(within(panel).getByText('attempt 1')).toBeDefined();
  });

  test('the panel\'s Flint slot cues Flint from the selected job: idle once it waits on User, reviewing once its reviewer runs again', () => {
    const { view } = agentsSurroundingsOf({});
    const scene = flintHabitatSceneOf<readonly AgentJobDocument[]>({
      storedHabitatKind: 'agent-job-slot',
      viewOf:            (shownJobs) => view(shownJobs, 'J14'),
      firstProps:        [BUILD_JOB, REVIEW_JOB],
      placeView:         () => placeAt(elementOf('.design-system-flint-slot'), 100, 100, 112, 112),
    });
    expect(scene.cuesReceived(() => scene.show([BUILD_JOB, { ...REVIEW_JOB, state: 'waiting-for-answer' }]))).toEqual(['agent-is-idle']);
    expect(scene.cuesReceived(() => scene.show([BUILD_JOB, REVIEW_JOB]))).toEqual(['agent-reviews']);
  });

  test('under the question panel, which holds the page\'s one Flint slot, the job panel shows none', () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12', questionPanelIsShown: true });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(panel.querySelectorAll('.design-system-flint-slot')).toHaveLength(0);
    expect(within(panel).getByText('attempt 1')).toBeDefined();
  });

  test('a builder\'s panel says how long ago the job launched, and links the job\'s tickets', () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(within(panel).getByText('running · 5s')).toBeDefined();
    expect(within(panel).getByRole('link', { name: /#042/ }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/042'));
    expect(within(panel).getByText('calls · 48,000 tokens')).toBeDefined();
  });

  test('the foot sends a message with the paper-plane Send, and a job the forge offers no message takes none', async () => {
    const { sent } = renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    const field = within(panel).getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
    expect(field.getAttribute('placeholder')).toBe('Message J12. It reads it after its next call.');
    fireEvent.change(field, { target: { value: 'Rebase first.' } });
    await clicked('Send message');
    expect(sent).toEqual([{
      ...COMMAND_VERSION, kind: 'job-message', jobId: 'J12', text: 'Rebase first.', pictures: [], incidentId: null
    }]);
    cleanup();
    renderAgents([MERGE_JOB], { selectedJobId: 'J20' });
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull();
  });

  test('a message half typed to one job is dropped once another job is selected, so Send never posts it to that job', () => {
    const { sent, rerender } = renderAgents([BUILD_JOB, REVIEW_JOB], { selectedJobId: 'J12' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Rebase first.' } });
    rerender([BUILD_JOB, REVIEW_JOB], 'J14');
    const panel = screen.getByRole('complementary', { name: 'Job J14' });
    expect(within(panel).getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' }).value).toBe('');
    expect(within(panel).getByRole<HTMLButtonElement>('button', { name: 'Send message' }).disabled).toBe(true);
    expect(sent).toEqual([]);
  });

  test('× routes the panel closed, and the panel slides out once the route drops the job', () => {
    const { followed, rerender } = renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    fireEvent.click(screen.getByRole('button', { name: 'Close the job panel' }));
    expect(followed).toEqual([boardHrefOf('agents')]);
    rerender([BUILD_JOB], null);
    expect(screen.queryByRole('complementary', { name: 'Job J12' })).toBeNull();
  });
});

describe('the Agents tab on the board', () => {
  test('draws the view itself, and reads the board again after a change, so a job\'s row moves', async () => {
    let handlers: EventStreamHandlers | null = null;
    const servingPipeline = pipelineBoardStateOf('A5').pipeline;
    const boards = [BUILD_JOB, { ...BUILD_JOB, live: { ...LIVE, calls: 13 } }].map((job) => ({ ...boardOf([job], {}), pipeline: servingPipeline }));
    let reads = 0;
    render(<BoardApp
      services={{
        trackerId:           FIXTURE_TRACKER_ID,
        commandClient:       { send: () => Promise.resolve({ verdict: 'unreachable' }) },
        pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' }) },
        readBoard:           () => {
          const board = boards[Math.min(reads, boards.length - 1)] ?? boardOf([], {});
          reads += 1;
          return Promise.resolve({ verdict: 'read', board });
        },
        openEventStream: (streamHandlers) => {
          handlers = streamHandlers;
          return { close: () => undefined };
        },
        followTranscript: () => ({ close: () => undefined }),
        followProfileLog: () => () => undefined,
        storage:          () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
        now:              () => new Date('2026-10-29T20:00:05Z'),
        questionNotifier: {
          allowance:         () => 'denied',
          askAllowance:      () => Promise.resolve('denied'),
          notify:            () => undefined,
          setDocumentTitle:  () => undefined,
          baseDocumentTitle: 'Example board',
        },
        goTo:             () => undefined,
        flintFrameSource: createManualFlintFrames().frameSource,
      }}
      route={{ tab: 'agents', item: null }}
      project="Example Storefront"
    />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(cellOf(jobRow('J12'), 'calls').textContent).toBe('12 / 150');
    const stream = (): EventStreamHandlers => {
      if (handlers === null) throw new Error('no event stream');
      return handlers;
    };
    await act(async () => {
      stream().onConnection('live');
      stream().onEvent({ boardVersion: 3, kind: 'board-changed' });
      await Promise.resolve();
    });
    expect(cellOf(jobRow('J12'), 'calls').textContent).toBe('13 / 150');
  });
});
