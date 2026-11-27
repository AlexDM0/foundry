/**
 * The composer, in a happy-dom document, against fake control surroundings: it names its recipient and status, since User must see who a
 * message reaches and whether it queues; Enter and Send post once and obey every rule of a board control, and the text clears only once the
 * forge applied it.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardCommandDocument }                            from '../../@types/board/BoardCommandDocument.ts';
import type { BoardCommandResult, CommandOutcome }              from '../api/BoardCommandClient.ts';
import { ControlSurroundingsContext, type ControlAvailability } from '../shared/commands/ControlAvailability.ts';
import { BoardTrackerContext }                                  from '../shared/routing/BoardRouteLinks.ts';
import { fakeControlSurroundingsOf }                            from '../testing/FakeControlSurroundings.ts';
import { Composer, type ComposerProps }                         from './Composer.tsx';

afterEach(() => {
  cleanup();
});

const MESSAGE_LABEL = 'Message Assistant J1';

function jobMessageOf(text: string): BoardCommandDocument | null {
  return text.trim() === '' ? null : {
    boardCommandVersion: 3, kind: 'job-message', jobId: 'J1', text: text.trim(), pictures: [], incidentId: null
  };
}

const ASSISTANT_COMPOSER: ComposerProps = {
  label:          MESSAGE_LABEL,
  recipientLabel: 'Assistant',
  recipientJobId: 'J1',
  status:         {
    text: 'Busy: the next message queues', tone: 'state', stateTone: 'accent', dot: true
  },
  placeholder: MESSAGE_LABEL,
  sendLabel:   'Send',
  commandOf:   jobMessageOf,
};

interface RenderedComposer {
  readonly sent:       BoardCommandDocument[];
  readonly applied:    (readonly [string, BoardCommandResult])[];
  readonly answerWith: ReturnType<typeof fakeControlSurroundingsOf>['answerWith'];
  readonly textBox:    HTMLTextAreaElement;
}

function renderedComposer(props: Partial<ComposerProps> = {}, availability: ControlAvailability = 'enabled'): RenderedComposer {
  const fake = fakeControlSurroundingsOf(availability);
  const applied: (readonly [string, BoardCommandResult])[] = [];
  render(
    <BoardTrackerContext.Provider value="example-tracker">
      <ControlSurroundingsContext.Provider value={fake.surroundings}>
        <Composer {...ASSISTANT_COMPOSER} onApplied={(text, result) => applied.push([text, result])} {...props} />
      </ControlSurroundingsContext.Provider>
    </BoardTrackerContext.Provider>,
  );
  return {
    sent:       fake.sent,
    applied,
    answerWith: fake.answerWith,
    textBox:    screen.getByRole<HTMLTextAreaElement>('textbox', { name: MESSAGE_LABEL }),
  };
}

function typed(textBox: HTMLTextAreaElement, text: string): void {
  fireEvent.change(textBox, { target: { value: text } });
}

describe('the composer\'s head', () => {
  test('it names its recipient, links the recipient\'s job and shows its status tag', () => {
    const { textBox } = renderedComposer();
    const head = document.querySelector('.board-composer-head');
    expect([
      head?.querySelector('.board-composer-recipient')?.textContent,
      screen.getByRole('link', { name: 'J1' }).getAttribute('href'),
      head?.querySelector('.design-system-tag')?.textContent,
      textBox.getAttribute('placeholder'),
    ]).toEqual(['Assistant J1', '#forge/example-tracker/agents/J1', 'Busy: the next message queues', MESSAGE_LABEL]);
  });

  test('with no job and no status it links nothing and shows no tag', () => {
    renderedComposer({ recipientLabel: 'New product-owner session', recipientJobId: null, status: null });
    expect([screen.queryByRole('link'), document.querySelector('.design-system-tag'), document.querySelector('.board-composer-recipient')?.textContent])
      .toEqual([null, null, 'New product-owner session']);
  });
});

describe('the composer\'s send', () => {
  test('Enter posts the command once, and the text clears once the forge applied it', async () => {
    const { sent, applied, textBox } = renderedComposer();
    typed(textBox, 'Hold #008 until #007 lands.');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(textBox.value).toBe(''));
    expect(sent).toEqual([{
      boardCommandVersion: 3, kind: 'job-message', jobId: 'J1', text: 'Hold #008 until #007 lands.', pictures: [], incidentId: null
    }]);
    expect(applied).toEqual([['Hold #008 until #007 lands.', { startedJobId: null, writtenVersionNumber: null }]]);
  });

  test('Send posts the same command as Enter', async () => {
    const { sent, textBox } = renderedComposer();
    typed(textBox, 'Summarise the last review of #002.');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(textBox.value).toBe(''));
    expect(sent).toEqual([{
      boardCommandVersion: 3, kind: 'job-message', jobId: 'J1', text: 'Summarise the last review of #002.', pictures: [], incidentId: null
    }]);
  });

  test('a text User changed while the command was on its way stays once the forge applied it', async () => {
    const sent: BoardCommandDocument[] = [];
    let answerApplied = (): void => undefined;
    const surroundings = {
      ...fakeControlSurroundingsOf().surroundings,
      commandClient: {
        send: (command: BoardCommandDocument) => {
          sent.push(command);
          return new Promise<CommandOutcome>((resolve) => {
            answerApplied = () => resolve({ verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: null } });
          });
        },
      },
    };
    render(
      <BoardTrackerContext.Provider value="example-tracker">
        <ControlSurroundingsContext.Provider value={surroundings}>
          <Composer {...ASSISTANT_COMPOSER} />
        </ControlSurroundingsContext.Provider>
      </BoardTrackerContext.Provider>,
    );
    const textBox = screen.getByRole<HTMLTextAreaElement>('textbox', { name: MESSAGE_LABEL });
    typed(textBox, 'Hold #008 until #007 lands.');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    typed(textBox, 'And tell me when it lands.');
    await act(async () => {
      answerApplied();
      await Promise.resolve();
    });
    expect([sent.length, textBox.value]).toEqual([1, 'And tell me when it lands.']);
  });

  test('a refusal shows verbatim under the text box and the text stays', async () => {
    const { answerWith, textBox } = renderedComposer();
    answerWith({ verdict: 'refused', refusal: 'J1 is not a live job.' });
    typed(textBox, 'Why did #001 restart twice?');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('J1 is not a live job.'));
    expect(textBox.value).toBe('Why did #001 restart twice?');
  });

  test('Shift + Enter sends nothing', () => {
    const { sent, textBox } = renderedComposer();
    typed(textBox, 'First line');
    fireEvent.keyDown(textBox, { key: 'Enter', shiftKey: true });
    expect([sent, textBox.value]).toEqual([[], 'First line']);
  });

  test('Enter during an input method\'s composition sends nothing', () => {
    const { sent, textBox } = renderedComposer();
    typed(textBox, 'Example');
    fireEvent.keyDown(textBox, { key: 'Enter', isComposing: true });
    expect(sent).toEqual([]);
  });

  test('while the caller makes no command, Send is disabled and Enter sends nothing', () => {
    const { sent, textBox } = renderedComposer();
    typed(textBox, '   ');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    expect([sent, screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled]).toEqual([[], true]);
  });

  test('while controls are unavailable, Send is disabled and Enter sends nothing', () => {
    const { sent, textBox } = renderedComposer({}, 'stream-down');
    typed(textBox, 'Hold #008 until #007 lands.');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    expect([sent, screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled]).toEqual([[], true]);
  });
});

describe('the composer\'s slots and pastes', () => {
  test('the head gives the keys, the attachments sit above the text box and the foot holds the caller\'s controls', () => {
    renderedComposer({ attachments: <p>Example picture tray</p>, footStart: <button type="button">Attach pictures</button> });
    const composer = document.querySelector('.board-composer');
    expect([
      composer?.children[1]?.textContent,
      composer?.querySelector('.board-composer-foot')?.firstElementChild?.textContent,
      [...(composer?.querySelectorAll('.board-composer-head .board-key-hint') ?? [])].map((hint) => hint.textContent),
    ]).toEqual(['Example picture tray', 'Attach pictures', ['Enter sends', 'Shift + Enter new line']]);
  });

  test('without foot controls the composer has no foot', () => {
    renderedComposer();
    expect(document.querySelector('.board-composer-foot')).toBeNull();
  });

  test('the text box and the paper-plane Send share one row, Send named by its label and drawing no words', () => {
    renderedComposer();
    const entryRow = document.querySelector('.board-composer-entry');
    const send = screen.getByRole('button', { name: 'Send' });
    expect([
      [...(entryRow?.children ?? [])].map((part) => part.tagName),
      entryRow?.querySelector('textarea')?.getAttribute('aria-label'),
      send.parentElement === entryRow,
      send.textContent,
      send.querySelector('svg')?.getAttribute('data-icon'),
    ]).toEqual([['TEXTAREA', 'BUTTON'], MESSAGE_LABEL, true, '', 'paper-plane']);
  });

  test('pasted files reach the caller, and a paste without files does not', () => {
    const pastedFiles: (readonly File[])[] = [];
    const { textBox } = renderedComposer({ onFilesPasted: (files) => pastedFiles.push(files) });
    const picture = new File(['example'], 'example-picture.png', { type: 'image/png' });
    fireEvent.paste(textBox, { clipboardData: { files: [picture] } });
    fireEvent.paste(textBox, { clipboardData: { files: [] } });
    expect(pastedFiles.map((files) => files.map((file) => file.name))).toEqual([['example-picture.png']]);
  });

  test('the recipient and the status are text, never markup', () => {
    renderedComposer({ recipientLabel: '<b>planted</b>', status: { text: '<b>planted</b>', tone: 'neutral' } });
    expect([document.querySelector('b'), document.querySelector('.design-system-tag')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
