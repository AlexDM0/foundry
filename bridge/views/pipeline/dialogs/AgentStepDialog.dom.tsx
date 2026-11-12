/**
 * The agent step dialog (A3Inspector) in a happy-dom document, opened through the dialog host as the flow opens it. What matters: it opens
 * on the selected model and closes on Esc and × without sending; Model and Effort offer every value of the board's choices in order and
 * stack as two full rows; the head meter's bars equal the effort's level; Save sends one edit with model, effort and the ordered entries
 * and the dialog closes once it is applied; a removed constitution leaves the Add constitution switch, which puts it back at the top; with
 * every row removed the built-in brief caption shows and Save sends an empty list; on a live board Save opens the update first and its
 * edit goes once the record shows; and Ask the pipeline agent messages the agent's job, or opens an advise session first.
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
import { clickSettled, fakeControls }                     from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                           from '../flow/PipelineFlow.tsx';
import { PipelineDialogs }                                from './PipelineDialogs.tsx';

afterEach(cleanup);

const BUILDER_REQUEST: FlowOpenRequest = { kind: 'node', nodeId: 'builder', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } };

interface HarnessProps {
  readonly initial: BoardStateDocument;
  readonly onFacts: (showFacts: (facts: BoardStateDocument) => void) => void;
}

function DialogHarness({ initial, onFacts }: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  const [request, setRequest] = useState<FlowOpenRequest | null>(BUILDER_REQUEST);
  useEffect(() => onFacts(setFacts), [onFacts]);
  return <PipelineDialogs facts={facts} request={request} onClose={() => setRequest(null)} />;
}

function renderDialog(name: PipelineFixtureName) {
  const controls = fakeControls();
  const handle = { showFacts: (_facts: BoardStateDocument): void => undefined };
  controls.render(<DialogHarness initial={pipelineBoardStateOf(name)} onFacts={(showFacts) => { handle.showFacts = showFacts; }} />);
  return { controls, handle };
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Builder' });
}

function groupButtons(name: string): HTMLButtonElement[] {
  return within(screen.getByRole('group', { name })).getAllByRole('button') as HTMLButtonElement[];
}

function pressedText(name: string): string | null {
  return groupButtons(name).find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent ?? null;
}

function fileNames(): string[] {
  return [...dialog().querySelectorAll('.bridge-listed-file-name')].map((element) => element.textContent ?? '');
}

async function save(): Promise<void> {
  await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
}

describe('opening and closing', () => {
  test('opening focuses the selected model in the Model group', () => {
    renderDialog('A2');
    expect(document.activeElement).toBe(within(screen.getByRole('group', { name: 'Model' })).getByRole('button', { name: 'opus' }));
  });

  test('Esc and × close without sending', () => {
    const { controls } = renderDialog('A2');
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    const second = renderDialog('A2');
    act(() => within(dialog()).getByRole('button', { name: 'Close' }).click());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect([...controls.sent, ...second.controls.sent]).toEqual([]);
  });

  test('the step says when it runs and that the builder fixes the merge before review\'s conflicts and red gates', () => {
    renderDialog('A2');
    expect(dialog().querySelector('.bridge-pipeline-dialog-info')?.textContent).toContain('the conflicts and red build gates of the merge before review');
  });
});

describe('model and effort', () => {
  test('every value of the board\'s choices is a segment, in order, in two stacked full-width rows', () => {
    renderDialog('A2');
    expect(groupButtons('Model').map((button) => button.textContent)).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
    expect(groupButtons('Effort').map((button) => button.textContent)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(screen.getByRole('group', { name: 'Effort' }).hasAttribute('data-fill')).toBe(true);
    expect(screen.getByText('The usual depth for most tickets.')).toBeDefined();
  });

  test('the head meter\'s filled bars equal the effort level, low 1 to max 5', () => {
    renderDialog('A2');
    const filledBars = () => dialog().querySelectorAll('.bridge-dialog-head .bridge-effort-meter-bar[data-filled]').length;
    groupButtons('Effort').forEach((button, i) => {
      act(() => button.click());
      expect(filledBars()).toBe(i + 1);
    });
  });

  test('fable and xhigh select and save like the others, and a stored fable xhigh opens selected', async () => {
    const { controls } = renderDialog('A2');
    act(() => within(screen.getByRole('group', { name: 'Model' })).getByRole('button', { name: 'fable' }).click());
    act(() => within(screen.getByRole('group', { name: 'Effort' })).getByRole('button', { name: 'xhigh' }).click());
    expect(screen.getByText('Deeper than high, for large or subtle tickets.')).toBeDefined();
    await save();
    expect(controls.sent[0]).toMatchObject({ edits: [{ field: 'role:builder', value: { model: 'fable', effort: 'xhigh' } }] });
    cleanup();
    renderDialog('A3-fable-xhigh');
    expect([pressedText('Model'), pressedText('Effort')]).toEqual(['fable', 'xhigh']);
  });
});

describe('a Save', () => {
  test('sends one edit with the model, the effort and the ordered entries, then the dialog closes', async () => {
    const { controls } = renderDialog('A2');
    await save();
    expect(controls.sent).toEqual([{
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 7,
      edits:         [{
        field: 'role:builder',
        value: { model: 'opus', effort: 'medium', instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }] },
      }],
    }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('a refused Save keeps the dialog open with the refusal', async () => {
    const { controls } = renderDialog('A2');
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: the draft moved.' });
    await save();
    expect(within(dialog()).getByRole('status').textContent).toBe('Example refusal: the draft moved.');
  });

  test('on a live board it opens the update first, and the edit goes once the record shows', async () => {
    const { controls, handle } = renderDialog('A5');
    await save();
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent[1]).toMatchObject({ kind: 'pipeline-draft-edit', setupId: 'S2', edits: [{ field: 'role:builder' }] });
  });
});

describe('the instructions', () => {
  test('a removed constitution leaves the Add constitution switch, which puts it back at the top', () => {
    renderDialog('A2');
    expect(fileNames()).toEqual(['constitution.md', 'builder.md']);
    act(() => within(dialog()).getByRole('button', { name: 'Remove constitution.md' }).click());
    expect(fileNames()).toEqual(['builder.md']);
    act(() => within(dialog()).getByRole('switch', { name: 'Add constitution' }).click());
    expect(fileNames()).toEqual(['constitution.md', 'builder.md']);
    expect(within(dialog()).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('#pipeline/setup/constitution');
  });

  test('with every row removed the built-in brief caption shows and Save sends an empty list', async () => {
    const { controls } = renderDialog('A2');
    act(() => within(dialog()).getByRole('button', { name: 'Remove constitution.md' }).click());
    act(() => within(dialog()).getByRole('button', { name: 'Remove builder.md' }).click());
    expect(screen.getByText('No file left: the agent reads its basic built-in brief.')).toBeDefined();
    await save();
    expect(controls.sent[0]).toMatchObject({ edits: [{ value: { instructions: [] } }] });
  });

  test('Open shows the brief\'s text read on main, and an added path goes last', () => {
    renderDialog('A2');
    act(() => within(dialog()).getByRole('button', { name: 'Open' }).click());
    expect(screen.getByRole('dialog', { name: 'builder.md' }).textContent).toContain('Example default brief of the builder role.');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'builder.md' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'builder.md' })).toBeNull();
    expect(dialog()).toBeDefined();
    act(() => within(dialog()).getByRole('button', { name: 'Add a file' }).click());
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Path on main' }), { target: { value: 'docs/example-brief.md' } });
    act(() => within(dialog()).getByRole('button', { name: 'Add' }).click());
    expect(fileNames()).toEqual(['constitution.md', 'builder.md', 'docs/example-brief.md']);
  });

  test('Reset to default puts back the worker pair and the default list', () => {
    renderDialog('A3-constitution-removed');
    expect(fileNames()).toEqual(['builder.md']);
    act(() => within(dialog()).getByRole('button', { name: 'Reset to default' }).click());
    expect(fileNames()).toEqual(['constitution.md', 'builder.md']);
    expect([pressedText('Model'), pressedText('Effort')]).toEqual(['opus', 'medium']);
  });
});

describe('Ask the pipeline agent', () => {
  test('messages the pipeline agent\'s job with a question naming the step', async () => {
    const { controls } = renderDialog('A2');
    await clickSettled(within(dialog()).getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J4', text: 'Which model, effort and instructions fit the Builder step on this board?' }]);
  });

  test('on a live board opens an advise session first', async () => {
    const { controls } = renderDialog('A5');
    await clickSettled(within(dialog()).getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-agent-advise' }]);
  });
});
