/**
 * The open phase in a happy-dom document, over the pipeline fixtures. What matters: its header says when the phase leaves, and Merge ends
 * on main; the Ticket phase says what makes a draft ready; the smallest pipeline draws an add card only where the facts name a missing
 * step, whose choices send their edit or ask for the Gate dialog; the merge before review is an Automatic step that opens nothing and
 * keeps its derived meter focusable; a double-click or Enter asks for what a step opens (Ticket creation its agent dialog) and never sends
 * a command; a switch sends its edit, and on a live board sends `pipeline-update-start` first and the edit once the update record shows;
 * a refusal shows verbatim, and after it the next gesture's edit goes to a record opened elsewhere; a live step says its state and links
 * the tickets on it; the live Merge header names the ticket the Airlock lets onto main, the fast-forward's too, and the queued ones; an
 * editing step carries its change; a question pill asks for the question. The Ticket phase offers how a ticket is written: a press on
 * the other route sends one `ticket-writing` edit and a press on the chosen one sends nothing; the spec-then-plan route draws its four
 * steps, each writing step naming its document, and says a ticket needs the spec's Acceptance, an approved spec and an approved plan; and
 * the stylesheet lets four step cards and their three arrows share one row of a phase beside the agent's panel at 1440 px.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import {
  act,
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useEffect, useState } from 'react';

import type { BoardDocument }                                                from '../../../../@types/board/BoardDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                  from '../../../testing/FakeControls.ts';
import { onBoard }                                                           from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, type PipelineFixtureName, withPipelineFacts } from '../../../testing/PipelineFixture.ts';
import type { FlowSelection, FlowWorkspaceOpenRequest }                      from './FlowSelection.ts';
import { OpenPhase }                                                         from './OpenPhase.tsx';
import type { PipelinePhase }                                                from './PipelinePhaseModel.ts';

afterEach(cleanup);

const PIPELINE_STYLESHEET_PATH = join(import.meta.dir, '..', '..', '..', '..', 'styles', 'board', 'pipeline.css');

/** The width of a phase's step row inside Gaia's shell at 1440 px, beside the pipeline agent's panel. */
const STEP_ROW_WIDTH_AT_1440_PIXELS = 694;

/** The declarations of the stylesheet's rule with exactly this selector, by property. */
function declarationsOf(stylesheetText: string, selector: string): ReadonlyMap<string, string> {
  const ruleStart = stylesheetText.indexOf(`\n${selector} {`);
  if (ruleStart === -1) throw new Error(`pipeline.css has no rule ${selector}`);
  const body = stylesheetText.slice(stylesheetText.indexOf('{', ruleStart) + 1, stylesheetText.indexOf('}', ruleStart));
  return new Map(body.split(';').map((declaration) => declaration.split(':').map((part) => part.trim())).filter((parts) => parts.length === 2)
    .map(([property, value]) => [property ?? '', value ?? '']));
}

function pixelsOf(value: string | undefined): number {
  return Number.parseFloat(value ?? 'NaN');
}

function selectionAt(openPhase: PipelinePhase, opened: FlowWorkspaceOpenRequest[], phasesOpened: PipelinePhase[]): FlowSelection {
  return {
    openRequest:     null,
    openPhase,
    shownItem:       null,
    scrollRequest:   null,
    open:            (request) => opened.push(request),
    close:           () => undefined,
    openPhaseOf:     (phase) => phasesOpened.push(phase),
    showOnFlow:      () => undefined,
    applyIsAskedFor: () => false,
    askApply:        () => undefined,
    closeApply:      () => undefined,
  };
}

interface PhaseHarnessProps {
  readonly initial:   BoardDocument;
  readonly selection: FlowSelection;
  readonly onFacts:   (showFacts: (facts: BoardDocument) => void) => void;
}

/** Lets a spec show the phase new facts later, as the event stream would. */
function PhaseHarness({ initial, selection, onFacts }: PhaseHarnessProps) {
  const [facts, setFacts] = useState(initial);
  useEffect(() => onFacts(setFacts), [onFacts]);
  const flow = facts.pipeline.flow ?? null;
  return flow === null ? null : <OpenPhase facts={facts} flow={flow} selection={selection} />;
}

function renderPhase(name: PipelineFixtureName, phase: PipelinePhase, initial: BoardDocument = pipelineBoardStateOf(name)) {
  const controls = fakeControls();
  const opened: FlowWorkspaceOpenRequest[] = [];
  const phasesOpened: PipelinePhase[] = [];
  const handle = { showFacts: (_facts: BoardDocument): void => undefined };
  controls.render(onBoard(<PhaseHarness initial={initial} selection={selectionAt(phase, opened, phasesOpened)} onFacts={(showFacts) => { handle.showFacts = showFacts; }} />));
  return {
    controls, opened, phasesOpened, handle
  };
}

function stepOf(nodeId: string): HTMLElement {
  const step = document.querySelector<HTMLElement>(`[data-step-node-id="${nodeId}"]`);
  if (step === null) throw new Error(`no step ${nodeId}`);
  return step;
}

describe('the header', () => {
  test('a phase says when it leaves and its Next button opens the next phase; Merge ends on main', async () => {
    const { phasesOpened } = renderPhase('A2', 'build');
    const phase = screen.getByRole('region', { name: 'Phase 2: Build' });
    expect(within(phase).getByRole('heading', { name: 'Build' })).toBeDefined();
    expect(within(phase).getByText('all build gates are green')).toBeDefined();
    await clickSettled(within(phase).getByRole('button', { name: 'Next: Review' }));
    expect(phasesOpened).toEqual(['review']);
    cleanup();
    renderPhase('A2', 'merge');
    expect(screen.getByText('Done on main')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();
    expect(document.querySelector('[data-step-node-id="fast-forward-main"]')).toBeNull();
  });

  test('the Ticket phase has no gates and says what makes a draft ready', () => {
    renderPhase('A2', 'ticket');
    const readiness = screen.getByRole('region', { name: 'What makes a draft ready' });
    expect([...readiness.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      'A numbered AcceptanceEach line is one check the change must pass.',
      'A BriefAt least one line. It is the builder\'s brief.',
    ]);
    expect(screen.queryByRole('region', { name: /gates$/ })).toBeNull();
  });
});

describe('the smallest pipeline', () => {
  test('draws an add card only where the facts name one, and its one merge stands in the Merge phase', () => {
    renderPhase('A7', 'build');
    expect(screen.getAllByRole('region', { name: /^Add / }).map((card) => card.getAttribute('aria-label'))).toEqual(['Add after the Builder']);
    cleanup();
    renderPhase('A7', 'merge');
    expect(screen.getAllByText('Merge main into the tree')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Add before the fast-forward' })).toBeDefined();
  });

  test('choosing Review on the add card sends the review edit to the open record', async () => {
    const { controls } = renderPhase('A7', 'build');
    await clickSettled(screen.getByRole('button', { name: 'Review' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S2',
      draftRevision: 7,
      edits:         [{ target: 'review', value: { name: 'review', reReview: null } }],
      isACopy:       false,
    }]);
  });

  test('choosing Build gates asks for the Gate dialog in the build phase and sends nothing', async () => {
    const { controls, opened } = renderPhase('A7', 'build');
    await clickSettled(within(screen.getByRole('region', { name: 'Add after the Builder' })).getByRole('button', { name: 'Build gates' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'build' }]);
    expect(controls.sent).toEqual([]);
  });
});

describe('the merge before review', () => {
  test('is an Automatic step that opens nothing, and its derived meter keeps the focus and names the builder in its tooltip', () => {
    const { opened } = renderPhase('flow-merge-before-review', 'build');
    const step = stepOf('merge-before-review');
    expect(within(step).getByText('Automatic')).toBeDefined();
    expect([step.getAttribute('tabindex'), step.getAttribute('aria-haspopup')]).toEqual([null, null]);
    fireEvent.doubleClick(step);
    expect(opened).toEqual([]);
    const meter = within(step).getByRole('img');
    expect(meter.getAttribute('tabindex')).toBe('0');
    expect(document.getElementById(meter.getAttribute('aria-describedby') ?? '')?.textContent).toContain('Derived from the builder');
  });
});

describe('opening steps', () => {
  test('a double-click or Enter asks for what the step opens: Ticket creation and the Builder their agent dialog', () => {
    const { opened } = renderPhase('A2', 'ticket');
    fireEvent.doubleClick(stepOf('ticket-creation'));
    cleanup();
    const build = renderPhase('A2', 'build');
    fireEvent.keyDown(stepOf('builder'), { key: 'Enter' });
    fireEvent.doubleClick(stepOf('gates-build'));
    expect([...opened, ...build.opened]).toEqual([
      { kind: 'node', nodeId: 'ticket-creation', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } },
      { kind: 'node', nodeId: 'builder', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } },
      { kind: 'node', nodeId: 'gates-build', action: { kind: 'gates-tab', phase: 'build' } },
    ]);
  });

  test('a re-review is a dashed, conditional step that opens the review dialog at its re-review section', () => {
    const { opened } = renderPhase('A2', 'review');
    const reReview = stepOf('re-review');
    expect(within(reReview).getByText('Conditional')).toBeDefined();
    expect(reReview.querySelector('.design-system-card')?.hasAttribute('data-dashed')).toBe(true);
    fireEvent.doubleClick(reReview);
    expect(opened).toEqual([{ kind: 'node', nodeId: 're-review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview: true } }]);
  });

  test('no double-click or Enter sends a command, so none starts a profile', () => {
    const { controls } = renderPhase('A2', 'build');
    document.querySelectorAll<HTMLElement>('[data-step-node-id]').forEach((step) => {
      fireEvent.doubleClick(step);
      fireEvent.keyDown(step, { key: 'Enter' });
    });
    expect(controls.sent).toEqual([]);
  });

  test('a step a question waits on shows its pill, which asks for the question, as a double-click does', async () => {
    const { opened } = renderPhase('A2-question-open', 'merge');
    const gates = stepOf('gates-merge');
    await clickSettled(within(gates).getByRole('button', { name: '1 question' }));
    fireEvent.doubleClick(gates);
    expect(opened).toEqual([{ kind: 'question', nodeId: 'gates-merge' }, { kind: 'question', nodeId: 'gates-merge' }]);
  });
});

describe('switches', () => {
  test('while editing, a switch sends its draft edit at once', async () => {
    const { controls } = renderPhase('A6', 'ticket');
    await clickSettled(within(stepOf('human-ticket-review')).getByRole('switch', { name: 'Human ticket review' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ target: 'approval', approval: 'tickets', value: false }], isACopy: false
    }]);
  });

  test('on a live board, a switch opens the update first and sends its edit once the update record shows', async () => {
    const { controls, handle } = renderPhase('A5', 'review');
    await clickSettled(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([
      { ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null },
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ target: 'approval', approval: 'merge', value: true }], isACopy: false
      },
    ]);
  });

  test('a refused start sends no edit, and its refusal shows verbatim', async () => {
    const { controls, handle } = renderPhase('A5', 'review');
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example: the pipeline moved.' });
    await clickSettled(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(screen.getByText('Example: the pipeline moved.').getAttribute('role')).toBe('status');
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null }]);
  });

  test('after a refused start, a record opened elsewhere takes the next gesture\'s edit', async () => {
    const { controls, handle } = renderPhase('A5', 'review');
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example: the pipeline moved.' });
    await clickSettled(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    await clickSettled(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([
      { ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null },
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ target: 'approval', approval: 'merge', value: true }], isACopy: false
      },
    ]);
  });
});

describe('live and editing marks', () => {
  test('A5: each live step says its state and links the tickets and drafts on it; an empty step says so', () => {
    renderPhase('A5', 'build');
    const chipsOn = (nodeId: string) => [...stepOf(nodeId).querySelectorAll<HTMLAnchorElement>('a.design-system-tag')]
      .map((chip) => [chip.textContent, chip.getAttribute('href')]);
    expect(chipsOn('builder')).toEqual([['14', '#forge/example-tracker/tickets/ticket/14']]);
    expect(chipsOn('merge-before-review')).toEqual([['15 · catching up', '#forge/example-tracker/tickets/ticket/15']]);
    expect(chipsOn('gates-build')).toEqual([['12', '#forge/example-tracker/tickets/ticket/12']]);
    expect([within(stepOf('builder')).getByText('Working'), within(stepOf('gates-build')).getByText('Running')]).toHaveLength(2);
    cleanup();
    renderPhase('A5', 'ticket');
    expect(within(stepOf('ticket-creation')).getByRole('link', { name: 'D3 drafting' }).getAttribute('href')).toBe('#forge/example-tracker/tickets/draft/D3');
    expect(within(stepOf('human-ticket-review')).getByText('No ticket here now')).toBeDefined();
  });

  test('the live Merge header names the ticket landing on main by fast-forward as the Airlock\'s, and the queued ticket after it', () => {
    const facts = pipelineBoardStateOf('A5');
    const { flow } = facts.pipeline;
    if (flow === null || flow === undefined) throw new Error('the fixture A5 has no flow');
    renderPhase('A5', 'merge', withPipelineFacts(facts, {
      flow: {
        ...flow,
        occupants: [
          {
            occupantKind: 'ticket', occupantId: '9', nodeId: 'fast-forward-main', jobId: 'J20', since: '2026-11-12T11:59:00',
          },
          {
            occupantKind: 'ticket', occupantId: '11', nodeId: 'ready-for-airlock', jobId: null, since: '2026-11-12T11:59:30',
          },
        ],
      },
    }));
    const head = screen.getByRole('region', { name: 'Phase 4: Merge' }).querySelector<HTMLElement>('.board-pipeline-phase-head');
    if (head === null) throw new Error('the Merge phase has no head');
    expect(within(head).getByText('merging onto main').parentElement?.textContent).toBe('Airlock:9merging onto main');
    expect(within(head).getByText('Queued for the merge train:').parentElement?.textContent).toBe('Queued for the merge train:11');
  });

  test('A6: an editing step carries its change, a turned switch says which way, and a removed gate stays a struck pill', () => {
    renderPhase('A6-drawn-changes', 'review');
    expect(within(stepOf('human-code-review')).getByText('Off → on').closest('[data-change]')?.getAttribute('data-change')).toBe('changed');
    cleanup();
    renderPhase('A6-drawn-changes', 'build');
    expect(within(stepOf('gates-build')).getByText('lint').closest('[data-change]')?.getAttribute('data-change')).toBe('removed');
  });
});

describe('how a ticket is written', () => {
  test('the choice shows the draft\'s route, and a press on the other route sends one ticket-writing edit to the open record', async () => {
    const { controls } = renderPhase('A2', 'ticket');
    const choice = screen.getByRole('group', { name: 'How a ticket is written' });
    const pressed = (): string[] => within(choice).getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent ?? '');
    expect(pressed()).toEqual(['One ticket']);
    await clickSettled(within(choice).getByRole('button', { name: 'One ticket' }));
    expect(controls.sent).toEqual([]);
    await clickSettled(within(choice).getByRole('button', { name: 'Spec, then plan' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 7, edits: [{ target: 'ticket-writing', value: 'spec-then-plan' }], isACopy: false
    }]);
  });

  test('going back to one ticket sends the edit that removes the route', async () => {
    const { controls } = renderPhase('A2-spec-then-plan', 'ticket');
    await clickSettled(within(screen.getByRole('group', { name: 'How a ticket is written' })).getByRole('button', { name: 'One ticket' }));
    expect(controls.sent).toMatchObject([{ kind: 'pipeline-draft-edit', edits: [{ target: 'ticket-writing', value: null }] }]);
  });

  test('the spec-then-plan route draws its four steps, each writing step naming its document, and its readiness lines', () => {
    renderPhase('A2-spec-then-plan', 'ticket');
    const steps = [...document.querySelectorAll<HTMLElement>('[data-step-node-id]')];
    expect(steps.map((step) => step.dataset['stepNodeId'])).toEqual(['spec-writing', 'human-spec-review', 'plan-writing', 'human-plan-review']);
    expect(within(stepOf('spec-writing')).getByText('spec.md')).toBeDefined();
    expect(within(stepOf('plan-writing')).getByText('plan.md')).toBeDefined();
    expect(within(stepOf('human-spec-review')).getByRole('switch', { name: 'Human spec review' }).getAttribute('aria-checked')).toBe('true');
    const readiness = screen.getByRole('region', { name: 'What makes a draft ready' });
    expect(within(readiness).getByText('A ticket is ready to build when it has all of these')).toBeDefined();
    expect([...readiness.querySelectorAll('li')].map((line) => line.textContent)).toEqual([
      'A numbered AcceptanceIn the spec. Each line is one check the change must pass.',
      'An approved specApproved by you, since Human spec review is on.',
      'An approved planIt takes the place of the Brief. The builder starts from it.',
    ]);
  });

  test('four step cards and their three arrows share one row of a phase beside the agent\'s panel, each card at most 212 px', () => {
    const stylesheetText = readFileSync(PIPELINE_STYLESHEET_PATH, 'utf8');
    const step = declarationsOf(stylesheetText, '.board-pipeline-step');
    const [grow, shrink, basis] = (step.get('flex') ?? '').split(' ');
    const arrowWidth = pixelsOf(declarationsOf(stylesheetText, '.board-pipeline-glyph[data-glyph="arrow"]').get('width'));
    expect([grow, shrink, pixelsOf(step.get('max-width'))]).toEqual(['1', '1', 212]);
    expect(4 * pixelsOf(basis) + 3 * arrowWidth).toBeLessThanOrEqual(STEP_ROW_WIDTH_AT_1440_PIXELS);
  });

  test('a document review\'s switch sends its own approval edit', async () => {
    const { controls } = renderPhase('A2-spec-then-plan', 'ticket');
    await clickSettled(within(stepOf('human-plan-review')).getByRole('switch', { name: 'Human plan review' }));
    expect(controls.sent).toMatchObject([{ kind: 'pipeline-draft-edit', edits: [{ target: 'approval', approval: 'plan', value: false }] }]);
  });
});
