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
 * refusal verbatim, a message or answer only when written, clearing its field once applied, and an answer only to the decision it was
 * typed for; a watch-only Watcher offers only Stop; and
 * the project row offers the concurrency limit, Set only once the number differs, and no limit control on a board that states none. The
 * view opens with its title row; the selected job's side panel names the job and its state, holds one Flint slot (112, lane), cued by the
 * selected job while it runs and idle while it does not, unless the question panel covers it and holds the page's one slot, its facts, its
 * controls and its transcript, takes a message in its foot only where the job takes one, drops a half-typed message once another job is
 * selected, and × routes the panel closed. Flint's brain has its own card after the worker card, outside its slot meter and its count, in
 * each state the forge reports: starting and running with Stop, which posts `flint-brain-stop`, a running one counting down each second,
 * an ended or refused one in the forge's words; and none while it is off, on a forge without it or while its controls are hidden.
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
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';
import type { ReactElement }              from 'react';

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
import type { FlintBrainControls }                                                         from '../../flint/FlintBrainControls.ts';
import { BridgeApp }                                                                       from '../../shell/BridgeApp.tsx';
import type { BridgeClock }                                                                from '../../shell/BridgeClock.ts';
import { ControlSurroundingsContext }                                                      from '../../shell/ControlAvailability.ts';
import { QuestionPanelShownContext }                                                       from '../../shell/CoveringPanel.ts';
import { exampleAgentJob, exampleAskingDecision, exampleSubagent }                         from '../../testing/BoardStateFixture.ts';
import { exampleFlintBrain, OFF_FLINT_BRAIN, runningFlintBrain }                           from '../../testing/FlintBrainFixture.ts';
import { elementOf, flintHabitatSceneOf, placeAt }                                         from '../../testing/FlintHabitatScene.ts';
import { createManualFlintFrames }                                                         from '../../testing/ManualFlintFrames.ts';
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
  readonly selectedJobId?:        string | null;
  readonly clock?:                BridgeClock;
  readonly transcripts?:          FakeTranscripts;
  readonly outcome?:              CommandOutcome;
  readonly decisions?:            readonly IdentifiedRecord[];
  readonly incidents?:            readonly IdentifiedRecord[];
  readonly launchSlots?:          LaunchSlotsDocument | null;
  readonly concurrency?:          ConcurrencyDocument | null;
  /** The question panel shows over the view, holding the page's one Flint slot. */
  readonly questionPanelIsShown?: boolean;
  readonly flintBrain?:           MonitorFlintBrainDocument | null;
  readonly flintBrainControls?:   FlintBrainControls;
}

interface AgentsSurroundings {
  readonly sent: ControlCommandBody[];
  readonly view: (shownJobs: readonly AgentJobDocument[], selectedJobId: string | null) => ReactElement;
}

function agentsSurroundingsOf(options: RenderOptions): AgentsSurroundings {
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
      <QuestionPanelShownContext.Provider value={options.questionPanelIsShown ?? false}>
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
          flintBrain={options.flintBrain ?? null}
          {...(options.flintBrainControls === undefined ? {} : { flintBrainControls: options.flintBrainControls })}
        />
      </QuestionPanelShownContext.Provider>
    </ControlSurroundingsContext.Provider>
  );
  return { sent, view };
}

function renderAgents(jobs: readonly AgentJobDocument[], options: RenderOptions = {}): Rendered {
  const { sent, view } = agentsSurroundingsOf(options);
  const { rerender } = render(view(jobs, options.selectedJobId ?? null));
  return { sent, rerender: (shownJobs, selectedJobId = options.selectedJobId ?? null) => rerender(view(shownJobs, selectedJobId)) };
}

function card(name: 'Agents' | 'Sessions' | 'Flint\'s brain'): HTMLElement {
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

  test('a row names its role once, as its tile\'s image, and links its id to the job, and each ticket is a chip of its id and title linked to its ticket row', () => {
    renderAgents([BUILD_JOB, { ...REVIEW_JOB, ticketIds: ['043', '099'] }]);
    expect(cellOf(jobRow('J12'), 'job').textContent).toBe('J12builder');
    expect(within(jobRow('J12')).getAllByRole('img', { name: 'builder' }).map((image) => image.getAttribute('data-icon'))).toEqual(['hammer']);
    expect(within(jobRow('J12')).getByText('builder').getAttribute('aria-hidden')).toBe('true');
    expect(within(jobRow('J12')).getByRole('link', { name: 'J12' }).getAttribute('href')).toBe('#agents/J12');
    const chip = within(jobRow('J12')).getByRole('link', { name: '#042 Example gift card ignored' });
    expect(chip.getAttribute('href')).toBe('#tickets/ticket-row/042');
    expect(cellOf(jobRow('J14'), 'job').textContent).toBe('J14reviewer');
    expect(within(jobRow('J14')).getByRole('img', { name: 'reviewer' }).getAttribute('data-icon')).toBe('magnifier');
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
    expect(within(strip).getByText('Your decision')).toBeDefined();
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
    expect(intakeTally.textContent).toBe('Intake2live1 waits on User');
    expect(within(intakeTally).getByRole('img', { name: 'Intake' }).getAttribute('data-icon')).toBe('inbox');
    const assistantTally = within(card('Sessions')).getByRole('link', { name: /^Assistant/ });
    expect(assistantTally.getAttribute('href')).toBe('#assistant');
    expect(assistantTally.textContent).toBe('Assistant1live0 incidents open');
    expect(within(assistantTally).getByRole('img', { name: 'Assistant' }).getAttribute('data-icon')).toBe('lifebuoy');
    expect(card('Sessions').querySelector('.agents-project-row')?.textContent).toBe('Example Storefront3 sessions · 1 waits on User');
  });
});

describe('a row\'s live facts', () => {
  test('the State cell shows the raw job state on its palette row, the quiet tag while silent sweeps are above zero, and the watch-only tag', () => {
    const { rerender } = renderAgents([BUILD_JOB, { ...REVIEW_JOB, state: 'in-customs' }]);
    expect(jobRow('J12').querySelector('.design-system-state-badge')?.getAttribute('data-state-tone')).toBe('accent');
    expect(jobRow('J14').querySelector('.design-system-state-badge')?.getAttribute('data-state-tone')).toBe('info-outline');
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('running');
    rerender([{ ...BUILD_JOB, live: { ...LIVE, silentSweeps: 2, watchOnly: true } }]);
    expect(cellOf(jobRow('J12'), 'state').textContent).toBe('runningquiet 2 sweepswatch only');
    expect([...jobRow('J12').querySelectorAll('.design-system-tag')].map((tag) => tag.getAttribute('data-tone'))).toEqual(['warn', 'warn']);
    expect(within(card('Agents')).getByText('1 job · 1 quiet')).toBeDefined();
  });

  test('a worker the Overseer did not count, such as a roleless merge, is tagged not counted, and a session never is', () => {
    renderAgents([BUILD_JOB, exampleAgentJob({ id: 'J20', kind: 'merge', role: null }), ASSISTANT_JOB]);
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
      embedMode:            null,
      embeddedSurroundings: () => ({ window, parent: null, parentOrigin: null }),
      now:                  () => new Date('2026-10-29T20:00:05Z'),
      followTranscript:     () => ({ close: () => undefined }),
      followProfileLog:     () => () => undefined,
      questionNotifier:     {
        allowance:         () => 'denied',
        askAllowance:      () => Promise.resolve('denied'),
        notify:            () => undefined,
        setDocumentTitle:  () => undefined,
        baseDocumentTitle: 'agent-progress',
      },
      flintFrameSource: createManualFlintFrames().frameSource,
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
    expect(card('Agents').querySelector('.design-system-slot-meter')).toBeNull();
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
    expect([...firstAsk.sent, ...secondAsk.sent]).toEqual([{ kind: 'decision-answer', decisionId: 'D4', answer: { form: 'text', text: 'Keep the old helper.' } }]);
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
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    expect(within(panel).getByRole('group', { name: 'Job controls' }).textContent).toBe('Stop');
    expect(within(panel).queryByRole('textbox', { name: 'Message' })).toBeNull();
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
    expect(within(panel).getByRole('link', { name: /#042/ }).getAttribute('href')).toBe('#tickets/ticket-row/042');
    expect(within(panel).getByText('calls · 48,000 tokens')).toBeDefined();
  });

  test('the foot sends a message with the paper-plane Send, and a job without a role takes none', async () => {
    const { sent } = renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    const panel = screen.getByRole('complementary', { name: 'Job J12' });
    const field = within(panel).getByRole<HTMLTextAreaElement>('textbox', { name: 'Message' });
    expect(field.getAttribute('placeholder')).toBe('Message J12. It reads it after its next call.');
    fireEvent.change(field, { target: { value: 'Rebase first.' } });
    await clicked('Send message');
    expect(sent).toEqual([{ kind: 'job-message', jobId: 'J12', text: 'Rebase first.' }]);
    cleanup();
    renderAgents([exampleAgentJob({ id: 'J20', kind: 'merge', role: null })], { selectedJobId: 'J20' });
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
    window.location.hash = '#agents/J12';
    const { rerender } = renderAgents([BUILD_JOB], { selectedJobId: 'J12' });
    fireEvent.click(screen.getByRole('button', { name: 'Close the job panel' }));
    expect(window.location.hash).toBe('#agents');
    rerender([BUILD_JOB], null);
    expect(screen.queryByRole('complementary', { name: 'Job J12' })).toBeNull();
  });
});

describe('Flint\'s brain\'s card', () => {
  const RUNNING = runningFlintBrain('2026-10-29T20:00:00Z', '2026-10-29T20:02:00Z');

  function brainRow(): HTMLElement {
    const row = card('Flint\'s brain').querySelector<HTMLElement>('.agents-brain-row');
    if (row === null) throw new Error('no brain row');
    return row;
  }

  test('a running brain has its own card after the worker card, outside its slot meter and its count, with its facts and Stop', () => {
    const clock = fakeClock();
    renderAgents([BUILD_JOB], { flintBrain: RUNNING, clock: clock.clock });
    const cards = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(cards).toEqual(['Agents', 'Flint\'s brain', 'Sessions']);
    expect(brainRow().getAttribute('data-state')).toBe('running');
    expect(brainRow().textContent).toBe('Runninghaiku · low1.2k tokens3 calls1m 55s leftStop');
    expect(card('Agents').textContent).not.toContain('Flint');
    expect(card('Agents').querySelector('.agents-slot-figure')?.textContent).toBe('2 / 5');
    clock.advance(5);
    expect(brainRow().querySelector('.agents-brain-countdown')?.textContent).toBe('1m 50s left');
  });

  test('with the brain\'s controls hidden, a running brain shows no card, so no Stop', () => {
    renderAgents([BUILD_JOB], { flintBrain: RUNNING, flintBrainControls: 'hidden' });
    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(['Agents', 'Sessions']);
    expect(screen.queryByRole('button', { name: 'Stop Flint\'s brain' })).toBeNull();
  });

  test('Stop posts flint-brain-stop, also while the brain starts', async () => {
    const running = renderAgents([], { flintBrain: RUNNING });
    await clicked('Stop Flint\'s brain');
    expect(running.sent).toEqual([{ kind: 'flint-brain-stop' }]);
    cleanup();
    const starting = renderAgents([], { flintBrain: exampleFlintBrain({ state: 'starting', startedBy: 'api' }) });
    expect(brainRow().textContent).toBe('StartingStop');
    await clicked('Stop Flint\'s brain');
    expect(starting.sent).toEqual([{ kind: 'flint-brain-stop' }]);
  });

  test('an ended brain and a refused one read the forge\'s words and offer no Stop', () => {
    renderAgents([], {
      flintBrain: exampleFlintBrain({
        state: 'ended', endedReason: 'time', tokens: 4000, calls: 9, model: 'haiku', effort: 'low', sentence: 'Flint\'s brain stopped after 2:00'
      }),
    });
    expect(brainRow().textContent).toBe('Endedhaiku · low4k tokens9 callsFlint\'s brain stopped after 2:00');
    expect(screen.queryByRole('button', { name: 'Stop Flint\'s brain' })).toBeNull();
    cleanup();
    const sentence = 'The Overseer is paused, so Flint\'s brain does not start.';
    renderAgents([], { flintBrain: exampleFlintBrain({ state: 'refused', sentence, refusal: { code: 'overseer-paused', sentence } }) });
    expect([brainRow().getAttribute('data-state'), brainRow().textContent]).toEqual(['refused', `Refused${sentence}`]);
    expect(screen.queryByRole('button', { name: 'Stop Flint\'s brain' })).toBeNull();
  });

  test('a brain that is off, and a forge without one, show no card', () => {
    renderAgents([BUILD_JOB], { flintBrain: OFF_FLINT_BRAIN });
    expect(screen.queryByRole('region', { name: 'Flint\'s brain' })).toBeNull();
    cleanup();
    renderAgents([BUILD_JOB]);
    expect(screen.queryByRole('region', { name: 'Flint\'s brain' })).toBeNull();
  });
});
