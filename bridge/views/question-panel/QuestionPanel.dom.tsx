/**
 * The question panel against fake controls, a fake transcript follower and an in-memory board store, driven through the shell's own state
 * hook. What matters: an open agent question shows the panel headed by its asker, id and open-since clock; options show exactly as asked
 * with their consequences only when noted; Answer posts `decision-answer` with the chosen letter, or User's own words on a decision of one
 * question, and shows a refusal verbatim, disabled while the stream is down; Fold and × hide the panel until a decision opens that was not
 * open at the fold, and the fold outlives a reload; Next question moves along the queue and starts with nothing chosen; a code-opened
 * decision has no conversation and no steps; the reading tabs switch by click and arrow keys without losing the answer form; the steps
 * are the followed transcript's last top-level calls with the question current; earlier answers keep to the ticket; planted markup stays
 * text; and while the detail panel shows the panel is hidden and leaves Esc alone.
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
import { useMemo, type ReactElement } from 'react';

import { PRODUCT_NAMES }                                        from '../../../src/shared/constants/ProductNames.ts';
import type { DecisionDocument }                                from '../../@types/ConversationDocuments.ts';
import type { CommandOutcome, ControlCommandBody }              from '../../api/CommandClient.ts';
import { OpenDecisionsUtil }                                    from '../../conversation/OpenDecisionsUtil.ts';
import type { TranscriptFollower }                              from '../../conversation/TranscriptLog.tsx';
import { boardPreferenceStoreOf }                               from '../../preferences/PreferenceStore.ts';
import { ControlSurroundingsContext, type ControlAvailability } from '../../shell/ControlAvailability.ts';
import { clickSettled, fakeTranscripts }                        from '../../testing/FakeControls.ts';
import {
  ASKING_TRANSCRIPT,
  DARK_MODE_QUESTION,
  EXAMPLE_FORMAT,
  PARKED_DECISION,
  TWO_QUESTION_DECISION,
  exampleQuestionPanelBoard
} from '../../testing/QuestionPanelFixture.ts';
import { QuestionPanel }                                     from './QuestionPanel.tsx';
import type { QuestionPanelBoard }                           from './QuestionPanelModel.ts';
import { QUESTION_PANEL_CHOICE_NAME, useQuestionPanelState } from './QuestionPanelState.ts';

const PLANTED = '<img src=x onerror="window.planted = true">';

interface HarnessProps {
  readonly board:                QuestionPanelBoard;
  readonly storage:              Map<string, string>;
  readonly followTranscript:     TranscriptFollower;
  readonly isHiddenBehindDetail: boolean;
}

function PanelHarness({
  board, storage, followTranscript, isHiddenBehindDetail
}: HarnessProps) {
  const boardStore = useMemo(() => boardPreferenceStoreOf('example-tracker', () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  })), [storage]);
  const queue = useMemo(() => OpenDecisionsUtil.openDecisionsOf(board), [board]);
  const state = useQuestionPanelState(boardStore, queue);
  return (
    <>
      <button type="button" onClick={() => state.open('E8')}>Open E8 from the board</button>
      <QuestionPanel
        board={board}
        queue={queue}
        shownDecision={state.shownDecision}
        isHiddenBehindDetail={isHiddenBehindDetail}
        format={EXAMPLE_FORMAT}
        followTranscript={followTranscript}
        onFold={state.fold}
        onClose={state.close}
        onNext={state.showNext}
        focusesCloseOnOpen={() => state.openedByUser}
      />
    </>
  );
}

interface RenderedPanel {
  readonly sent:           ControlCommandBody[];
  readonly storage:        Map<string, string>;
  readonly feed:           ReturnType<typeof fakeTranscripts>['feed'];
  readonly followed:       () => string[];
  readonly answerNextWith: (outcome: CommandOutcome) => void;
  readonly rerender:       (board: QuestionPanelBoard, isHiddenBehindDetail?: boolean) => void;
  readonly reload:         () => void;
}

interface PanelChoice {
  readonly board?:        QuestionPanelBoard;
  readonly availability?: ControlAvailability;
  readonly storage?:      Map<string, string>;
}

function renderPanel({ board = exampleQuestionPanelBoard(), availability = 'enabled', storage = new Map() }: PanelChoice = {}): RenderedPanel {
  const sent: ControlCommandBody[] = [];
  const outcomes: CommandOutcome[] = [];
  const transcripts = fakeTranscripts();
  const surroundings = {
    availability,
    commandClient: {
      send: (command: ControlCommandBody) => {
        sent.push(command);
        const applied: CommandOutcome = { verdict: 'applied', outcome: 'done', result: null };
        return Promise.resolve(outcomes.shift() ?? applied);
      },
    },
    onInstallHeld: () => undefined,
  };
  const tree = (shownBoard: QuestionPanelBoard, isHiddenBehindDetail: boolean): ReactElement => (
    <ControlSurroundingsContext.Provider value={surroundings}>
      <PanelHarness board={shownBoard} storage={storage} followTranscript={transcripts.follow} isHiddenBehindDetail={isHiddenBehindDetail} />
    </ControlSurroundingsContext.Provider>
  );
  let rendered = render(tree(board, false));
  return {
    sent,
    storage,
    feed:           transcripts.feed,
    followed:       transcripts.followedJobs,
    answerNextWith: (outcome) => {
      outcomes.push(outcome);
    },
    rerender: (shownBoard, isHiddenBehindDetail = false) => rendered.rerender(tree(shownBoard, isHiddenBehindDetail)),
    reload:   () => {
      cleanup();
      rendered = render(tree(board, false));
    },
  };
}

function panel(): HTMLElement {
  return screen.getByRole('complementary');
}

function panelIsShown(): boolean {
  return screen.queryByRole('complementary') !== null;
}

afterEach(() => {
  cleanup();
});

describe('the head', () => {
  test('one open agent question shows the panel headed by its asker, the id, its ticket and the open-since clock', () => {
    renderPanel();
    expect(panel().getAttribute('aria-label')).toBe('Question E7 from J4');
    const head = panel().querySelector('.bridge-question-panel-head');
    expect(head?.textContent).toContain('J4 asks User');
    expect(head?.textContent).toContain('Tokens');
    expect(head?.textContent).toContain('E7');
    expect(within(head as HTMLElement).getByRole('link', { name: '#004' }).getAttribute('href')).toBe('#tickets/ticket-row/004');
    expect(head?.textContent).toContain('builder on');
    expect(head?.textContent).toContain('open since 14:06');
  });

  test('a code-opened decision is the Overseer\'s, with no conversation tab and no steps block', () => {
    const rendered = renderPanel({ board: exampleQuestionPanelBoard({ decisions: [PARKED_DECISION] }) });
    expect(panel().querySelector('.bridge-question-panel-head')?.textContent).toContain('Overseer asks User');
    expect(within(panel()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Background']);
    expect(within(panel()).queryByRole('region', { name: /did before it asked/u })).toBeNull();
    expect(rendered.followed()).toEqual([]);
  });
});

describe('the options and the answer', () => {
  test('options show label and description exactly as asked, and Touches, Trade-off and Acceptance only where noted', () => {
    renderPanel();
    const [recommended, scoped, system] = within(panel()).getAllByRole('radio').map((radio) => radio.closest('label') as HTMLElement);
    expect(recommended?.textContent).toContain('Extend the shared theme tokens (Recommended)');
    expect(within(recommended as HTMLElement).getByText('src/theme/tokens.css').className).toBe('bridge-path');
    expect([...(recommended as HTMLElement).querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Touches', 'Trade-off', 'Acceptance']);
    expect(scoped?.querySelector('dl')).toBeNull();
    expect(scoped?.textContent).toContain('A new stylesheet only the account pages load.');
    expect([...(system as HTMLElement).querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Acceptance']);
  });

  test('choosing an option and pressing Answer E7 posts decision-answer with its letter', async () => {
    const rendered = renderPanel();
    const answer = within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Answer E7' });
    expect(answer.disabled).toBe(true);
    act(() => within(panel()).getByRole('radio', { name: 'b. A scoped stylesheet for the account pages' }).click());
    await clickSettled(answer);
    expect(rendered.sent).toEqual([{ kind: 'decision-answer', decisionId: 'E7', answer: { form: 'letters', choices: ['b'] } }]);
    expect(panel().querySelector('.bridge-question-panel-answer-row')?.textContent).toContain('Posts decision-answer E7 for J4');
  });

  test('User\'s own words post as text on a decision of one question, and no box shows on one of two', async () => {
    const rendered = renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }) });
    fireEvent.change(within(panel()).getByLabelText('Or answer in User\'s own words'), { target: { value: 'Tokens, but keep the storefront values' } });
    await clickSettled(within(panel()).getByRole('button', { name: 'Answer E7' }));
    expect(rendered.sent).toEqual([{ kind: 'decision-answer', decisionId: 'E7', answer: { form: 'text', text: 'Tokens, but keep the storefront values' } }]);
    act(() => within(panel()).getByRole('button', { name: 'Next question' }).click());
    expect(within(panel()).queryByLabelText('Or answer in User\'s own words')).toBeNull();
  });

  test('a refusal shows verbatim beside Answer', async () => {
    const rendered = renderPanel();
    rendered.answerNextWith({ verdict: 'refused', refusal: 'E7 was answered already.' });
    act(() => within(panel()).getByRole('radio', { name: /^a\./u }).click());
    await clickSettled(within(panel()).getByRole('button', { name: 'Answer E7' }));
    expect(within(panel()).getByRole('status').textContent).toBe('E7 was answered already.');
  });

  test('Answer stays disabled while the stream is down, whatever is chosen', () => {
    renderPanel({ availability: 'stream-down' });
    act(() => within(panel()).getByRole('radio', { name: /^a\./u }).click());
    expect(within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Answer E7' }).disabled).toBe(true);
  });
});

describe('folding and the queue', () => {
  test('Fold to the tab hides the panel until a decision opens that was not open at the fold, and a reload keeps the fold', () => {
    const rendered = renderPanel();
    act(() => within(panel()).getByRole('button', { name: 'Fold to the tab' }).click());
    expect(panelIsShown()).toBe(false);
    expect(JSON.parse(rendered.storage.get(`${PRODUCT_NAMES.STORAGE_PREFIX}:example-tracker:${QUESTION_PANEL_CHOICE_NAME}`) ?? '[]')).toEqual(['E7']);
    rendered.reload();
    expect(panelIsShown()).toBe(false);
    rendered.rerender(exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }));
    expect(panel().getAttribute('aria-label')).toBe('Question E8 from J2');
  });

  test('× hides the panel as well, and a press on the board opens it again at that decision', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }) });
    act(() => within(panel()).getByRole('button', { name: 'Close the question panel' }).click());
    expect(panelIsShown()).toBe(false);
    act(() => screen.getByRole('button', { name: 'Open E8 from the board' }).click());
    expect(panel().getAttribute('aria-label')).toBe('Question E8 from J2');
  });

  test('Next question shows the next decision with nothing chosen, and the foot names the later ids and askers', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [PARKED_DECISION, DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }) });
    const foot = (): string => panel().querySelector('.bridge-question-panel-foot')?.textContent ?? '';
    expect(foot()).toContain('2 more after this: E8 J2 · E6 Overseer');
    act(() => within(panel()).getByRole('radio', { name: /^a\./u }).click());
    act(() => within(panel()).getByRole('button', { name: 'Next question' }).click());
    expect(panel().getAttribute('aria-label')).toBe('Question E8 from J2');
    expect(within(panel()).getAllByRole<HTMLInputElement>('radio').some((radio) => radio.checked)).toBe(false);
    expect(foot()).toContain('2 more after this: E6 Overseer · E7 J4');
  });

  test('a decision of its own in the queue offers no Next question', () => {
    renderPanel();
    expect(within(panel()).queryByRole('button', { name: 'Next question' })).toBeNull();
    expect(panel().querySelector('.bridge-question-panel-foot')?.textContent).toContain('No other question waits.');
  });
});

describe('the background', () => {
  test('the reading tabs switch by click and by arrow key, and the answer form keeps its choice', () => {
    renderPanel();
    act(() => within(panel()).getByRole('radio', { name: /^c\./u }).click());
    act(() => within(panel()).getByRole('tab', { name: 'Ticket #004' }).click());
    expect(panel().querySelector('iframe')?.getAttribute('title')).toBe('Description of Account pages dark mode');
    fireEvent.keyDown(within(panel()).getByRole('tab', { name: 'Ticket #004' }), { key: 'ArrowRight' });
    expect(within(panel()).getByRole('tab', { name: 'J4 conversation' }).getAttribute('aria-selected')).toBe('true');
    expect(within(panel()).getByRole<HTMLInputElement>('radio', { name: /^c\./u }).checked).toBe(true);
  });

  test('the steps are the last six top-level tool calls of the followed transcript, the question current', () => {
    const rendered = renderPanel();
    expect(rendered.followed()).toEqual(['J4']);
    rendered.feed('J4', ASKING_TRANSCRIPT);
    const steps = within(panel()).getByRole('list', { name: 'The last tool calls of J4' });
    const lines = [...steps.querySelectorAll('li')];
    expect(lines.map((line) => line.querySelector('.bridge-keyed-line-key')?.textContent)).toEqual(['Read', 'Grep', 'Read', 'Bash', 'Glob', 'AskUserQuestion']);
    expect(lines.at(-1)?.getAttribute('data-mark')).toBe('current');
    expect(lines.at(-1)?.textContent).toContain('E7, waiting on User');
    expect(within(panel()).getByRole('button', { name: 'All 38 calls in the J4 conversation' })).toBeDefined();
  });

  test('the ticket shows its Wanted, Brief and Acceptance as text, and Answered earlier lists that ticket\'s answers only', () => {
    renderPanel();
    const ticket = panel().querySelector('.bridge-question-panel-ticket') as HTMLElement;
    expect(ticket.textContent).toContain('WantedThe account pages follow the system colour scheme.');
    expect(ticket.textContent).toContain('Work belongs in `src/account/**`.');
    expect([...ticket.querySelectorAll('.bridge-question-panel-acceptance li')].map((item) => item.textContent)).toEqual([
      'A1Every account page follows the system colour scheme.', 'A2An override is remembered per browser.', 'A3No account component hard-codes a hex value.',
    ]);
    expect(ticket.querySelector('.bridge-question-panel-held-count')?.textContent).toBe('↦ 2');
    const earlier = within(panel()).getByRole('list', { name: 'Earlier answers on #004' });
    expect([...earlier.querySelectorAll('li')].map((line) => line.textContent)).toEqual(['E3 13:52Auto · Light · Dark · account header']);
  });

  test('planted markup in a question, an option, the context, a path or an Acceptance item reaches the DOM only as text', () => {
    const planted: DecisionDocument = {
      ...DARK_MODE_QUESTION,
      context:   `Why ${PLANTED}`,
      questions: [{
        question:    `Which ${PLANTED}?`,
        header:      'Planted',
        multiSelect: false,
        options:     [{
          label: PLANTED, description: PLANTED, touches: [PLANTED], tradeOff: PLANTED
        }]
      }],
    };
    const board = exampleQuestionPanelBoard({ decisions: [planted] });
    const [ticket] = board.page?.tickets ?? [];
    renderPanel({
      board: {
        ...board,
        page: board.page === undefined
          ? undefined
          : {
            ...board.page,
            tickets: [{
              ...ticket, id: '004', title: 'Planted', status: 'in-progress', acceptanceItems: [{ label: 'A1', text: PLANTED, waived: false }]
            }]
          },
      } as QuestionPanelBoard,
    });
    expect(panel().querySelector('img')).toBeNull();
    expect(panel().textContent).toContain(PLANTED);
  });
});

describe('beside the detail panel', () => {
  test('while the detail panel shows the panel stays mounted but hidden and leaves Esc alone; then Esc closes it', () => {
    const rendered = renderPanel();
    rendered.rerender(exampleQuestionPanelBoard(), true);
    expect(panelIsShown()).toBe(false);
    expect(document.querySelector('.bridge-question-panel[hidden] .bridge-side-panel')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.bridge-question-panel[hidden] .bridge-side-panel')).not.toBeNull();
    rendered.rerender(exampleQuestionPanelBoard(), false);
    expect(panel().closest('.bridge-question-panel')?.hasAttribute('hidden')).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panelIsShown()).toBe(false);
  });

  test('an Esc an inner layer already took leaves the panel open', () => {
    renderPanel();
    const taken = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    taken.preventDefault();
    act(() => {
      document.dispatchEvent(taken);
    });
    expect(panelIsShown()).toBe(true);
  });
});
