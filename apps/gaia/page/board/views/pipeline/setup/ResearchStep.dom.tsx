/**
 * The research step against fake controls and a fake transcript. What matters: the findings render by topic with their source paths and
 * the scripts with their command and meaning, a script that needs a network with the amber dot and its note; the stack chips pop in and no
 * finding offers to run anything; Answer sends the chosen letter or the Other text and the card turns into the answered pill; Continue
 * is enabled while the agent still researches; while a turn runs the typing line says what the agent does, politely live; a step prompt
 * Hephaestus sent reads as its system line with the prompt on User's ask, never as a User bubble; grey lines
 * stand in before the first finding; Stop stops the agent's job; the panel head says the agent researches, and the page's one Flint slot
 * waits on User while a research question is open. In monorepo mode (MonoResearch): the layout comes first; each session's row says its
 * state in words; a press on a row shows that session's findings and chat at its level in the route; Stop on a row stops that session
 * alone, and Stop all stops every live session and none that ended; Continue opens the entities step; no control sets how many sessions
 * run at once.
 */
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                from '../../../../@types/board/BoardDocument.ts';
import type { BoardResearchFindingDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  clickSettled,
  fakeControls,
  fakeTranscripts,
  SENT_COMMAND_VERSION
} from '../../../testing/FakeControls.ts';
import { onAddressedBoard }                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, withPipelineFacts } from '../../../testing/PipelineFixture.ts';
import { exampleTranscriptEntry }                                          from '../../../testing/TranscriptEntryFixture.ts';
import { PipelineView }                                                    from '../PipelineView.tsx';

const RESEARCH_ROUTE = { tab: 'pipeline', item: 'setup/research' } as const;

const hashListenerRemovals: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const removal of hashListenerRemovals.splice(0)) removal();
  window.location.hash = '';
});

/** The A1 board while the agent still researches: it has not marked the research ready. */
function researchingBoard(): BoardDocument {
  const board = pipelineBoardStateOf('A1');
  const { setup } = board.pipeline;
  if (setup === null || setup === undefined) throw new Error('the fixture A1 has no setup');
  return withPipelineFacts(board, { setup: { ...setup, record: { ...setup.record, readyToContinue: [] } } });
}

function renderResearch(board: BoardDocument = researchingBoard()) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  controls.render(onAddressedBoard(RESEARCH_ROUTE, (route) => <PipelineView facts={board} route={route} {...pipelineViewServicesOf(transcripts.follow)} />));
  return { controls, transcripts };
}

describe('the findings', () => {
  test('render by topic with their source paths, and the scripts with command and meaning', () => {
    renderResearch();
    expect(screen.getByRole('heading', { name: 'Getting to know Example Agency' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Stack' }).textContent).toContain('tsconfig.json');
    expect(screen.getByRole('region', { name: 'Conventions' }).textContent).toContain('CONTRIBUTING.md');
    const scripts = screen.getByRole('region', { name: 'Scripts' });
    expect(scripts.textContent).toContain('found in package.json; none is run here');
    const rows = within(scripts).getAllByRole('listitem');
    expect(rows[0]?.textContent).toBe('typecheckbun run typecheckChecks the example types.');
  });

  test('a script that needs a network shows the amber dot and its note', () => {
    renderResearch();
    const needs = document.querySelector('.board-pipeline-script-needs');
    expect(needs?.textContent).toBe('Needs network');
    expect(needs?.querySelector('.board-pipeline-script-needs-dot')).not.toBeNull();
  });

  test('the stack chips pop in, and no finding offers to run anything', () => {
    renderResearch();
    const chip = within(screen.getByRole('region', { name: 'Stack' })).getByText('Language · TypeScript');
    expect(chip.hasAttribute('data-pops')).toBe(true);
    expect(screen.queryByRole('button', { name: /run/iu })).toBeNull();
  });

  test('a finding to recheck carries the recheck tag', () => {
    const board = researchingBoard();
    const { setup } = board.pipeline;
    if (setup === null || setup === undefined) throw new Error('no setup');
    const findings = setup.record.findings.map((finding) => (finding.findingId === 'F1' ? { ...finding, needsRecheck: true } : finding));
    renderResearch(withPipelineFacts(board, { setup: { ...setup, record: { ...setup.record, findings } } }));
    expect(within(screen.getByRole('region', { name: 'Stack' })).getByText('recheck').getAttribute('data-change')).toBe('changed');
  });

  test('grey lines stand in before the first finding', () => {
    const board = researchingBoard();
    const { setup } = board.pipeline;
    if (setup === null || setup === undefined) throw new Error('no setup');
    renderResearch(withPipelineFacts(board, { setup: { ...setup, record: { ...setup.record, findings: [] } } }));
    expect(screen.getByRole('status', { name: 'Waiting for the first findings' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Scripts' })).toBeNull();
  });
});

describe('the status', () => {
  test('the line over the page names the agent, the snapshot and the time since its launch', () => {
    renderResearch();
    expect(document.querySelector('.board-pipeline-research-status')?.textContent)
      .toBe('Pipeline agent J4 · researching · snapshot of main at 1111111 · 2m 40s');
    expect(screen.getByText('2 scripts found · 1 open question').getAttribute('aria-live')).toBe('polite');
  });

  test('the panel head says the agent researches, and with a research question open Flint waits on User in the one slot of the page', () => {
    renderResearch();
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByText('Researching')).toBeDefined();
    const flint = within(panel).getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['60x50', 'page']);
    expect(within(panel).getByText('Waiting for your answer', { selector: '.board-pipeline-agent-strip *' })).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });
});

describe('the question card', () => {
  test('Answer sends the chosen letter, and the card turns into the answered pill', async () => {
    const { controls } = renderResearch();
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    fireEvent.click(within(card).getByRole('radio', { name: 'No, leave them out' }));
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['b'] }
    }]);
    expect(card.getAttribute('data-state')).toBe('answered');
    expect(within(card).getByRole('status').textContent).toBe('Answered: No, leave them out');
  });

  test('the Other answer sends its text', async () => {
    const { controls } = renderResearch();
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    fireEvent.click(within(card).getByRole('radio', { name: 'Other' }));
    fireEvent.change(within(card).getByRole('textbox', { name: 'Other answer' }), { target: { value: 'Run them each night' } });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'text', text: 'Run them each night' }
    }]);
  });

  test('a refusal shows verbatim and the card stays open', async () => {
    const { controls } = renderResearch();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: no setup is open.' });
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(screen.getByText('Example refusal: no setup is open.')).toBeDefined();
    expect(card.getAttribute('data-state')).toBe('asking');
  });
});

describe('the agent panel', () => {
  test('while a turn runs the typing line says what the agent does, politely live; between turns it is gone', () => {
    const { transcripts } = renderResearch();
    expect(transcripts.followedJobs()).toEqual(['J4']);
    expect(document.querySelector('.design-system-typing')).toBeNull();
    transcripts.feed('J4', [exampleTranscriptEntry({ cursor: '1.1', role: 'assistant', text: 'Sorting the scripts into build and merge…' })]);
    const typing = document.querySelector('.design-system-typing');
    expect(typing?.getAttribute('aria-live')).toBe('polite');
    expect(typing?.textContent).toBe('Sorting the scripts into build and merge…');
    transcripts.feed('J4', [exampleTranscriptEntry({ cursor: '1.2', role: 'turn-end', text: '' })]);
    expect(document.querySelector('.design-system-typing')).toBeNull();
    expect(screen.getByRole('list', { name: 'Conversation of J4' }).textContent).toContain('Sorting the scripts into build and merge…');
  });

  test('a step prompt Hephaestus sent is its line, shown on User\'s ask, and only User\'s own message is a User bubble', () => {
    const { transcripts } = renderResearch();
    const stepPrompt = 'User completed the research step. The current step is constitution.\n\n### Constitution';
    transcripts.feed('J4', [
      exampleTranscriptEntry({
        cursor: '1.1', role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', text: 'You are the pipeline agent.'
      }),
      exampleTranscriptEntry({
        cursor: '1.2', role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', text: stepPrompt
      }),
      exampleTranscriptEntry({
        cursor: '1.3', role: 'user', clientAct: 'chat', sentBy: 'user', text: 'Keep the lint gate.'
      }),
    ]);
    const conversation = screen.getByRole('list', { name: 'Conversation of J4' });
    expect([...conversation.querySelectorAll('.board-chat-bubble')].map((bubble) => bubble.textContent)).toEqual(['Keep the lint gate.']);
    expect(conversation.textContent).not.toContain('User completed the research step');
    expect([...conversation.querySelectorAll('.board-chat-system')].map((line) => line.textContent)).toEqual([
      'Hephaestus started J4 for the pipeline setupShow prompt',
      'Hephaestus sent a messageShow prompt',
    ]);
    const [, stepPromptButton] = within(conversation).getAllByRole('button', { name: 'Show prompt' });
    if (stepPromptButton === undefined) throw new Error('the step prompt line offers no Show prompt');
    fireEvent.click(stepPromptButton);
    expect(conversation.querySelector('.board-chat-system-text')?.textContent).toBe(stepPrompt);
  });

  test('the composer messages the agent\'s job', async () => {
    const { controls } = renderResearch();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the pipeline agent' }), { target: { value: 'The tests also need Redis.' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-message', jobId: 'J4', text: 'The tests also need Redis.', pictures: [], incidentId: null
    }]);
  });
});

describe('the actions', () => {
  test('Continue is enabled while the agent still researches, and opens the constitution once applied', async () => {
    const { controls } = renderResearch();
    const continueButton = screen.getByRole('button', { name: 'Continue to constitution' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);
    expect(continueButton.hasAttribute('data-attention')).toBe(false);
    await clickSettled(continueButton);
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/setup/constitution');
  });

  test('Continue draws attention once the agent marked the research ready', () => {
    renderResearch(pipelineBoardStateOf('A1'));
    expect(screen.getByRole('button', { name: 'Continue to constitution' }).hasAttribute('data-attention')).toBe(true);
  });

  test('Stop stops the agent\'s job and returns to the resume summary', async () => {
    const { controls } = renderResearch();
    window.location.hash = '#forge/example-tracker/pipeline/setup/research';
    await clickSettled(screen.getByRole('button', { name: 'Stop the pipeline agent' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-stop', jobId: 'J4', mode: 'stop'
    }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline');
  });
});

function finding(findingId: string, topic: BoardResearchFindingDocument['topic'], label: string, value: string | null): BoardResearchFindingDocument {
  return {
    findingId, topic, label, value, sourcePaths: ['package.json'], script: null, needsRecheck: false
  };
}

/**
 * The A1 research over the mono-design entities: the layout reported, web's session runs with a finding and a question, design-system's
 * session stopped with none, and root has no session yet.
 */
function monorepoResearchBoard(): BoardDocument {
  const board = researchingBoard();
  const monorepoSetup = pipelineBoardStateOf('mono-design').pipeline.setup;
  const { setup } = board.pipeline;
  if (setup === null || setup === undefined || monorepoSetup === null || monorepoSetup === undefined) throw new Error('no setup');
  const webFacts = monorepoSetup.entities?.['web'];
  if (webFacts === undefined) throw new Error('the fixture mono-design has no web facts');
  const [researchQuestion] = setup.record.questions;
  if (researchQuestion === undefined) throw new Error('the fixture A1 has no research question');
  const webQuestion = { ...researchQuestion, questionId: 'Q7', question: 'Do web\'s browser tests need the API?' };
  return withPipelineFacts(board, {
    setup: {
      ...setup,
      record: {
        ...setup.record,
        stepStates: { ...setup.record.stepStates, entities: 'not-started' },
        draft:      monorepoSetup.record.draft,
        questions:  [],
        findings:   [...setup.record.findings, finding('F8', 'layout', 'apps/web', 'Next.js'), finding('F9', 'layout', 'packages/design-system', 'components')],
        entities:   {
          'web': {
            agentJobId: 'J5', findings: [finding('F10', 'stack', 'Framework', 'Next.js 14')], questions: [webQuestion], constitution: null, check: null
          },
          'design-system': {
            agentJobId: 'J6', findings: [], questions: [], constitution: null, check: null
          },
        },
      },
      entities: {
        'web':           { ...webFacts, agentJobState: 'running', openQuestionCount: 1 },
        'design-system': { ...webFacts, agentJobState: null, openQuestionCount: 0 },
        'root':          { ...webFacts, agentJobState: null, openQuestionCount: 0 },
      },
    },
  });
}

/** The fragments the address bar moved to, as the page heard them, so a spec waits on the page hearing a move, never on a fixed time. */
function heardFragments(): () => string[] {
  const fragments: string[] = [];
  const listener = (event: HashChangeEvent): void => {
    fragments.push(new URL(event.newURL).hash);
  };
  window.addEventListener('hashchange', listener);
  hashListenerRemovals.push(() => window.removeEventListener('hashchange', listener));
  return () => fragments;
}

function sessionRow(name: string): HTMLElement {
  return within(screen.getByRole('region', { name: 'Research sessions' })).getByRole('button', { name: new RegExp(`^${name},`, 'u') });
}

describe('research per entity', () => {
  test('the layout comes first, and each session\'s row says its state in words', () => {
    renderResearch(monorepoResearchBoard());
    expect(screen.getByRole('region', { name: 'Layout' }).textContent).toContain('packages/design-system');
    expect(['Forge', 'web', 'design-system', 'root'].map((name) => sessionRow(name).getAttribute('aria-label'))).toEqual([
      'Forge, Shared by every entity, Researching, 4 findings',
      'web, app, Researching, 1 finding, 1 open question',
      'design-system, package, Stopped',
      'root, every other path, Not started',
    ]);
    expect(document.querySelector('.board-pipeline-research-status')?.textContent).toContain('one session per entity');
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  test('a press on a row shows that session\'s findings and chat, at its level in the route', async () => {
    const { transcripts } = renderResearch(monorepoResearchBoard());
    expect(sessionRow('Forge').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sessionRow('web'));
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/entity/web/setup/research');
    await waitFor(() => expect(sessionRow('web').getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('region', { name: 'Findings of web' }).textContent).toContain('Only what is in apps/web.');
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByText('Pipeline agent · web')).toBeDefined();
    expect(within(panel).getByRole('group', { name: /Do web's browser tests need the API/u })).toBeDefined();
    await waitFor(() => expect(transcripts.followedJobs()).toContain('J5'));
  });

  test('a stopped session without findings says so', async () => {
    window.location.hash = '#forge/example-tracker/pipeline/entity/design-system/setup/research';
    renderResearch(monorepoResearchBoard());
    expect(screen.getByRole('region', { name: 'Findings of design-system' }).textContent).toContain('Stopped before it found anything.');
  });

  test('Stop on a row stops that session alone', async () => {
    const { controls } = renderResearch(monorepoResearchBoard());
    expect(screen.queryByRole('button', { name: 'Stop design-system\'s session' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Stop web\'s session' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-stop', jobId: 'J5', mode: 'stop'
    }]);
  });

  test('Stop all stops every live session and none that ended, then returns to the resume summary', async () => {
    const { controls } = renderResearch(monorepoResearchBoard());
    const heard = heardFragments();
    expect(screen.queryByRole('button', { name: 'Stop the pipeline agent' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Stop every research session' }));
    await waitFor(() => expect(heard()).toContain('#forge/example-tracker/pipeline'));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-stop', jobId: 'J4', mode: 'stop'
    }, {
      ...SENT_COMMAND_VERSION, kind: 'job-stop', jobId: 'J5', mode: 'stop'
    }]);
  });

  test('Continue opens the entities step', async () => {
    const { controls } = renderResearch(monorepoResearchBoard());
    const heard = heardFragments();
    await clickSettled(screen.getByRole('button', { name: 'Continue to entities' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    }]);
    await waitFor(() => expect(heard()).toContain('#forge/example-tracker/pipeline/setup/entities'));
  });
});
