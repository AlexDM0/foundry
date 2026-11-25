/**
 * The constitution step against fake controls. What matters: a source tag shows exactly on the lines the annotations anchor; READ BY lists
 * the facts' readers; Preview is a sandboxed frame and the mirror draws the text through React, never as HTML; a blur or Cmd/Ctrl+S saves
 * the whole markdown with the revision User saw, only when it changed, and a save asked for while one is on its way goes after it; a stale
 * save shows its refusal verbatim, keeps User's text, a blur then saves nothing, and Cmd+S saves on top of the new facts, but after Discard
 * my edit a new edit saves on the revision User saw; the facts' re-anchored annotations drop the edited line's tag and keep the others; the
 * footer counts the outline with the Draft chip; the mirror shows the textarea's lines; a new draft sweeps its changed lines; SOURCES and
 * Continue send their commands; at `#pipeline/edit/constitution` the same step shows only Back to the flow.
 * In monorepo mode (MonoConstitution): the rail marks each entity Adopted, Drafted, Not started or For a person, and Default once the
 * step is done; the forge level lists the entities and has no document; an adopted file opens byte for byte and nothing is sent until
 * User changes it, and then the save names the entity; READ BY lists the entity's own roles from its facts and what a crossing reads;
 * SOURCES name the entity's own files; a root kept for a person has no editor; Continue keeps the level.
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

import type { BoardDocument }                               from '../../../../@types/board/BoardDocument.ts';
import { BoardRouter, type BoardRoute }                     from '../../../shell/BoardRouter.ts';
import { FIXTURE_TRACKER_ID }                               from '../../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import {
  exampleEntity,
  exampleGate,
  pipelineBoardStateOf,
  pipelineViewServicesOf,
  withPipelineFacts
} from '../../../testing/PipelineFixture.ts';
import { PipelineView } from '../PipelineView.tsx';

const CONSTITUTION_ROUTE: BoardRoute = { tab: 'pipeline', item: 'setup/constitution' };

const EDIT_ROUTE: BoardRoute = { tab: 'pipeline', item: 'edit/constitution' };

const ANCHORED_LINE = '- Use TypeScript in strict mode.';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderConstitution(board: BoardDocument = pipelineBoardStateOf('A3b'), route: BoardRoute = CONSTITUTION_ROUTE) {
  const controls = fakeControls();
  let showBoard: (next: BoardDocument) => void = () => undefined;

  function Host() {
    const [shown, setShown] = useState(board);
    showBoard = setShown;
    return <PipelineView facts={shown} route={route} {...pipelineViewServicesOf()} />;
  }
  controls.render(onBoard(<Host />));
  return { controls, show: (next: BoardDocument) => act(() => showBoard(next)) };
}

function mirrorLines(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.board-markdown-editor-mirror-line')];
}

function taggedLines(): string[][] {
  return mirrorLines().flatMap((line) => {
    const tag = line.querySelector('.design-system-tag');
    const text = line.querySelector('.board-markdown-editor-mirror-text')?.textContent ?? '';
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

function withConstitution(board: BoardDocument, markdown: string, revision: number): BoardDocument {
  const { setup } = board.pipeline;
  if (setup === null || setup === undefined || setup.record.constitution === null) throw new Error('the board has no constitution');
  const constitution = { ...setup.record.constitution, markdown, revision };
  return withPipelineFacts(board, { setup: { ...setup, record: { ...setup.record, constitution } } });
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
    expect(lines.map((line) => line.querySelector('.board-markdown-editor-mirror-text')?.textContent)).toEqual(editor().value.split('\n'));
    expect(lines[0]?.hasAttribute('data-heading')).toBe(true);
    expect(lines[3]?.hasAttribute('data-heading')).toBe(false);
    expect(document.querySelector('.board-markdown-editor-mirror')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.board-pipeline-constitution-article h1')).toBeNull();
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
      ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown, draftedFrom: null, entity: null
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

  test('a save asked for while the one before it is on its way goes once that one is applied, on the revision it made', async () => {
    const { controls } = renderConstitution();
    const firstText = `${editor().value}- First.\n`;
    const secondText = `${firstText}- Second.\n`;
    controls.holdCommands();
    fireEvent.change(editor(), { target: { value: firstText } });
    await blurSettled(editor());
    fireEvent.change(editor(), { target: { value: secondText } });
    await act(async () => {
      fireEvent.keyDown(editor(), { key: 's', metaKey: true });
      await Promise.resolve();
    });
    expect(controls.sent).toHaveLength(1);
    await controls.releaseCommands();
    expect(controls.sent).toEqual([
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown: firstText, draftedFrom: null, entity: null
      },
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 4, markdown: secondText, draftedFrom: null, entity: null
      },
    ]);
  });

  test('a stale save shows its refusal verbatim, keeps the text, a blur saves nothing, and Cmd+S saves on top of the new facts', async () => {
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
    expect(controls.sent).toHaveLength(1);
    await act(async () => {
      fireEvent.keyDown(editor(), { key: 's', metaKey: true });
      await Promise.resolve();
    });
    expect(controls.sent.at(-1)).toEqual({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 4, markdown: typed, draftedFrom: null, entity: null
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
      ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown: typedAgain, draftedFrom: null, entity: null
    });
  });

  test('the facts re-anchored after a save drop the edited line tag and keep every other tag', async () => {
    const { show } = renderConstitution();
    const edited = pipelineBoardStateOf('A3b-anchored-line-edited');
    const editedMarkdown = edited.pipeline.setup?.record.constitution?.markdown ?? '';
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
      ...SENT_COMMAND_VERSION,
      kind:        'pipeline-constitution-edit',
      setupId:     'S1',
      revision:    3,
      draftedFrom: { contributing: true, research: true, installedDefault: true },
      markdown:    null,
      entity:      null,
    }]);
  });

  test('the drafting agent draws a caret after the last line, and a stopped one none', () => {
    renderConstitution();
    expect(mirrorLines().at(-1)?.querySelector('.board-markdown-editor-caret')).not.toBeNull();
    cleanup();
    const board = pipelineBoardStateOf('A3b');
    const { setup } = board.pipeline;
    if (setup === null || setup === undefined) throw new Error('no setup');
    renderConstitution(withPipelineFacts(board, { setup: { ...setup, agentJobState: null } }));
    expect(document.querySelector('.board-markdown-editor-caret')).toBeNull();
    expect(document.querySelector('.board-pipeline-constitution-status')?.textContent).toBe('Pipeline agent · not running');
  });

  test('the panel head says the agent drafts, and Flint drafts the constitution in the one slot of the page', () => {
    renderConstitution();
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByText('Drafting')).toBeDefined();
    const flint = within(panel).getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['50', 'page']);
    expect(within(panel).getByText('Drafting the constitution')).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });

  test('the subtitle says that Apply commits it to main as CONSTITUTION.md', () => {
    renderConstitution();
    expect(screen.getByText(/Apply commits it to main as/u).textContent).toContain('Apply commits it to main as CONSTITUTION.md.');
  });

  test('Back to research links to the research step, and Continue moves the step and opens the design', async () => {
    const { controls } = renderConstitution();
    expect(screen.getByRole('link', { name: 'Back to research' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/research');
    await clickSettled(screen.getByRole('button', { name: 'Continue to pipeline design' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/setup/design');
  });
});

describe('editing an applied pipeline', () => {
  test('the step shows at #pipeline/edit/constitution with Back to the flow in place of Back and Continue', () => {
    renderConstitution(pipelineBoardStateOf('A6'), EDIT_ROUTE);
    expect(screen.getByRole('heading', { name: 'The constitution' })).toBeDefined();
    expect(editor().value).toBe(pipelineBoardStateOf('A6').pipeline.setup?.record.constitution?.markdown ?? 'no constitution');
    expect(screen.getByRole('link', { name: 'Back to the flow' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline');
    expect(screen.queryByRole('link', { name: 'Back to research' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue to pipeline design' })).toBeNull();
  });
});

describe('monorepo mode', () => {
  /** Kept with its trailing blanks, its tab and no final line break, so a save of a normalized copy would show. */
  const ADOPTED_TEXT = '# Design system constitution\n\n- Keep every token in `tokens.css`.  \n-\tNo app imports a component file.';

  const ADMIN_ENTITY = exampleEntity('app', ['/apps/admin'], { gates: [exampleGate('lint', 'bun run lint')], phases: { build: ['lint'], review: [], merge: [] } });

  const levelRoute = (level: string): BoardRoute => ({ tab: 'pipeline', item: `${level}/setup/constitution` });

  /** The design fixture at its constitution step, with an app that has no document yet and an adopted file in the design system's flow. */
  function monorepoConstitutionBoard(constitutionStep: 'in-progress' | 'done' = 'in-progress'): BoardDocument {
    const board = pipelineBoardStateOf('mono-design');
    const { setup } = board.pipeline;
    const draft = setup?.record.draft;
    const { flow } = board.pipeline;
    if (setup === null || setup === undefined || draft === null || draft === undefined || flow === null || flow === undefined) throw new Error('the board has no monorepo setup');
    const entityFlows = flow.entityFlows ?? {};
    const designSystemFlow = entityFlows['design-system'];
    if (designSystemFlow === undefined) throw new Error('the board has no design-system flow');
    const adoptedNodes = designSystemFlow.nodes.map((node) => ({
      ...node,
      instructionEntries: node.instructionEntries.map((resolved) => (resolved.entry.kind === 'constitution' ? { ...resolved, text: ADOPTED_TEXT } : resolved)),
    }));
    const webFacts = setup.entities?.['web'];
    if (webFacts === undefined) throw new Error('the board has no web facts');
    return withPipelineFacts(board, {
      setup: {
        ...setup,
        record: {
          ...setup.record,
          currentStep: 'constitution',
          stepStates:  {
            billing: 'done', agent: 'done', research: 'done', entities: 'done', constitution: constitutionStep, design: 'not-started', apply: 'not-started',
          },
          draft: { ...draft, entities: { ...draft.entities, admin: ADMIN_ENTITY } },
        },
        entities: { ...setup.entities, web: { ...webFacts, readByRoles: ['builder', 'reviewer'] } },
      },
      flow: { ...flow, entityFlows: { ...entityFlows, 'design-system': { ...designSystemFlow, nodes: adoptedNodes } } },
    });
  }

  /** Runs a move of the address bar and waits, inside `act`, for the step to follow its `hashchange`. */
  async function hashChangeSettled(move: () => unknown): Promise<void> {
    await act(async () => {
      const changed = new Promise((resolve) => {
        window.addEventListener('hashchange', resolve, { once: true });
      });
      await move();
      await changed;
    });
  }

  async function renderLevel(level: string, board: BoardDocument = monorepoConstitutionBoard()) {
    const route = levelRoute(level);
    const controls = fakeControls();
    await hashChangeSettled(() => {
      window.location.hash = BoardRouter.fragmentOf(FIXTURE_TRACKER_ID, route);
      controls.render(onBoard(<PipelineView facts={board} route={route} {...pipelineViewServicesOf()} />));
    });
    return { controls };
  }

  function railRow(entityKey: string): HTMLElement {
    return within(screen.getByRole('navigation', { name: 'Pipeline levels' })).getByRole('button', { name: new RegExp(`^${entityKey},`, 'u') });
  }

  test('the rail marks each entity with the state of its constitution, and the forge level lists them with no document', async () => {
    await renderLevel('forge');
    expect(railRow('web').getAttribute('aria-label')).toBe('web, app, Drafted, 1 open question');
    expect(railRow('design-system').getAttribute('aria-label')).toBe('design-system, package, Adopted');
    expect(railRow('admin').getAttribute('aria-label')).toBe('admin, app, Not started');
    expect(railRow('root').getAttribute('aria-label')).toBe('root, every other path, For a person');
    expect(screen.getByRole('heading', { level: 2, name: 'Constitutions' })).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Constitution markdown' })).toBeNull();
    const entities = screen.getByRole('list', { name: 'Entities' });
    expect(within(entities).getByRole('link', { name: 'Open web’s constitution' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/entity/web/setup/constitution');
    expect(within(entities).getByText('packages/design-system/CONSTITUTION.md')).toBeDefined();
    expect(within(screen.getByLabelText('States')).getAllByRole('term').map((term) => term.textContent)).toEqual(['Adopted', 'Drafted', 'Default', 'Not started']);
  });

  test('once the step is done, an entity with no document reads the default, and the rail counts it', async () => {
    await renderLevel('forge', monorepoConstitutionBoard('done'));
    expect(railRow('admin').getAttribute('aria-label')).toBe('admin, app, Default');
    expect(screen.getByText('1 entity has the default constitution')).toBeDefined();
  });

  test('an adopted file opens byte for byte, sends nothing on a blur, and a change saves the whole text for its entity', async () => {
    const { controls } = await renderLevel('entity/design-system');
    expect(screen.getByRole('heading', { level: 2, name: 'design-system’s constitution' })).toBeDefined();
    expect(editor().value).toBe(ADOPTED_TEXT);
    await blurSettled(editor());
    expect(controls.sent).toEqual([]);
    const markdown = `${ADOPTED_TEXT}\n- Every story shows each state.`;
    fireEvent.change(editor(), { target: { value: markdown } });
    await blurSettled(editor());
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown, entity: 'design-system', draftedFrom: null
    }]);
  });

  test('READ BY lists the entity\'s own roles, each apart, and what a ticket that crosses into its packages reads', async () => {
    await renderLevel('entity/web');
    const readBy = screen.getByRole('region', { name: 'Read by' });
    expect(within(readBy).getByRole('heading', { name: 'Read by web’s' })).toBeDefined();
    expect(within(readBy).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Builder', 'Reviewer']);
    expect(within(readBy).getByText(/No other entity’s agent reads it/u).textContent)
      .toBe('No other entity’s agent reads it. On a ticket that crosses into design-system, their agents read their own.');
  });

  test('a drafted document saves and ticks its SOURCES for its entity, which names its own files', async () => {
    const { controls } = await renderLevel('entity/web');
    const markdown = `${editor().value}- Pages stay server components.\n`;
    fireEvent.change(editor(), { target: { value: markdown } });
    await blurSettled(editor());
    const sources = screen.getByRole('region', { name: 'Sources' });
    expect(within(sources).getByRole('checkbox', { name: 'apps/web/CONTRIBUTING.md' })).toBeDefined();
    await clickSettled(within(sources).getByRole('checkbox', { name: 'web’s research findings' }));
    expect(controls.sent).toEqual([
      {
        ...SENT_COMMAND_VERSION, kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 3, markdown, entity: 'web', draftedFrom: null
      },
      {
        ...SENT_COMMAND_VERSION,
        kind:        'pipeline-constitution-edit',
        setupId:     'S1',
        revision:    3,
        draftedFrom: { contributing: true, research: false, installedDefault: false },
        entity:      'web',
        markdown:    null,
      },
    ]);
  });

  test('a root kept for a person has no editor, no readers and no SOURCES', async () => {
    await renderLevel('entity/root');
    expect(screen.queryByRole('textbox', { name: 'Constitution markdown' })).toBeNull();
    expect(screen.getByText(/It is kept for a person/u)).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Read by' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
    expect(screen.queryByText('Draft')).toBeNull();
  });

  test('Back goes to the entities and Continue opens the design at the same level', async () => {
    const { controls } = await renderLevel('entity/web');
    expect(screen.getByRole('link', { name: 'Back to entities' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/entity/web/setup/entities');
    await hashChangeSettled(() => clickSettled(screen.getByRole('button', { name: 'Continue to pipeline design' })));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/entity/web/setup/design');
  });
});
