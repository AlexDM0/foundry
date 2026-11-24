/**
 * The question panel against fake controls, a fake transcript follower and an in-memory board store, driven through the shell's own state
 * hook. What matters: an open agent question shows the panel headed by its asker, id and open-since clock; the question waits in the
 * orange decision card with the one Flint slot; options show as asked, the agent's recommendation a pill beside the label, with their
 * consequences only when noted; Answer posts `decision-answer` with the chosen letter, or User's own words on a decision of one question,
 * and shows a refusal verbatim, disabled while the stream is down; Fold and × hide the panel until a decision opens that was not open at
 * the fold, the fold outlives a reload, and a panel User opened hands the focus back to its opener as it closes; Next question
 * moves along the queue and starts with nothing chosen, and the queue line keeps its whole text on hover; a code-opened decision has no
 * conversation and no steps; the reading tabs switch by click and arrow keys without losing the answer form, and one a later board drops
 * falls back to the background; the steps are the followed transcript's last top-level calls with the question current; earlier answers
 * keep to the ticket; planted markup stays text; and while the detail panel shows the panel is hidden and leaves Esc alone.
 * The shown panel is a workplace of Flint.
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

import type { BoardCommandDocument }                            from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardDecisionDocument }                           from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                   from '../../../@types/board/BoardDocument.ts';
import type { TranscriptFollower }                              from '../../@types/BoardServices.ts';
import type { CommandOutcome }                                  from '../../api/BoardCommandClient.ts';
import { boardPreferenceStoreOf }                               from '../../preferences/PreferenceStore.ts';
import { ControlSurroundingsContext, type ControlAvailability } from '../../shell/ControlAvailability.ts';
import { boardRouteSurroundings, boardHrefOf }                  from '../../testing/BoardRouteSurroundings.tsx';
import { FIXTURE_TRACKER_ID }                                   from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeTranscripts }                        from '../../testing/FakeControls.ts';
import {
  ASKING_TRANSCRIPT,
  DARK_MODE_QUESTION,
  EXAMPLE_FORMAT,
  PARKED_DECISION,
  TWO_QUESTION_DECISION,
  exampleOption,
  exampleQuestionPanelBoard
} from '../../testing/QuestionPanelFixture.ts';
import { QuestionsModelUtil }                                from '../questions/QuestionsModel.ts';
import { QuestionPanel }                                     from './QuestionPanel.tsx';
import { QUESTION_PANEL_CHOICE_NAME, useQuestionPanelState } from './QuestionPanelState.ts';

const PLANTED = '<img src=x onerror="window.planted = true">';

interface HarnessProps {
  readonly board:                BoardDocument;
  readonly storage:              Map<string, string>;
  readonly followTranscript:     TranscriptFollower;
  readonly isHiddenBehindDetail: boolean;
}

/** No decision here is the board's no-pipeline question, which the shell quiets while the setup shows. */
const NO_QUIET_DECISIONS: readonly string[] = [];

function PanelHarness({
  board, storage, followTranscript, isHiddenBehindDetail
}: HarnessProps) {
  const boardStore = useMemo(() => boardPreferenceStoreOf(FIXTURE_TRACKER_ID, () => ({
    getItem:    (key) => storage.get(key) ?? null,
    setItem:    (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  })), [storage]);
  const queue = useMemo(() => QuestionsModelUtil.openDecisionsOf(board), [board]);
  const state = useQuestionPanelState(boardStore, queue, NO_QUIET_DECISIONS);
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
  readonly sent:           BoardCommandDocument[];
  readonly storage:        Map<string, string>;
  readonly feed:           ReturnType<typeof fakeTranscripts>['feed'];
  readonly followed:       () => string[];
  readonly answerNextWith: (outcome: CommandOutcome) => void;
  readonly rerender:       (board: BoardDocument, isHiddenBehindDetail?: boolean) => void;
  readonly reload:         () => void;
}

interface PanelChoice {
  readonly board?:        BoardDocument;
  readonly availability?: ControlAvailability;
  readonly storage?:      Map<string, string>;
}

function renderPanel({ board = exampleQuestionPanelBoard(), availability = 'enabled', storage = new Map() }: PanelChoice = {}): RenderedPanel {
  const sent: BoardCommandDocument[] = [];
  const routes = boardRouteSurroundings();
  const outcomes: CommandOutcome[] = [];
  const transcripts = fakeTranscripts();
  const surroundings = {
    availability,
    commandClient: {
      send: (command: BoardCommandDocument) => {
        sent.push(command);
        const applied: CommandOutcome = { verdict: 'applied', outcome: 'done', result: { startedJobId: null } };
        return Promise.resolve(outcomes.shift() ?? applied);
      },
    },
    pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' as const }) },
    onInstallHeld:       () => undefined,
  };
  const tree = (shownBoard: BoardDocument, isHiddenBehindDetail: boolean): ReactElement => routes.wrap(
    <ControlSurroundingsContext.Provider value={surroundings}>
      <PanelHarness board={shownBoard} storage={storage} followTranscript={transcripts.follow} isHiddenBehindDetail={isHiddenBehindDetail} />
    </ControlSurroundingsContext.Provider>,
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
    const head = panel().querySelector('.board-question-panel-head');
    expect(head?.textContent).toContain('J4 asks User');
    expect(head?.textContent).toContain('Tokens');
    expect(head?.textContent).toContain('E7');
    expect(within(head as HTMLElement).getByRole('link', { name: '#004' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/004'));
    expect(head?.textContent).toContain('builder on');
    expect(head?.textContent).toContain('open since 14:06');
  });

  test('a code-opened decision is Hephaestus\'s, with no conversation tab and no steps block', () => {
    const rendered = renderPanel({ board: exampleQuestionPanelBoard({ decisions: [PARKED_DECISION] }) });
    expect(panel().querySelector('.board-question-panel-head')?.textContent).toContain('Hephaestus asks User');
    expect(within(panel()).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Background']);
    expect(within(panel()).queryByRole('region', { name: /did before it asked/u })).toBeNull();
    expect(rendered.followed()).toEqual([]);
  });
});

describe('the options and the answer', () => {
  test('the decision card holds Flint, "Your decision" with the header, and the question that labels the options', () => {
    renderPanel();
    const flint = within(panel()).getByRole('img', { name: 'Flint, the agent that asks' });
    expect([flint.getAttribute('data-size'), flint.getAttribute('data-ground')]).toEqual(['100', 'decision']);
    const decisionCard = flint.closest('.design-system-card');
    expect(decisionCard?.getAttribute('data-ground')).toBe('decision');
    expect(decisionCard?.textContent).toBe('Your decision · TokensWhere should the account pages\' dark-mode colours live?');
    expect(within(panel()).getByRole('group', { name: 'Where should the account pages\' dark-mode colours live?' })).toBeDefined();
    expect(panel().querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });

  test('a decision of several questions counts them in the decision card and heads each question with its own text', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [TWO_QUESTION_DECISION] }) });
    const decisionCard = within(panel()).getByRole('img', { name: 'Flint, the agent that asks' }).closest('.design-system-card');
    expect(decisionCard?.textContent).toBe('Your decision2 questions from J2');
    expect(within(panel()).getByRole('group', { name: /Which store\?$/u })).toBeDefined();
  });

  test('options show label and description as asked, the recommendation a pill beside the label, and consequences only where noted', () => {
    renderPanel();
    const [recommended, scoped, system] = within(panel()).getAllByRole('radio').map((radio) => radio.closest('label') as HTMLElement);
    expect(within(panel()).getByRole('radio', { name: 'a. Extend the shared theme tokens' })).toBeDefined();
    expect(recommended?.textContent).not.toContain('(Recommended)');
    expect(recommended?.querySelector('.design-system-choice-mark[data-mark="recommended"]')?.textContent).toBe('Recommended');
    expect(scoped?.querySelector('.design-system-choice-mark')).toBeNull();
    expect(within(recommended as HTMLElement).getByText('src/theme/tokens.css').className).toBe('board-path');
    expect([...(recommended as HTMLElement).querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Touches', 'Trade-off', 'Acceptance']);
    expect(scoped?.querySelector('dl')).toBeNull();
    expect(scoped?.textContent).toContain('A new stylesheet only the account pages load.');
    expect([...(system as HTMLElement).querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Acceptance']);
  });

  test('the context shows as why the agent stopped, every option shows, and only the served field marks the recommendation', () => {
    renderPanel();
    expect(within(panel()).getByRole('region', { name: 'Background' }).textContent).toContain(`Why J4 stopped${DARK_MODE_QUESTION.context}`);
    const options = within(panel()).getAllByRole('radio').map((radio) => radio.closest('label') as HTMLElement);
    expect(options.map((option) => option.querySelector('.design-system-choice-mark[data-mark="recommended"]') !== null)).toEqual([true, false, false]);
  });

  test('a label ending in "(Recommended)" without the served field shows as asked and is not marked', () => {
    const labelled: BoardDecisionDocument = {
      ...DARK_MODE_QUESTION,
      questions: [{
        question:    'Where?',
        header:      'Tokens',
        multiSelect: false,
        options:     [exampleOption({ label: 'Keep the tokens (Recommended)' }), exampleOption({ label: 'Split them' })],
      }],
    };
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [labelled] }) });
    expect(within(panel()).getByRole('radio', { name: 'a. Keep the tokens (Recommended)' })).toBeDefined();
    expect(panel().querySelector('.design-system-choice-mark')).toBeNull();
  });

  test('choosing an option and pressing Answer E7 posts decision-answer with its letter', async () => {
    const rendered = renderPanel();
    const answer = within(panel()).getByRole<HTMLButtonElement>('button', { name: 'Answer E7' });
    expect(answer.disabled).toBe(true);
    act(() => within(panel()).getByRole('radio', { name: 'b. A scoped stylesheet for the account pages' }).click());
    await clickSettled(answer);
    expect(rendered.sent).toEqual([{
      boardCommandVersion: 2, kind: 'decision-answer', decisionId: 'E7', answer: { form: 'letters', choices: ['b'] }
    }]);
    expect(panel().querySelector('.board-question-panel-answer-row')?.textContent).toContain('Posts decision-answer E7 for J4');
  });

  test('User\'s own words post as text on a decision of one question, and no box shows on one of two', async () => {
    const rendered = renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }) });
    fireEvent.change(within(panel()).getByLabelText('Or answer in User\'s own words'), { target: { value: 'Tokens, but keep the storefront values' } });
    await clickSettled(within(panel()).getByRole('button', { name: 'Answer E7' }));
    expect(rendered.sent).toEqual([{
      boardCommandVersion: 2, kind: 'decision-answer', decisionId: 'E7', answer: { form: 'text', text: 'Tokens, but keep the storefront values' }
    }]);
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
    expect(JSON.parse(rendered.storage.get(`gaia:board:${FIXTURE_TRACKER_ID}:${QUESTION_PANEL_CHOICE_NAME}`) ?? '[]')).toEqual(['E7']);
    rendered.reload();
    expect(panelIsShown()).toBe(false);
    rendered.rerender(exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }));
    expect(panel().getAttribute('aria-label')).toBe('Question E8 from J2');
  });

  test('a decision opened after Fold to the tab shows the panel again at that new decision, not at the folded one', () => {
    const rendered = renderPanel();
    act(() => within(panel()).getByRole('button', { name: 'Fold to the tab' }).click());
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

  test('a panel User opened hands the focus back to its opener when Esc or Fold to the tab closes it', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION] }) });
    act(() => within(panel()).getByRole('button', { name: 'Close the question panel' }).click());
    const opener = screen.getByRole('button', { name: 'Open E8 from the board' });
    act(() => {
      opener.focus();
      opener.click();
    });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close the question panel');
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect([panelIsShown(), document.activeElement === opener]).toEqual([false, true]);
    act(() => {
      opener.focus();
      opener.click();
    });
    act(() => {
      const fold = within(panel()).getByRole('button', { name: 'Fold to the tab' });
      fold.focus();
      fold.click();
    });
    expect([panelIsShown(), document.activeElement === opener]).toEqual([false, true]);
  });

  test('Next question shows the next decision with nothing chosen, and the foot names the later ids and askers', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION, PARKED_DECISION] }) });
    const foot = (): string => panel().querySelector('.board-question-panel-foot')?.textContent ?? '';
    expect(foot()).toContain('2 more after this: E8 J2 · E6 Hephaestus');
    act(() => within(panel()).getByRole('radio', { name: /^a\./u }).click());
    act(() => within(panel()).getByRole('button', { name: 'Next question' }).click());
    expect(panel().getAttribute('aria-label')).toBe('Question E8 from J2');
    expect(within(panel()).getAllByRole<HTMLInputElement>('radio').some((radio) => radio.checked)).toBe(false);
    expect(foot()).toContain('2 more after this: E6 Hephaestus · E7 J4');
  });

  test('the queue line carries its whole text as its title, so a long queue cut short in the foot still reads whole on hover', () => {
    renderPanel({ board: exampleQuestionPanelBoard({ decisions: [DARK_MODE_QUESTION, TWO_QUESTION_DECISION, PARKED_DECISION] }) });
    const queueLine = panel().querySelector('.board-question-panel-queue-line');
    expect(queueLine?.getAttribute('title')).toBe('2 more after this: E8 J2 · E6 Hephaestus');
  });

  test('a decision of its own in the queue offers no Next question', () => {
    renderPanel();
    expect(within(panel()).queryByRole('button', { name: 'Next question' })).toBeNull();
    expect(panel().querySelector('.board-question-panel-foot')?.textContent).toContain('No other question waits.');
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

  test('a ticket tab a later board drops falls back to the background tab, selected and reachable by Tab', () => {
    const rendered = renderPanel();
    act(() => within(panel()).getByRole('tab', { name: 'Ticket #004' }).click());
    rendered.rerender(exampleQuestionPanelBoard({ tickets: [] }));
    const reachable = within(panel()).getAllByRole('tab').filter((tab) => tab.tabIndex === 0);
    expect(reachable.map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['Background', 'true']]);
    expect(within(panel()).getByRole('tabpanel').getAttribute('aria-label')).toBe('Background');
  });

  test('the steps are the last six top-level tool calls of the followed transcript, the question current', () => {
    const rendered = renderPanel();
    expect(rendered.followed()).toEqual(['J4']);
    rendered.feed('J4', ASKING_TRANSCRIPT);
    const steps = within(panel()).getByRole('list', { name: 'The last tool calls of J4' });
    const lines = [...steps.querySelectorAll('li')];
    expect(lines.map((line) => line.querySelector('.design-system-keyed-line-key')?.textContent)).toEqual(['Read', 'Grep', 'Read', 'Bash', 'Glob', 'AskUserQuestion']);
    expect(lines.at(-1)?.getAttribute('data-mark')).toBe('current');
    expect(lines.at(-1)?.textContent).toContain('E7, waiting on User');
    expect(within(panel()).getByRole('button', { name: 'All 38 calls in the J4 conversation' })).toBeDefined();
  });

  test('the ticket shows its Wanted, Brief and Acceptance as text, and Answered earlier lists that ticket\'s answers only', () => {
    renderPanel();
    const ticket = panel().querySelector('.board-question-panel-ticket') as HTMLElement;
    expect(ticket.textContent).toContain('WantedThe account pages follow the system colour scheme.');
    expect(ticket.textContent).toContain('Work belongs in `src/account/**`.');
    expect([...ticket.querySelectorAll('.board-question-panel-acceptance li')].map((item) => item.textContent)).toEqual([
      'A1Every account page follows the system colour scheme.', 'A2An override is remembered per browser.', 'A3No account component hard-codes a hex value.',
    ]);
    expect(ticket.querySelector('.board-question-panel-held-count')?.textContent).toBe('↦ 2');
    const earlier = within(panel()).getByRole('list', { name: 'Earlier answers on #004' });
    expect([...earlier.querySelectorAll('li')].map((line) => line.textContent)).toEqual(['E3 13:52Auto · Light · Dark · account header']);
  });

  test('planted markup in a question, an option, the context, a path or an Acceptance item reaches the DOM only as text', () => {
    const planted: BoardDecisionDocument = {
      ...DARK_MODE_QUESTION,
      context:   `Why ${PLANTED}`,
      questions: [{
        question:    `Which ${PLANTED}?`,
        header:      'Planted',
        multiSelect: false,
        options:     [exampleOption({
          label: PLANTED, description: PLANTED, touches: [PLANTED], tradeOff: PLANTED
        })],
      }],
    };
    const [ticket] = exampleQuestionPanelBoard().page.tickets;
    if (ticket === undefined) throw new Error('no example ticket');
    renderPanel({
      board: exampleQuestionPanelBoard({
        decisions: [planted],
        tickets:   [{ ...ticket, title: 'Planted', acceptanceItems: [{ label: 'A1', text: PLANTED, waived: false }] }],
      }),
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
    expect(document.querySelector('.board-question-panel[hidden] .design-system-side-panel')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.board-question-panel[hidden] .design-system-side-panel')).not.toBeNull();
    rendered.rerender(exampleQuestionPanelBoard(), false);
    expect(panel().closest('.board-question-panel')?.hasAttribute('hidden')).toBe(false);
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

test('the shown panel is a workplace of Flint', () => {
  renderPanel();
  expect(panel().closest('.board-question-panel')?.hasAttribute('data-flint-workplace')).toBe(true);
});
