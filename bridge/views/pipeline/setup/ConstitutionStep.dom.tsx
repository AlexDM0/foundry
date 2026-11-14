/**
 * The constitution step against fake controls. What matters: a source tag shows exactly on the lines the annotations anchor; READ BY
 * lists the facts' readers; Preview is a sandboxed frame and the mirror draws the text through React, never as HTML; a blur or Cmd/Ctrl+S
 * saves the whole markdown with the revision User saw, only when it changed; a stale save shows its refusal verbatim, keeps User's text,
 * and the next save goes on top of the new facts, but after Discard my edit a new edit saves on the revision User saw; the facts'
 * re-anchored annotations drop the edited line's tag and keep the others; the footer counts the outline with the Draft chip; the
 * mirror shows the textarea's lines; a new draft sweeps its changed lines; SOURCES and Continue send their commands; at
 * `#pipeline/edit/constitution` the same step shows only Back to the flow.
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
import { useState } from 'react';

import type { BoardStateDocument }                      from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                             from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                   from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                 from '../PipelineView.tsx';

const CONSTITUTION_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'setup/constitution' };

const EDIT_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'edit/constitution' };

const ANCHORED_LINE = '- Use TypeScript in strict mode.';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderConstitution(board: BoardStateDocument = pipelineBoardStateOf('A3b'), route: BridgeRoute = CONSTITUTION_ROUTE) {
  const controls = fakeControls();
  let showBoard: (next: BoardStateDocument) => void = () => undefined;

  function Host() {
    const [shown, setShown] = useState(board);
    showBoard = setShown;
    return <PipelineView facts={shown} route={route} {...pipelineViewServicesOf()} />;
  }
  controls.render(<Host />);
  return { controls, show: (next: BoardStateDocument) => act(() => showBoard(next)) };
}

function mirrorLines(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.bridge-pipeline-constitution-mirror-line')];
}

function taggedLines(): string[][] {
  return mirrorLines().flatMap((line) => {
    const tag = line.querySelector('.design-system-tag');
    const text = line.querySelector('.bridge-pipeline-constitution-mirror-text')?.textContent ?? '';
    return tag === null ? [] : [[text, tag.textContent ?? '']];
  });
}

function editor(): HTMLTextAreaElement {
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Constitution markdown' });
}

async function blurSettled(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.blur(element);
    await Promise.resolve();
  });
}

function withConstitution(board: BoardStateDocument, markdown: string, revision: number): BoardStateDocument {
  const setup = board.pipelineSetup;
  if (setup === null || setup === undefined || setup.record.constitution === null) throw new Error('the board has no constitution');
  const constitution = { ...setup.record.constitution, markdown, revision };
  return { ...board, pipelineSetup: { ...setup, record: { ...setup.record, constitution } } };
}

describe('the tags and readers', () => {
  test('a tag shows exactly on the lines the annotations anchor, and READ BY lists the facts readers', () => {
    renderConstitution();
    expect(taggedLines()).toEqual([
      [ANCHORED_LINE, 'research'],
      ['- Put each spec beside its module.', 'CONTRIBUTING.md'],
      ['- Write one plain subject line per commit.', 'default'],
    ]);
    const readers = within(screen.getByRole('region', { name: 'Read by' })).getAllByRole('listitem').map((item) => item.textContent);
    expect(readers).toEqual(['Builder', 'Review', 'Re-review']);
  });

  test('the tags are listed for a screen reader, and the textarea names that list', () => {
    renderConstitution();
    const list = screen.getByRole('list', { name: 'Sources the pipeline agent named' });
    expect(editor().getAttribute('aria-describedby')).toBe(list.id);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('the text', () => {
  test('the mirror draws the textarea lines through React, the headings marked, and is hidden from the accessibility tree', () => {
    renderConstitution();
    const lines = mirrorLines();
    expect(lines.map((line) => line.querySelector('.bridge-pipeline-constitution-mirror-text')?.textContent)).toEqual(editor().value.split('\n'));
    expect(lines[0]?.hasAttribute('data-heading')).toBe(true);
    expect(lines[3]?.hasAttribute('data-heading')).toBe(false);
    expect(document.querySelector('.bridge-pipeline-constitution-mirror')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.bridge-pipeline-constitution-article h1')).toBeNull();
  });

  test('Preview shows the server HTML in a sandboxed frame that runs no script', () => {
    renderConstitution();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const frame = screen.getByTitle('Constitution preview');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>Example Agency constitution</h1>');
    expect(screen.queryByRole('textbox', { name: 'Constitution markdown' })).toBeNull();
  });

  test('typing shows in the mirror at once, and an edited anchored line loses its tag before the save', () => {
    renderConstitution();
    fireEvent.change(editor(), { target: { value: editor().value.replace(ANCHORED_LINE, '- Use TypeScript in its strictest mode.') } });
    expect(taggedLines().map(([text]) => text)).toEqual(['- Put each spec beside its module.', '- Write one plain subject line per commit.']);
  });
});

describe('the save', () => {
  test('a blur without a change sends nothing', async () => {
    const { controls } = renderConstitution();
    await blurSettled(editor());
    expect(controls.sent).toEqual([]);
  });

  test('a blur sends the whole markdown with the revision User saw', async () => {
    const { controls } = renderConstitution();
    const markdown = `${editor().value}- Keep every function small.\n`;
    fireEvent.change(editor(), { target: { value: markdown } });
    await blurSettled(editor());
    expect(controls.sent).toEqual([{
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown
    }]);
  });

  test('Cmd+S and Ctrl+S save too', async () => {
    const { controls } = renderConstitution();
    fireEvent.change(editor(), { target: { value: `${editor().value}- One.\n` } });
    await act(async () => {
      fireEvent.keyDown(editor(), { key: 's', metaKey: true });
      await Promise.resolve();
    });
    expect(controls.sent).toHaveLength(1);
  });

  test('a stale save shows its refusal verbatim, keeps the text, and the next save goes on top of the new facts', async () => {
    const { controls, show } = renderConstitution();
    const typed = `${editor().value}- Typed by User.\n`;
    fireEvent.change(editor(), { target: { value: typed } });
    const newerBoard = withConstitution(pipelineBoardStateOf('A3b'), '# The agent redrafted it\n', 4);
    show(newerBoard);
    expect(editor().value).toBe(typed);
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: the constitution changed since revision 3.' });
    await blurSettled(editor());
    expect(screen.getByText('Example refusal: the constitution changed since revision 3.').getAttribute('role')).toBe('status');
    expect(editor().value).toBe(typed);
    await blurSettled(editor());
    expect(controls.sent.at(-1)).toEqual({
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 4, markdown: typed
    });
  });

  test('Discard my edit after a refusal brings back the facts text', async () => {
    const { controls } = renderConstitution();
    const factsText = editor().value;
    fireEvent.change(editor(), { target: { value: `${factsText}- Typed.\n` } });
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal.' });
    await blurSettled(editor());
    fireEvent.click(screen.getByRole('button', { name: 'Discard my edit' }));
    expect(editor().value).toBe(factsText);
    expect(screen.queryByText('Example refusal.')).toBeNull();
  });

  test('after Discard my edit, a new edit shows no old refusal and saves on the revision User saw, not on a newer draft', async () => {
    const { controls, show } = renderConstitution();
    const factsText = editor().value;
    fireEvent.change(editor(), { target: { value: `${factsText}- Typed.\n` } });
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal.' });
    await blurSettled(editor());
    fireEvent.click(screen.getByRole('button', { name: 'Discard my edit' }));
    const typedAgain = `${factsText}- Typed again.\n`;
    fireEvent.change(editor(), { target: { value: typedAgain } });
    expect(screen.queryByText('Example refusal.')).toBeNull();
    show(withConstitution(pipelineBoardStateOf('A3b'), '# The agent redrafted it\n', 4));
    await blurSettled(editor());
    expect(controls.sent.at(-1)).toEqual({
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown: typedAgain
    });
  });

  test('the facts re-anchored after a save drop the edited line tag and keep every other tag', async () => {
    const { show } = renderConstitution();
    const edited = pipelineBoardStateOf('A3b-anchored-line-edited');
    const editedMarkdown = edited.pipelineSetup?.record.constitution?.markdown ?? '';
    fireEvent.change(editor(), { target: { value: editedMarkdown } });
    await blurSettled(editor());
    show(edited);
    expect(editor().value).toBe(editedMarkdown);
    expect(taggedLines()).toEqual([
      ['- Put each spec beside its module.', 'CONTRIBUTING.md'],
      ['- Write one plain subject line per commit.', 'default'],
    ]);
    expect(mirrorLines().some((line) => line.hasAttribute('data-changed'))).toBe(false);
  });

  test('a new agent draft takes the place of unchanged text and sweeps only its changed lines', () => {
    const { show } = renderConstitution();
    const markdown = `${editor().value.replace(ANCHORED_LINE, '- Use TypeScript with no implicit any.')}`;
    show(withConstitution(pipelineBoardStateOf('A3b'), markdown, 4));
    expect(editor().value).toBe(markdown);
    const changed = mirrorLines().filter((line) => line.hasAttribute('data-changed')).map((line) => line.textContent);
    expect(changed).toEqual(['- Use TypeScript with no implicit any.']);
  });
});

describe('the aside and the footer', () => {
  test('the footer counts the outline beside the Draft chip', () => {
    renderConstitution();
    const footer = screen.getByRole('region', { name: 'Constitution actions' });
    expect(within(footer).getByText('4 sections · 6 rules')).toBeDefined();
    expect(within(footer).getByText('Draft').getAttribute('data-tone')).toBe('neutral');
  });

  test('a SOURCES tick sends the choices with that one flipped', async () => {
    const { controls } = renderConstitution();
    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByRole('checkbox', { name: 'CONTRIBUTING.md' })).toHaveProperty('checked', true);
    await clickSettled(within(sources).getByRole('checkbox', { name: 'The installed default' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, draftedFrom: { contributing: true, research: true, installedDefault: true },
    }]);
  });

  test('the drafting agent draws a caret after the last line, and a stopped one none', () => {
    renderConstitution();
    expect(mirrorLines().at(-1)?.querySelector('.bridge-pipeline-constitution-caret')).not.toBeNull();
    cleanup();
    const board = pipelineBoardStateOf('A3b');
    const setup = board.pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('no setup');
    renderConstitution({ ...board, pipelineSetup: { ...setup, agentJobState: null } });
    expect(document.querySelector('.bridge-pipeline-constitution-caret')).toBeNull();
    expect(document.querySelector('.bridge-pipeline-constitution-status')?.textContent).toBe('Pipeline agent · not running');
  });

  test('the panel head says the agent drafts, and Flint drafts the constitution in the one slot of the page', () => {
    renderConstitution();
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByText('Drafting')).toBeDefined();
    const flint = within(panel).getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground'], flint.dataset['flintPose']]).toEqual(['76', 'page', 'thinking']);
    expect(within(panel).getByText('Drafting the constitution')).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });

  test('the subtitle says that Apply commits it to main as CONSTITUTION.md', () => {
    renderConstitution();
    expect(screen.getByText(/Apply commits it to main as/u).textContent).toContain('Apply commits it to main as CONSTITUTION.md.');
  });

  test('Back to research links to the research step, and Continue moves the step and opens the design', async () => {
    const { controls } = renderConstitution();
    expect(screen.getByRole('link', { name: 'Back to research' }).getAttribute('href')).toBe('#pipeline/setup/research');
    await clickSettled(screen.getByRole('button', { name: 'Continue to pipeline design' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#pipeline/setup/design');
  });
});

describe('editing an applied pipeline', () => {
  test('the step shows at #pipeline/edit/constitution with Back to the flow in place of Back and Continue', () => {
    renderConstitution(pipelineBoardStateOf('A6'), EDIT_ROUTE);
    expect(screen.getByRole('heading', { name: 'The constitution' })).toBeDefined();
    expect(editor().value).toBe(pipelineBoardStateOf('A6').pipelineSetup?.record.constitution?.markdown ?? 'no constitution');
    expect(screen.getByRole('link', { name: 'Back to the flow' }).getAttribute('href')).toBe('#pipeline');
    expect(screen.queryByRole('link', { name: 'Back to research' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue to pipeline design' })).toBeNull();
  });
});
