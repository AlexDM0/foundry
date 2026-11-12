/**
 * The pipeline flow in a happy-dom document, over the designed fixtures. What matters: the smallest pipeline draws no merge before review
 * and a + only where the facts name one, whose choices send their edit or ask for the Gate dialog; the merge before review opens nothing
 * and keeps its derived meter focusable with its tooltip; every merge step's meter is derived; a double-click or Enter asks for what the
 * node opens and never sends a command, so never a profile; a switch sends its edit, and on a live board sends `pipeline-update-start`
 * first and the edit once the update record shows; a refusal shows verbatim; the arrows come from the measured boxes and run only on a
 * live flow; marked chips carry their change; the zoom scales the canvas and is remembered per board.
 */
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

import type { BoardStateDocument }                        from '../../../@types/BoardStateDocument.ts';
import { createPreferenceStore, type PreferenceStorage }  from '../../../preferences/PreferenceStore.ts';
import { clickSettled, fakeControls }                     from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineFlow, type FlowOpenRequest }             from './PipelineFlow.tsx';
import type { FlowLayoutBox }                             from './PipelineFlowLayoutUtil.ts';

afterEach(cleanup);

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const COLUMN_LEFT = { spine: 128, branch: 592, train: 128 } as const;

/** Stacks each column's cells 80px apart, as a laid-out canvas would place them. */
function stackedBoxesOf(canvas: HTMLElement): FlowLayoutBox[] {
  const rowsUsed = { spine: 0, branch: 0, train: 6 };
  return [...canvas.querySelectorAll<HTMLElement>('[data-flow-node-id]')].map((cell) => {
    const column = cell.dataset['flowColumn'] as keyof typeof rowsUsed;
    const row = rowsUsed[column];
    rowsUsed[column] = row + 1;
    return {
      nodeId: cell.dataset['flowNodeId'] ?? '', column, left: COLUMN_LEFT[column], top: row * 80, width: 304, height: 56
    };
  });
}

function memoryStorage(): PreferenceStorage {
  const texts = new Map<string, string>();
  return {
    getItem:    (key) => texts.get(key) ?? null,
    setItem:    (key, text) => void texts.set(key, text),
    removeItem: (key) => void texts.delete(key),
  };
}

/** Lets a spec show the flow new facts later, as the event stream would. */
interface HarnessHandle {
  showFacts: (facts: BoardStateDocument) => void;
}

function harnessHandle(): HarnessHandle {
  const handle: HarnessHandle = { showFacts: () => undefined };
  return handle;
}

interface FlowHarnessProps {
  readonly initial: BoardStateDocument;
  readonly onFacts: (showFacts: (facts: BoardStateDocument) => void) => void;
  readonly opened:  FlowOpenRequest[];
}

function FlowHarness({ initial, onFacts, opened }: FlowHarnessProps) {
  const [facts, setFacts] = useState(initial);
  useEffect(() => onFacts(setFacts), [onFacts]);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const record = facts.pipelineSetup?.record ?? null;
  return (
    <PipelineFlow
      flow={flow}
      draft={record?.draft ?? null}
      editTarget={record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision }}
      efforts={EFFORTS}
      profileRuns={facts.profileRuns ?? []}
      boardStore={createPreferenceStore('test-board', memoryStorage)}
      selectedNodeId={null}
      onOpen={(request) => opened.push(request)}
      measureBoxes={stackedBoxesOf}
    />
  );
}

function renderFlow(name: PipelineFixtureName) {
  const controls = fakeControls();
  const opened: FlowOpenRequest[] = [];
  const handle = harnessHandle();
  controls.render(<FlowHarness initial={pipelineBoardStateOf(name)} onFacts={(showFacts) => { handle.showFacts = showFacts; }} opened={opened} />);
  return { controls, opened, handle };
}

function cellOf(nodeId: string): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[data-flow-node-id="${nodeId}"]`);
  if (cell === null) throw new Error(`no node ${nodeId}`);
  return cell;
}

function nodeOf(nodeId: string): HTMLElement {
  const node = cellOf(nodeId).querySelector<HTMLElement>('.bridge-flow-node');
  if (node === null) throw new Error(`no flow node in ${nodeId}`);
  return node;
}

describe('the smallest pipeline', () => {
  test('draws no merge before review: its one merge stands in the train, and a + stands only where the facts name one', () => {
    renderFlow('A7');
    expect(screen.getAllByText('Merge main into the tree')).toHaveLength(1);
    expect(within(screen.getByRole('group', { name: 'Merge train · Airlock, one at a time' })).getByText('Merge main into the tree')).toBeDefined();
    expect(screen.getAllByRole('button', { name: /^Add a step/ }).map((trigger) => trigger.getAttribute('aria-label'))).toEqual([
      'Add a step after the Builder',
      'Add a step before the fast-forward',
    ]);
    expect(screen.getByRole('button', { name: 'Add a step before the fast-forward' }).getAttribute('data-insert')).toBe('dashed');
  });

  test('choosing Review from the + sends the review edit to the open record', async () => {
    const { controls } = renderFlow('A7');
    await clickSettled(screen.getByRole('button', { name: 'Add a step after the Builder' }));
    expect(screen.getByText('Add after the Builder')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Review' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'review', value: { name: 'review' } }],
    }]);
  });

  test('choosing Build gates asks for the Gate dialog in the build phase and sends nothing', async () => {
    const { controls, opened } = renderFlow('A7');
    await clickSettled(screen.getByRole('button', { name: 'Add a step after the Builder' }));
    await clickSettled(screen.getByRole('button', { name: 'Build gates' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'build' }]);
    expect(controls.sent).toEqual([]);
  });
});

describe('the merge before review', () => {
  test('opens nothing, and its derived meter keeps the focus and names the builder in its tooltip', () => {
    const { opened } = renderFlow('flow-merge-before-review');
    const node = nodeOf('merge-before-review');
    expect(node.getAttribute('tabindex')).toBeNull();
    expect(node.getAttribute('aria-haspopup')).toBeNull();
    fireEvent.doubleClick(node);
    expect(opened).toEqual([]);
    const meter = within(node).getByRole('img');
    expect(meter.getAttribute('tabindex')).toBe('0');
    const tooltip = document.getElementById(meter.getAttribute('aria-describedby') ?? '');
    expect(tooltip?.textContent).toContain('Derived from the builder');
    expect(within(node).getByText('then the build gates again')).toBeDefined();
  });

  test('every merge step has a derived meter: three with Human code review on and a review step', () => {
    renderFlow('flow-human-code-review-proposal');
    expect(document.querySelectorAll('.bridge-effort-meter[data-derived]')).toHaveLength(3);
  });
});

describe('opening nodes', () => {
  test('a double-click or Enter asks for what the node opens, and a re-review node is conditional with its tag after the title', () => {
    const { opened } = renderFlow('A2');
    fireEvent.doubleClick(nodeOf('builder'));
    fireEvent.keyDown(nodeOf('gates-merge'), { key: 'Enter' });
    fireEvent.doubleClick(nodeOf('re-review'));
    expect(opened).toEqual([
      { kind: 'node', nodeId: 'builder', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } },
      { kind: 'node', nodeId: 'gates-merge', action: { kind: 'gates-tab', phase: 'merge' } },
      { kind: 'node', nodeId: 're-review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview: true } },
    ]);
    const reReview = nodeOf('re-review');
    expect(reReview.hasAttribute('data-conditional')).toBe(true);
    expect(reReview.querySelector('.bridge-flow-node-tag')?.textContent).toBe('conditional');
  });

  test('no double-click, Enter or proposal sends a command, so none starts a profile', () => {
    const { controls } = renderFlow('A2');
    document.querySelectorAll<HTMLElement>('.bridge-flow-node').forEach((node) => {
      fireEvent.doubleClick(node);
      fireEvent.keyDown(node, { key: 'Enter' });
    });
    expect(controls.sent).toEqual([]);
  });
});

describe('switches', () => {
  test('while editing, a switch sends its draft edit at once', async () => {
    const { controls } = renderFlow('A6');
    await clickSettled(within(nodeOf('human-ticket-review')).getByRole('switch', { name: 'Human ticket review' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'approval:tickets', value: false }],
    }]);
  });

  test('on a live board, a switch opens the update first and sends its edit once the update record shows', async () => {
    const { controls, handle } = renderFlow('A5');
    await clickSettled(within(nodeOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([
      { kind: 'pipeline-update-start' },
      {
        kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'approval:merge', value: true }]
      },
    ]);
  });

  test('a refused start sends no edit, and its refusal shows verbatim', async () => {
    const { controls, handle } = renderFlow('A5');
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example: the pipeline moved.' });
    await clickSettled(within(nodeOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(screen.getByText('Example: the pipeline moved.').getAttribute('role')).toBe('status');
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
  });
  test('after a refused start, a record opened elsewhere takes the next gesture\'s edit', async () => {
    const { controls, handle } = renderFlow('A5');
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example: the pipeline moved.' });
    await clickSettled(within(nodeOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    await clickSettled(within(nodeOf('human-ticket-review')).getByRole('switch', { name: 'Human ticket review' }));
    expect(controls.sent).toEqual([
      { kind: 'pipeline-update-start' },
      {
        kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'approval:tickets', value: false }]
      },
    ]);
  });
});

describe('arrows, marks and zoom', () => {
  test('one arrow per edge from the measured boxes; only a live flow\'s arrows run', () => {
    renderFlow('A5');
    const liveFlow = pipelineBoardStateOf('A5').pipelineFlow;
    const arrows = document.querySelectorAll('.bridge-flow-arrow');
    expect(arrows).toHaveLength(liveFlow?.edges.length ?? -1);
    expect(document.querySelectorAll('.bridge-flow-arrow[data-active]').length).toBeGreaterThan(0);
    cleanup();
    renderFlow('A2');
    expect(document.querySelectorAll('.bridge-flow-arrow[data-active]')).toHaveLength(0);
    expect([...document.querySelectorAll('.bridge-flow-arrow-label')].map((label) => label.textContent)).toContain('all green');
  });

  test('a removed gate stays drawn as a struck chip, and proposed chips are dashed', () => {
    const facts = pipelineBoardStateOf('A6');
    const flow = facts.pipelineFlow;
    if (flow === null || flow === undefined) throw new Error('no flow');
    const nodes = flow.nodes.map((node) => (node.nodeId === 'gates-build'
      ? { ...node, mark: 'changed' as const, gateChips: [...node.gateChips, { gateName: 'old-lint', mark: 'removed' as const }] }
      : node));
    const controls = fakeControls();
    controls.render(<FlowHarness initial={{ ...facts, pipelineFlow: { ...flow, nodes } }} onFacts={() => undefined} opened={[]} />);
    expect(within(nodeOf('gates-build')).getByText('old-lint').closest('[data-change]')?.getAttribute('data-change')).toBe('removed');
    expect(nodeOf('gates-build').getAttribute('data-mark')).toBe('changed');
    cleanup();
    renderFlow('A2');
    expect(within(nodeOf('gates-build')).getByText('typecheck').closest('[data-dashed]')).not.toBeNull();
  });

  test('zoom in scales the canvas by a step and Fit keeps 100% with nothing laid out', async () => {
    renderFlow('A2');
    await clickSettled(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('110%')).toBeDefined();
    const canvas = document.querySelector<HTMLElement>('.bridge-pipeline-flow-canvas');
    expect(canvas?.style.getPropertyValue('--flow-zoom')).toBe('1.1');
    await clickSettled(screen.getByRole('button', { name: 'Fit' }));
    expect(screen.getByText('100%')).toBeDefined();
  });
});
