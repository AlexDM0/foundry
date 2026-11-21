/**
 * The agent step dialog (A3Inspector) in a happy-dom document, opened through the dialog host as the flow opens it. What matters: it opens
 * on the model select and closes on Esc and × without sending; the Ticket creation node opens it too, under its own phase; the model
 * select and the effort choices offer every value of the board's choices in order; the head meter's bars equal the effort's level; Save
 * sends one edit with model, effort and the ordered entries and the dialog closes once it is applied; a removed constitution leaves the
 * Include the constitution switch, which puts it back at the top; with every row removed the built-in brief line shows and Save sends an
 * empty list; on a live board Save opens the update first and its edit goes once the record shows; and Ask the pipeline agent messages
 * the agent's job, or opens an advise session first.
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

import type { BoardDocument }                               from '../../../../@types/board/BoardDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, type PipelineFixtureName }   from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                             from '../flow/PipelineFlowModel.ts';
import { PipelineDialogs }                                  from './PipelineDialogs.tsx';

afterEach(cleanup);

const BUILDER_REQUEST: FlowOpenRequest = { kind: 'node', nodeId: 'builder', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } };

interface HarnessProps {
  readonly initial: BoardDocument;
  readonly onFacts: (showFacts: (facts: BoardDocument) => void) => void;
}

function DialogHarness({ initial, onFacts }: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  const [request, setRequest] = useState<FlowOpenRequest | null>(BUILDER_REQUEST);
  useEffect(() => onFacts(setFacts), [onFacts]);
  return <PipelineDialogs facts={facts} request={request} onClose={() => setRequest(null)} />;
}

function renderDialog(name: PipelineFixtureName) {
  const controls = fakeControls();
  const handle = { showFacts: (_facts: BoardDocument): void => undefined };
  controls.render(onBoard(<DialogHarness initial={pipelineBoardStateOf(name)} onFacts={(showFacts) => { handle.showFacts = showFacts; }} />));
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

function modelSelect(): HTMLSelectElement {
  return within(dialog()).getByRole('combobox', { name: 'Model' }) as HTMLSelectElement;
}

function pickModel(model: string): void {
  fireEvent.change(modelSelect(), { target: { value: model } });
}

function fileNames(): string[] {
  return [...dialog().querySelectorAll('.design-system-listed-file-name')].map((element) => element.textContent ?? '');
}

async function save(): Promise<void> {
  await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
}

/** The builder's default briefs as the forge serves them. */
const BUILDER_DEFAULT_INSTRUCTIONS = [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }] as const;

describe('opening and closing', () => {
  test('opening focuses the model select, showing the selected model', () => {
    renderDialog('A2');
    expect(document.activeElement).toBe(modelSelect());
    expect(modelSelect().value).toBe('opus');
  });

  test('the Ticket creation node opens the agent step dialog under the Ticket phase', () => {
    const controls = fakeControls();
    const request: FlowOpenRequest = { kind: 'node', nodeId: 'ticket-creation', action: { kind: 'dialog', dialog: 'agent-step', focusesReReview: false } };
    controls.render(onBoard(<PipelineDialogs facts={pipelineBoardStateOf('A2')} request={request} onClose={() => undefined} />));
    const ticketCreation = screen.getByRole('dialog', { name: 'Ticket creation' });
    expect(ticketCreation.querySelector('.design-system-dialog-kicker')?.textContent).toBe('Ticket · Agent step');
    expect(within(ticketCreation).getByRole('group', { name: 'Brief' })).toBeDefined();
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
    expect(within(dialog()).getByText('Once per attempt, after Human ticket review.')).toBeDefined();
    expect(dialog().textContent).toContain('the conflicts and red build gates of the merge before review');
  });
});

describe('model and effort', () => {
  test('every value of the board\'s choices is offered, in order: models in the select, efforts as full-width choices', () => {
    renderDialog('A2');
    expect([...modelSelect().options].map((option) => option.value)).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
    expect(groupButtons('Effort').map((button) => button.textContent)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(screen.getByRole('group', { name: 'Effort' }).hasAttribute('data-fill')).toBe(true);
    expect(screen.getByText('The usual depth for most tickets.')).toBeDefined();
  });

  test('the head meter\'s filled bars equal the effort level, low 1 to max 5', () => {
    renderDialog('A2');
    const filledBars = () => dialog().querySelectorAll('.design-system-dialog-head .design-system-effort-meter-bar[data-filled]').length;
    groupButtons('Effort').forEach((button, i) => {
      act(() => button.click());
      expect(filledBars()).toBe(i + 1);
    });
  });

  test('fable and xhigh select and save like the others, and a stored fable xhigh opens selected', async () => {
    const { controls } = renderDialog('A2');
    pickModel('fable');
    act(() => within(screen.getByRole('group', { name: 'Effort' })).getByRole('button', { name: 'xhigh' }).click());
    expect(screen.getByText('Deeper than high, for large or subtle tickets.')).toBeDefined();
    await save();
    expect(controls.sent[0]).toMatchObject({ edits: [{ target: 'role', role: 'builder', value: { model: 'fable', effort: 'xhigh' } }] });
    cleanup();
    renderDialog('A3-fable-xhigh');
    expect([modelSelect().value, pressedText('Effort')]).toEqual(['fable', 'xhigh']);
  });
});

describe('a Save', () => {
  test('sends one edit with the model, the effort and the ordered entries, then the dialog closes', async () => {
    const { controls } = renderDialog('A2');
    await save();
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 7,
      edits:         [{ target: 'role', role: 'builder', value: { model: 'opus', effort: 'medium', instructions: BUILDER_DEFAULT_INSTRUCTIONS } }],
      isACopy:       false
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
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent[1]).toMatchObject({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', edits: [{ target: 'role', role: 'builder' }], isACopy: false
    });
  });
});

describe('the instructions', () => {
  test('a removed constitution leaves the Include the constitution switch, which puts it back at the top', () => {
    renderDialog('A2');
    expect(fileNames()).toEqual(['constitution.md', 'builder.md']);
    act(() => within(dialog()).getByRole('button', { name: 'Remove constitution.md' }).click());
    expect(fileNames()).toEqual(['builder.md']);
    act(() => within(dialog()).getByRole('switch', { name: 'Include the constitution' }).click());
    expect(fileNames()).toEqual(['constitution.md', 'builder.md']);
    expect(within(dialog()).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/constitution');
  });

  test('with every row removed the built-in brief line shows and Save sends an empty list', async () => {
    const { controls } = renderDialog('A2');
    act(() => within(dialog()).getByRole('button', { name: 'Remove constitution.md' }).click());
    act(() => within(dialog()).getByRole('button', { name: 'Remove builder.md' }).click());
    expect(screen.getByText('No file. The agent uses the basic built-in brief.')).toBeDefined();
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
    expect([modelSelect().value, pressedText('Effort')]).toEqual(['opus', 'medium']);
  });
});

describe('Ask the pipeline agent', () => {
  test('messages the pipeline agent\'s job with a question naming the step', async () => {
    const { controls } = renderDialog('A2');
    await clickSettled(within(dialog()).getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-message', jobId: 'J4', text: 'Which model, effort and instructions fit the Builder step on this board?', pictures: [], incidentId: null
    }]);
  });

  test('on a live board opens an advise session first', async () => {
    const { controls } = renderDialog('A5');
    await clickSettled(within(dialog()).getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-agent-advise', entity: null }]);
  });
});
