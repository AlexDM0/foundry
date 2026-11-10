/**
 * The Agents view in a happy-dom document, against a fake clock, a fake transcript stream and a fake command client. What matters: builder
 * and reviewer jobs sit under the project row of the worker card and sessions in their own card, so nothing that never takes a slot sits
 * under the slot meter; a job that asks User is marked and followed by its Asks User strip, whose Answer opens the decision on the
 * Questions tab; a row carries its raw state on its palette row with a quiet, watch-only or not-counted tag, its calls against its budget
 * as a meter, its subagents as squares (no subagent rows), its tickets as chips, and a `job` or `decision` event through the shell moves
 * it; diagnostics add four columns and take them away again; the foot names what the figure counts and the tickets in progress no job
 * works on; the Sessions head tallies each kind of session; each card has its own empty line; the elapsed time ticks each second, says
 * "running" while the call has no result, and is tinted only while silent sweeps are above zero; the transcript replays then follows,
 * resumes after its last cursor when reopened, and renders an agent's markup as text; each control posts its ControlCommand and shows a
 * refusal verbatim, a message or answer only when written, clearing its field once applied; a watch-only Watcher offers only Stop; and
 * the project row offers the concurrency limit, Set only once the number differs, and no limit control on a board that states none.
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

import type {
  BoardStateDocument,
  ConcurrencyDocument,
  IdentifiedRecord,
  LaunchSlotsDocument,
  OverseerIdentity
} from '../../@types/BoardStateDocument.ts';
import type { CommandOutcome, ControlCommandBody }                                         from '../../api/CommandClient.ts';
import type { EventStreamHandlers }                                                        from '../../api/EventStreamClient.ts';
import type { TranscriptEntryDocument, TranscriptStreamHandlers, TranscriptStreamOptions } from '../../api/TranscriptStreamClient.ts';
import { BridgeApp }                                                                       from '../../shell/BridgeApp.tsx';
import type { BridgeClock }                                                                from '../../shell/BridgeClock.ts';
import { ControlSurroundingsContext }                                                      from '../../shell/ControlAvailability.ts';
import { exampleAgentJob, exampleAskingDecision, exampleSubagent }                         from '../../testing/BoardStateFixture.ts';
import { DARK_MODE_QUESTION }                                                              from '../../testing/QuestionPanelFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                                        from '../../testing/TimestampSlicesFixture.ts';
import type { AgentJobDocument, JobLiveFactsDocument }                                     from './AgentJobDocument.ts';
import { AgentsView }                                                                      from './AgentsView.tsx';

const STARTED_AT = '2026-10-29T20:00:00Z';

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
    watcherProtocol:        1,
    watchOnly:              false,
  },
});

const LIVE: JobLiveFactsDocument = BUILD_JOB.live;

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

const LAUNCH_SLOTS: LaunchSlotsDocument = { limit: 5, slotJobIds: ['J12', 'J14'], inProgressTicketIdsWithoutJob: ['010', '002'] };

const TICKETS = [{ id: '042', title: 'Example gift card ignored' }, { id: '043', title: 'Example account pages dark mode' }];

interface FakeClock {
  readonly clock:   BridgeClock;
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
  readonly follow:  (jobId: string, handlers: TranscriptStreamHandlers, options?: TranscriptStreamOptions) => { close: () => void; lastCursor: () => string | null };
  readonly opened:  { jobId: string; after: string | null }[];
  readonly deliver: (entries: readonly TranscriptEntryDocument[]) => void;
}

function fakeTranscripts(): FakeTranscripts {
  const opened: { jobId: string; after: string | null }[] = [];
  let handlers: TranscriptStreamHandlers | null = null;
  return {
    follow: (jobId, streamHandlers, options) => {
      opened.push({ jobId, after: options?.after ?? null });
      handlers = streamHandlers;
      return { close: () => undefined, lastCursor: () => null };
    },
    opened,
    deliver: (entries) => act(() => handlers?.onEntries(entries)),
  };
}

interface Rendered {
  readonly sent:     ControlCommandBody[];
  readonly rerender: (jobs: readonly AgentJobDocument[], selectedJobId?: string | null) => void;
}

interface RenderOptions {
  readonly selectedJobId?: string | null;
  readonly clock?:         BridgeClock;
  readonly transcripts?:   FakeTranscripts;
  readonly outcome?:       CommandOutcome;
  readonly decisions?:     readonly IdentifiedRecord[];
  readonly incidents?:     readonly IdentifiedRecord[];
  readonly launchSlots?:   LaunchSlotsDocument | null;
  readonly concurrency?:   ConcurrencyDocument | null;
}

function renderAgents(jobs: readonly AgentJobDocument[], options: RenderOptions = {}): Rendered {
  const sent: ControlCommandBody[] = [];
  const surroundings = {
    availability:  'enabled' as const,
    commandClient: {
      send: (command: ControlCommandBody) => {
        sent.push(command);
        return Promise.resolve(options.outcome ?? { verdict: 'applied' as const, outcome: 'done', result: null });
      },
    },
    onInstallHeld: () => undefined,
  };
  const clock = options.clock ?? fakeClock().clock;
  const transcripts = options.transcripts ?? fakeTranscripts();
  const view = (shownJobs: readonly AgentJobDocument[], selectedJobId: string | null) => (
    <ControlSurroundingsContext.Provider value={surroundings}>
      <AgentsView
        project="Example Storefront"
        jobs={shownJobs}
        decisions={options.decisions ?? []}
        incidents={options.incidents ?? []}
        launchSlots={options.launchSlots === undefined ? LAUNCH_SLOTS : options.launchSlots}
        concurrency={options.concurrency ?? null}
        tickets={TICKETS}
        selectedJobId={selectedJobId}
        clock={clock}
        timestampSlices={EXAMPLE_TIMESTAMP_SLICES}
        followTranscript={transcripts.follow}
      />
    </ControlSurroundingsContext.Provider>
  );
  const { rerender } = render(view(jobs, options.selectedJobId ?? null));
  return { sent, rerender: (shownJobs, selectedJobId = options.selectedJobId ?? null) => rerender(view(shownJobs, selectedJobId)) };
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
  window.location.hash = '';
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

  test('a row names its role and links its id to the job, and each ticket is a chip of its id and title linked to its ticket row', () => {
    renderAgents([BUILD_JOB, { ...REVIEW_JOB, ticketIds: ['043', '099'] }]);
    expect(cellOf(jobRow('J12'), 'job').textContent).toBe('BJ12builder');
    expect(within(jobRow('J12')).getByRole('link', { name: 'J12' }).getAttribute('href')).toBe('#agents/J12');
    const chip = within(jobRow('J12')).getByRole('link', { name: '#042 Example gift card ignored' });
    expect(chip.getAttribute('href')).toBe('#tickets/ticket-row/042');
    expect(cellOf(jobRow('J14'), 'job').textContent).toBe('RJ14reviewer');
    expect(within(jobRow('J14')).getByRole('link', { name: '#099' }).getAttribute('href')).toBe('#tickets/ticket-row/099');
  });

  test('a session\'s About names its intake\'s title linked to the intake, or the Assistant\'s open incidents', () => {
    renderAgents([ASSISTANT_JOB, INTAKE_JOB], { incidents: [{ id: 'I3' }] });
    const about = within(jobRow('J7')).getByRole('link', { name: 'Saved baskets' });
    expect(about.getAttribute('href')).toBe('#intake/J7');
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
    expect(within(strip).getByText('Asks User')).toBeDefined();
    expect(within(strip).getByText('E8')).toBeDefined();
    expect(within(strip).getByText('Should the example gift card skip payment?')).toBeDefined();
    expect(within(strip).getByText('blocks J14')).toBeDefined();
    expect(within(strip).getByText('9m 05s')).toBeDefined();
    advance(2);
    expect(within(strip).getByText('9m 07s')).toBeDefined();
    expect(within(strip).getByRole('link', { name: 'Answer' }).getAttribute('href')).toBe('#questions/E8');
    expect(within(card('Agents')).getByText('2 jobs · 1 asks User')).toBeDefined();
  });

  test('the Sessions head tallies live intake and Assistant jobs, those that wait on User, and the open incidents', () => {
    renderAgents([ASSISTANT_JOB, INTAKE_JOB, { ...INTAKE_JOB, id: 'J6' }], {
      decisions: [exampleAskingDecision({ id: 'E9', jobId: 'J7' })],
      incidents: [],
    });
    const intakeTally = within(card('Sessions')).getByRole('link', { name: /^Intake/ });
    expect(intakeTally.getAttribute('href')).toBe('#intake');
    expect(intakeTally.textContent).toBe('PIntake2live1 waits on User');
    const assistantTally = within(card('Sessions')).getByRole('link', { name: /^Assistant/ });
    expect(assistantTally.getAttribute('href')).toBe('#assistant');
    expect(assistantTally.textContent).toBe('AAssistant1live0 incidents open');
    expect(card('Sessions').querySelector('.agents-project-row')?.textContent).toBe('Example Storefront3 sessions · 1 waits on User');
  });
});

describe('a row\'s live facts', () => {
  test('the State cell shows the raw job state on its palette row, the quiet tag while silent sweeps are above zero, and the watch-only tag', () => {
    const { rerender } = renderAgents([BUILD_JOB, { ...REVIEW_JOB, state: 'in-customs' }]);
    expect(jobRow('J12').querySelector('.bridge-state-badge')?.getAttribute('data-state')).toBe('in-progress');
    expect(jobRow('J14').querySelector('.bridge-state-badge')?.getAttribute('data-state')).toBe('in-review');
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('running');
    rerender([{ ...BUILD_JOB, live: { ...LIVE, silentSweeps: 2, watchOnly: true } }]);
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('runningquiet 2 sweepswatch only');
    expect([...jobRow('J12').querySelectorAll('.bridge-tag')].map((tag) => tag.getAttribute('data-tone'))).toEqual(['warn', 'warn']);
    expect(within(card('Agents')).getByText('1 job · 1 quiet')).toBeDefined();
  });

  test('a worker the Overseer did not count, such as a roleless merge, is tagged not counted, and a session never is', () => {
    renderAgents([BUILD_JOB, exampleAgentJob({ id: 'J20', kind: 'merge', role: null }), ASSISTANT_JOB]);
    expect(cellOf(jobRow('J20'), 'state').textContent).toBe('runningnot counted');
    expect(jobRow('J20').querySelector('.bridge-tag')?.hasAttribute('data-dashed')).toBe(true);
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
  });

  test('Show diagnostics adds Phase, Tool calls, Silent sweeps and Watcher to both cards, and takes them away again', async () => {
    renderAgents([{ ...BUILD_JOB, airlock: { phase: 'gating' } }, ASSISTANT_JOB]);
    const toggle = screen.getByRole('button', { name: 'Show diagnostics' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(jobRow('J12').querySelector('td[data-column="watcher"]')).toBeNull();
    await clicked('Show diagnostics');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(headTextsOf(card('Agents')).slice(-4)).toEqual(['Phase', 'Tool calls', 'Silent sweeps', 'Watcher']);
    expect(headTextsOf(card('Sessions')).slice(-4)).toEqual(['Phase', 'Tool calls', 'Silent sweeps', 'Watcher']);
    expect(['phase', 'tool-calls', 'silent-sweeps', 'watcher'].map((column) => cellOf(jobRow('J12'), column).textContent))
      .toEqual(['gating', '7 (11 with subagents)', '0', 'protocol 1']);
    expect(jobRow('J12').nextElementSibling).toBeNull();
    await clicked('Show diagnostics');
    expect(jobRow('J12').querySelector('td[data-column="watcher"]')).toBeNull();
  });

  test('a job event and a decision event delivered through the shell replace the job\'s row and mark it asking', async () => {
    window.location.hash = '#agents';
    let handlers: EventStreamHandlers | null = null;
    const identity: OverseerIdentity = { trackerId: 'example-tracker', project: 'Example Agency', codeVersion: 'code-1' };
    const board: BoardStateDocument = {
      project: 'Example Agency', jobs: [BUILD_JOB], decisions: [], incidents: [], overseer: { state: 'serving', paused: false, codeVersion: 'code-1' }, usage: null,
    };
    render(<BridgeApp services={{
      commandClient:   { send: () => Promise.resolve({ verdict: 'unreachable' }) },
      openEventStream: (streamHandlers) => {
        handlers = streamHandlers;
        return { close: () => undefined };
      },
      fetchIdentity:        () => Promise.resolve(identity),
      reload:               () => undefined,
      storage:              () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
      embedded:             false,
      embeddedSurroundings: () => ({ window, parent: null, parentOrigin: null }),
      now:                  () => new Date('2026-10-29T20:00:05Z'),
      followTranscript:     () => ({ close: () => undefined }),
      questionNotifier:     {
        allowance:         () => 'denied',
        askAllowance:      () => Promise.resolve('denied'),
        notify:            () => undefined,
        setDocumentTitle:  () => undefined,
        baseDocumentTitle: 'agent-progress',
      },
    }} />);
    const stream = (): EventStreamHandlers => {
      if (handlers === null) throw new Error('no event stream');
      return handlers;
    };
    await act(async () => {
      stream().onConnection('live');
      stream().onEvent('board', board);
      await Promise.resolve();
    });
    expect(cellOf(jobRow('J12'), 'calls').textContent).toBe('12 / 150');
    act(() => stream().onEvent('job', { ...BUILD_JOB, state: 'waiting-for-answer', live: { ...LIVE, calls: 13 } }));
    expect(cellOf(jobRow('J12'), 'calls').textContent).toBe('13 / 150');
    expect(within(jobRow('J12')).getByText('waiting-for-answer')).toBeDefined();
    expect(jobRow('J12').hasAttribute('data-asking')).toBe(false);
    // Through the shell the event is a whole decision, as the Overseer serves it: the question panel reads every field.
    act(() => stream().onEvent('decision', { ...DARK_MODE_QUESTION, id: 'E8', jobId: 'J12' }));
    expect(jobRow('J12').hasAttribute('data-asking')).toBe(true);
    act(() => stream().onEvent('board', { ...board, jobs: [{ ...BUILD_JOB, live: { ...LIVE, calls: 14 } }] }));
    expect(jobRow('J12').hasAttribute('data-asking')).toBe(false);
  });
});

describe('the foot and the project row', () => {
  test('the foot names the jobs the figure counts and the tickets in progress no job works on, each linked to its place', () => {
    renderAgents([BUILD_JOB, REVIEW_JOB]);
    const foot = card('Agents').querySelector<HTMLElement>('.agents-reconciliation');
    if (foot === null) throw new Error('no foot');
    expect(foot.textContent).toBe('2 / 5 workers counts builder and reviewer jobs (J12, J14).·2 tickets in progress have no Overseer job: #010 #002·'
      + 'Subagents, intake and the Assistant never take a place.');
    expect(within(foot).getByRole('link', { name: 'J14' }).getAttribute('href')).toBe('#agents/J14');
    expect(within(foot).getByRole('link', { name: '#010' }).getAttribute('href')).toBe('#tickets/ticket-row/010');
    expect(card('Agents').querySelector('.agents-project-line')?.textContent).toBe('Example Storefront2 / 5workers2 jobs here · 2 tickets in progress have no job');
    expect(within(card('Agents')).getByRole('img', { name: '2 worker jobs against a limit of 5' })).toBeDefined();
  });

  test('the slot figure reads over the limit past it, and a board serving no launch slots shows no meter and marks no job', () => {
    renderAgents([BUILD_JOB, REVIEW_JOB], { launchSlots: { ...LAUNCH_SLOTS, limit: 1 } });
    expect(card('Agents').querySelector('.agents-slot-figure')?.hasAttribute('data-over')).toBe(true);
    cleanup();
    renderAgents([exampleAgentJob({ id: 'J20', kind: 'merge', role: null })], { launchSlots: null });
    expect(card('Agents').querySelector('.bridge-slot-meter')).toBeNull();
    expect(cellOf(jobRow('J20'), 'state').textContent).toBe('running');
    expect(card('Agents').querySelector('.agents-reconciliation')?.textContent).toBe('Subagents, intake and the Assistant never take a place.');
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
    transcripts.deliver([{
      cursor: '1.1', entryKey: '1.1.0', at: null, role: 'assistant', text: '<b>Reading</b> the ticket.'
    }]);
    transcripts.deliver([{
      cursor: '1.2', entryKey: '1.2.0', at: null, role: 'tool-call', text: '{"command":"ls"}', toolName: 'Bash'
    }]);
    const texts = () => [...document.querySelectorAll('.bridge-transcript-text')].map((text) => text.textContent);
    expect(texts()).toEqual(['<b>Reading</b> the ticket.', 'Bash']);
    expect(document.querySelector('.bridge-transcript b')).toBeNull();
    rerender([BUILD_JOB], null);
    rerender([BUILD_JOB], 'J12');
    expect(transcripts.opened.at(-1)).toEqual({ jobId: 'J12', after: '1.2' });
    expect(texts()).toEqual(['<b>Reading</b> the ticket.', 'Bash']);
  });
});

describe('the controls', () => {
  test('Message, Answer, Wind down, Stop and Fresh agent post their ControlCommands', async () => {
    const { sent } = renderAgents([{ ...BUILD_JOB, state: 'waiting-for-answer' }], { selectedJobId: 'J12', decisions: [exampleAskingDecision({ id: 'D3', jobId: 'J12' })] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Rebase first.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'Use the shared helper.' } });
    for (const name of ['Send message', 'Send answer', 'Wind down', 'Stop', 'Fresh agent']) await clicked(name);
    expect(sent).toEqual([
      { kind: 'job-message', jobId: 'J12', text: 'Rebase first.' },
      { kind: 'decision-answer', decisionId: 'D3', answer: { form: 'text', text: 'Use the shared helper.' } },
      { kind: 'job-stop', jobId: 'J12', mode: 'wind-down' },
      { kind: 'job-stop', jobId: 'J12', mode: 'stop' },
      { kind: 'job-fresh', jobId: 'J12' },
    ]);
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

  test('Answer is offered only while one of the job\'s decisions is open', () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
  });

  test('a refusal shows its worded text beside the control', async () => {
    renderAgents([BUILD_JOB], { selectedJobId: 'J12', outcome: { verdict: 'refused', refusal: 'Job J12 is not running: it is in-customs.' } });
    await clicked('Fresh agent');
    expect(screen.getByRole('status').textContent).toBe('Job J12 is not running: it is in-customs.');
  });

  test('a legacy Watcher shows "running on Watcher protocol N: watch only" in diagnostics and its controls offer only Stop', async () => {
    renderAgents([{ ...BUILD_JOB, live: { ...LIVE, watcherProtocol: 0, watchOnly: true } }], { selectedJobId: 'J12' });
    await clicked('Show diagnostics');
    expect(cellOf(jobRow('J12'), 'watcher').textContent).toBe('running on Watcher protocol 0: watch only');
    const controls = screen.getByRole('region', { name: 'Job J12' });
    expect(within(controls).getAllByRole('button').map((button) => button.textContent)).toEqual(['Stop']);
  });
});

describe('the concurrency limit', () => {
  test('the project row offers the concurrency control, Set only once the number differs, and posts the limit asked for', async () => {
    const { sent } = renderAgents([BUILD_JOB], { concurrency: { limit: 4, agentsInFlight: 1 } });
    const projectRow = card('Agents').querySelector<HTMLElement>('.agents-project-row');
    if (projectRow === null) throw new Error('no project row');
    expect(within(projectRow).getByLabelText<HTMLInputElement>('Concurrency limit').value).toBe('4');
    expect(within(projectRow).queryByRole('button', { name: 'Set' })).toBeNull();
    act(() => {
      fireEvent.change(screen.getByLabelText('Concurrency limit'), { target: { value: '6' } });
    });
    await clicked('Set');
    expect(sent).toEqual([{ kind: 'concurrency-set', limit: 6 }]);
  });

  test('a refused limit shows the Overseer\'s words beside Set', async () => {
    renderAgents([BUILD_JOB], { concurrency: { limit: 4, agentsInFlight: 1 }, outcome: { verdict: 'refused', refusal: 'The example limit is out of range.' } });
    act(() => {
      fireEvent.change(screen.getByLabelText('Concurrency limit'), { target: { value: '6' } });
    });
    await clicked('Set');
    expect(screen.getByRole('status').textContent).toBe('The example limit is out of range.');
  });

  test('a board that states no limit offers no concurrency control', () => {
    renderAgents([BUILD_JOB]);
    expect(screen.queryByLabelText('Concurrency limit')).toBeNull();
  });
});
