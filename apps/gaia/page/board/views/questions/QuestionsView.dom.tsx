/**
 * The Questions inbox against fake controls. What matters: each decision shows its questions and options exactly as asked, an escalated
 * report as the agent wrote it, and the answer posts `decision-answer` with the chosen letters or free text; the first answer wins and a
 * later one shows Hephaestus's refusal verbatim; the open-question count leads the tab title and a new decision raises one notification;
 * a finding is no question; the view opens with its title row; planted markup in a question reaches the DOM only as text; an option shows
 * the consequences its agent noted; each open card opens the question panel at itself beside the board, and while the panel shows a
 * decision the view says so, so a wide window keeps the list clear of the panel. A spec or plan agent's question opens its document at the
 * line it asks on.
 * The view is a workplace of Flint.
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
import type { ReactElement } from 'react';

import type { BoardDecisionDocument }          from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                  from '../../../@types/board/BoardDocument.ts';
import type { QuestionNotifier }               from '../../@types/QuestionNotifier.ts';
import { QuestionPanelOpenerContext }          from '../../shared/routing/QuestionPanelOpener.ts';
import { boardRouteSurroundings, boardHrefOf } from '../../testing/BoardRouteSurroundings.tsx';
import {
  boardStateFixture,
  DIRTY_CHECKOUT_NOTICE,
  exampleAgentJob,
  exampleTicket
} from '../../testing/BoardStateFixture.ts';
import { clickSettled, fakeControls }      from '../../testing/FakeControls.ts';
import { decisionRecordOf, exampleOption } from '../../testing/QuestionPanelFixture.ts';
import { QuestionAlerts }                  from './QuestionAlerts.ts';
import { QuestionsView }                   from './QuestionsView.tsx';

const AT = '2026-10-29T20:00:00+01:00';
const PLANTED = '<img src=x onerror="window.planted = true">';

const AGENT_QUESTION: BoardDecisionDocument = {
  id:        'E2',
  kind:      'agent-question',
  ticketIds: ['042'],
  jobId:     'J3',
  askedBy:   'builder',
  context:   '',
  openedAt:  AT,
  document:  null,
  anchor:    null,
  placement: null,
  questions: [{
    question:    `Which store should the cache use? ${PLANTED}`,
    header:      'Store',
    multiSelect: false,
    options:     [exampleOption({ letter: 'a', label: 'Disk', description: 'Survives a restart' }), exampleOption({ letter: 'b', label: 'Memory', description: 'Faster' })],
  }],
};

const ESCALATED: BoardDecisionDocument = {
  ...AGENT_QUESTION,
  id:        'E3',
  questions: [
    {
      question:    'The Brief names bridge/old/, which does not exist. Where?',
      header:      'ticket',
      multiSelect: false,
      options:     [exampleOption({ letter: 'a', label: 'bridge/views/' })]
    },
    {
      question:    'Which targets?',
      header:      'Targets',
      multiSelect: true,
      options:     [exampleOption({ letter: 'a', label: 'main' }), exampleOption({ letter: 'b', label: 'group' })]
    },
  ],
};

const BOARD: BoardDocument = boardStateFixture({
  jobs:                 [exampleAgentJob({ id: 'J3', ticketIds: ['042'], state: 'waiting-for-answer' })],
  decisions:            [AGENT_QUESTION, ESCALATED],
  openDecisionIds:      ['E2', 'E3'],
  escalatedDecisionIds: ['E3'],
  incidents:            [],
  notices:              [DIRTY_CHECKOUT_NOTICE],
  page:                 {
    ...boardStateFixture().page,
    tickets: [exampleTicket({
      id: '050', title: 'Finding for User', status: 'draft', priority: 'low', filedByJob: 'J3'
    })],
  },
  questionHistory: [],
});

/** A view under the fixture's tracker, as a mounted board draws it. */
function inBoard(view: ReactElement): ReactElement {
  return boardRouteSurroundings().wrap(view);
}

function notifierSpy(): QuestionNotifier & { readonly titles: string[]; readonly notified: string[] } {
  const titles: string[] = [];
  const notified: string[] = [];
  return {
    titles,
    notified,
    allowance:         () => 'granted',
    askAllowance:      () => Promise.resolve('granted'),
    notify:            (title) => notified.push(title),
    setDocumentTitle:  (title) => titles.push(title),
    baseDocumentTitle: 'agent-progress',
  };
}

afterEach(() => {
  cleanup();
});

describe('the Questions inbox', () => {
  test('shows each question and its options exactly as asked, planted markup as text, and the escalated report marked', () => {
    fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    const card = screen.getByRole('listitem', { name: 'Question E2' });
    expect(within(card).getByText(`Which store should the cache use? ${PLANTED}`)).toBeDefined();
    expect(within(card).getByLabelText('a. Disk')).toBeDefined();
    expect(within(card).getByText('Survives a restart')).toBeDefined();
    expect(document.querySelector('img')).toBeNull();
    const escalated = screen.getByRole('listitem', { name: 'Question E3' });
    expect(within(escalated).getByText('The Brief names bridge/old/, which does not exist. Where?')).toBeDefined();
    expect(within(escalated).getByText(/escalated by the Assistant/)).toBeDefined();
  });

  test('lists the open questions in the answering order the forge serves, not in the order they opened', () => {
    fakeControls().render(inBoard(<QuestionsView board={{ ...BOARD, openDecisionIds: ['E3', 'E2'] }} notifier={notifierSpy()} />));
    const openQuestions = screen.getByRole('region', { name: 'Open questions' });
    expect(within(openQuestions).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'))).toEqual(['Question E3', 'Question E2']);
  });

  test('answers with decision-answer: an option letter, or free text, which typing alone chooses', async () => {
    const controls = fakeControls();
    controls.render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    const card = screen.getByRole('listitem', { name: 'Question E2' });
    const answer = within(card).getByRole<HTMLButtonElement>('button', { name: 'Answer' });
    expect(answer.disabled).toBe(true);
    fireEvent.click(within(card).getByLabelText('b. Memory'));
    await clickSettled(answer);
    const ownWords = within(card).getByRole('textbox', { name: 'Your answer in your own words' });
    fireEvent.change(ownWords, { target: { value: 'Disk, but bounded' } });
    expect(within(card).getByRole<HTMLInputElement>('radio', { name: 'Or answer in your own words' }).checked).toBe(true);
    expect(within(card).getByRole<HTMLInputElement>('radio', { name: 'b. Memory' }).checked).toBe(false);
    await clickSettled(answer);
    expect(controls.sent).toEqual([
      {
        boardCommandVersion: 3, kind: 'decision-answer', decisionId: 'E2', answer: { form: 'letters', choices: ['b'] }
      },
      {
        boardCommandVersion: 3, kind: 'decision-answer', decisionId: 'E2', answer: { form: 'text', text: 'Disk, but bounded' }
      },
    ]);
  });

  test('a multi-select question takes several letters, and every question needs a choice', async () => {
    const controls = fakeControls();
    controls.render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    const card = screen.getByRole('listitem', { name: 'Question E3' });
    const answer = within(card).getByRole<HTMLButtonElement>('button', { name: 'Answer' });
    fireEvent.click(within(card).getByLabelText('a. bridge/views/'));
    expect(answer.disabled).toBe(true);
    fireEvent.click(within(card).getByLabelText('b. group'));
    fireEvent.click(within(card).getByLabelText('a. main'));
    await clickSettled(answer);
    expect(controls.sent).toEqual([{
      boardCommandVersion: 3, kind: 'decision-answer', decisionId: 'E3', answer: { form: 'letters', choices: ['a', 'ab'] }
    }]);
  });

  test('the first answer wins: a later one shows the forge\'s refusal verbatim', async () => {
    const controls = fakeControls();
    controls.render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    const card = screen.getByRole('listitem', { name: 'Question E2' });
    fireEvent.click(within(card).getByLabelText('a. Disk'));
    controls.answerNextWith({ verdict: 'refused', refusal: 'Decision E2 is already answered.' });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(within(card).getByRole('status').textContent).toBe('Decision E2 is already answered.');
  });

  test('shows the notices and an answered decision from the log', () => {
    const answeredBoard = { ...BOARD, questionHistory: [decisionRecordOf('decision-answered', AT, 'E1', { answer: { 'Which?': 'Disk' } })] };
    fakeControls().render(inBoard(<QuestionsView board={answeredBoard} notifier={notifierSpy()} />));
    const notices = within(screen.getByRole('region', { name: 'Notices' }));
    expect(notices.getByText('dirty-main-checkout')).toBeDefined();
    expect(notices.getByText(/^landings on main wait/u)).toBeDefined();
    const answered = screen.getByRole('listitem', { name: 'Answered E1' });
    expect(answered.textContent).toContain('Which? Disk');
    expect(answered.querySelector('.design-system-state-badge[data-state-tone="success"]')?.textContent).toBe('Answered');
  });

  test('opens with its title row: the page title as a heading under the header, and its sentence', () => {
    fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    const title = screen.getByRole('heading', { level: 2, name: 'Questions' });
    expect(title.getAttribute('data-type-role')).toBe('display');
    expect(title.nextElementSibling?.textContent).toBe('Agents stop here when they need User\'s answer.');
  });
});

describe('beside the board', () => {
  test('an option shows what it touches, trades off and does to the Acceptance once noted, and an option with none shows no facts', () => {
    const noted: BoardDecisionDocument = {
      ...AGENT_QUESTION,
      questions: [{
        ...AGENT_QUESTION.questions[0] ?? { question: '', header: '', multiSelect: false },
        options: [
          exampleOption({
            letter:           'a',
            label:            'Disk',
            description:      'Survives a restart',
            touches:          ['src/cache/DiskStore.ts'],
            tradeOff:         'Slower reads',
            acceptanceEffect: 'meets A1'
          }),
          exampleOption({ letter: 'b', label: 'Memory', description: 'Faster' }),
        ],
      }],
    };
    fakeControls().render(inBoard(<QuestionsView board={{ ...BOARD, decisions: [noted] }} notifier={notifierSpy()} />));
    const card = screen.getByRole('listitem', { name: 'Question E2' });
    const [disk, memory] = within(card).getAllByRole('radio').map((radio) => radio.closest('label') as HTMLElement);
    expect([...(disk as HTMLElement).querySelectorAll('dt')].map((term) => term.textContent)).toEqual(['Touches', 'Trade-off', 'Acceptance']);
    expect(within(disk as HTMLElement).getByText('src/cache/DiskStore.ts').className).toBe('board-path');
    expect(memory?.querySelector('dl')).toBeNull();
  });

  test('Open beside the board opens the question panel at that card\'s decision', () => {
    const opened: string[] = [];
    fakeControls().render(inBoard(
      <QuestionPanelOpenerContext.Provider value={(decisionId) => opened.push(decisionId)}>
        <QuestionsView board={BOARD} notifier={notifierSpy()} />
      </QuestionPanelOpenerContext.Provider>,
    ));
    fireEvent.click(within(screen.getByRole('listitem', { name: 'Question E3' })).getByRole('button', { name: 'Open beside the board' }));
    expect(opened).toEqual(['E3']);
  });

  test('the view marks the question panel open only while it shows a decision', () => {
    const isMarkedOpen = (selectedDecisionId: string | null): boolean | undefined => {
      const { container } = fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} selectedDecisionId={selectedDecisionId} />));
      const isOpen = container.querySelector('.board-view')?.hasAttribute('data-question-open');
      cleanup();
      return isOpen;
    };
    expect([isMarkedOpen('E2'), isMarkedOpen(null)]).toEqual([true, false]);
  });

  test('the card of the decision the panel shows says it is open beside the board, and no other card does', () => {
    fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} selectedDecisionId="E2" />));
    const shown = screen.getByRole('listitem', { name: 'Question E2' });
    const other = screen.getByRole('listitem', { name: 'Question E3' });
    expect([shown.hasAttribute('data-open-beside'), other.hasAttribute('data-open-beside')]).toEqual([true, false]);
    expect([within(shown).queryByText('open beside the board') === null, within(other).queryByText('open beside the board') === null]).toEqual([false, true]);
  });
});

describe('a finding is no question', () => {
  test('a draft finding on the board adds no section and no count', () => {
    fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
    expect(screen.queryByText('Finding for User')).toBeNull();
    const openQuestions = screen.getByRole('region', { name: 'Open questions' });
    expect(within(openQuestions).getByRole('heading', { name: 'Open questions' })).toBeDefined();
    expect(openQuestions.querySelector('.design-system-section-count')?.textContent).toBe('2');
  });
});

describe('questions reach User wherever User is', () => {
  function AlertsProbe({ decisions, notifier }: { readonly decisions: readonly BoardDecisionDocument[] | null; readonly notifier: QuestionNotifier }) {
    QuestionAlerts.useOpenQuestionAlerts(decisions, notifier);
    return null;
  }

  test('the count leads the tab title, and only a decision opened after the first board raises a notification', () => {
    const notifier = notifierSpy();
    const view = render(<AlertsProbe decisions={[AGENT_QUESTION]} notifier={notifier} />);
    act(() => view.rerender(<AlertsProbe decisions={[AGENT_QUESTION, ESCALATED]} notifier={notifier} />));
    act(() => view.rerender(<AlertsProbe decisions={[]} notifier={notifier} />));
    expect(notifier.titles).toEqual(['(1) agent-progress', '(2) agent-progress', 'agent-progress']);
    expect(notifier.notified).toEqual(['Question E3']);
  });

  test('the notification permission is asked for only from a click', async () => {
    let asked = 0;
    const notifier = {
      ...notifierSpy(),
      allowance:    () => 'default' as const,
      askAllowance: () => {
        asked += 1;
        return Promise.resolve('granted' as const);
      }
    };
    fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifier} />));
    expect(asked).toBe(0);
    await clickSettled(screen.getByRole('button', { name: 'Notify me of new questions' }));
    expect(asked).toBe(1);
    expect(screen.queryByRole('button', { name: 'Notify me of new questions' })).toBeNull();
  });
});

test('the view is a workplace of Flint', () => {
  const { container } = fakeControls().render(inBoard(<QuestionsView board={BOARD} notifier={notifierSpy()} />));
  expect(container.querySelector('.board-view')?.hasAttribute('data-flint-workplace')).toBe(true);
});

describe('a spec agent\'s question in the inbox', () => {
  test('opens its document at the line it asks on now, else where it asked, on that question, and no other question offers a document', () => {
    const anchor = {
      view: 'code', versionNumber: 4, lines: { from: 14, to: 14 }, columns: null, sectionPath: ['3 Behaviour'], quote: null, surroundingLines: { from: 12, to: 16 }, diagram: null,
    } as const;
    const onSpec = {
      ...AGENT_QUESTION, id: 'E7', ticketIds: ['004'], document: 'spec', anchor, placement: { from: 16, to: 16 }
    } as const;
    const gone = { ...onSpec, id: 'E8', placement: null };
    fakeControls().render(inBoard(<QuestionsView board={{ ...BOARD, decisions: [onSpec, gone, AGENT_QUESTION], openDecisionIds: ['E7', 'E8', 'E2'] }} notifier={notifierSpy()} />));
    expect(within(screen.getByRole('listitem', { name: 'Question E7' })).getByRole('link', { name: 'Open the spec at line 16' }).getAttribute('href'))
      .toBe(boardHrefOf('documents/ticket/004/spec/line/16/question/E7'));
    expect(within(screen.getByRole('listitem', { name: 'Question E8' })).getByRole('link', { name: 'Open the spec at line 14' }).getAttribute('href'))
      .toBe(boardHrefOf('documents/ticket/004/spec/line/14/question/E8'));
    expect(within(screen.getByRole('listitem', { name: 'Question E2' })).queryByRole('link', { name: /^Open the/u })).toBeNull();
  });
});
