/**
 * The composer, in a happy-dom document, against fake control surroundings. What matters: it names its recipient, links the recipient's
 * job and shows its status tag, since User must see who a message reaches and whether it queues; Enter and Send post the caller's command
 * once, and the text clears once the Overseer applied it, keeps what User typed while it was on its way, and stays on a refusal, shown
 * verbatim; Shift + Enter, Enter during an input
 * method's composition, Enter while the caller makes no command (its empty-text rule) and Enter while controls are unavailable all send
 * nothing; the head carries the key hints, the caller's attachments sit above the text box and its foot controls under it, with no foot
 * without them; the text box and the paper-plane Send share one row (one height, held in the browser by `board.css`), Send named by its
 * label alone; pasted files reach the caller and a text paste does not; and the recipient and the status are text, never markup.
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

import type { CommandOutcome, ControlCommandBody }              from '../api/CommandClient.ts';
import { ControlSurroundingsContext, type ControlAvailability } from '../shell/ControlAvailability.ts';
import { fakeControlSurroundingsOf }                            from '../testing/FakeControlSurroundings.ts';
import { Composer, type ComposerProps }                         from './Composer.tsx';

afterEach(() => {
  cleanup();
});

const MESSAGE_LABEL = 'Message Assistant J1';

function jobMessageOf(text: string): ControlCommandBody | null {
  return text.trim() === '' ? null : { kind: 'job-message', jobId: 'J1', text: text.trim() };
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
  readonly sent:       ControlCommandBody[];
  readonly applied:    (readonly [string, unknown])[];
  readonly answerWith: ReturnType<typeof fakeControlSurroundingsOf>['answerWith'];
  readonly textBox:    HTMLTextAreaElement;
}

function renderedComposer(props: Partial<ComposerProps> = {}, availability: ControlAvailability = 'enabled'): RenderedComposer {
  const fake = fakeControlSurroundingsOf(availability);
  const applied: (readonly [string, unknown])[] = [];
  render(
    <ControlSurroundingsContext.Provider value={fake.surroundings}>
      <Composer {...ASSISTANT_COMPOSER} onApplied={(text, result) => applied.push([text, result])} {...props} />
    </ControlSurroundingsContext.Provider>,
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
    const head = document.querySelector('.bridge-composer-head');
    expect([
      head?.querySelector('.bridge-composer-recipient')?.textContent,
      screen.getByRole('link', { name: 'J1' }).getAttribute('href'),
      head?.querySelector('.design-system-tag')?.textContent,
      textBox.getAttribute('placeholder'),
    ]).toEqual(['Assistant J1', '#agents/J1', 'Busy: the next message queues', MESSAGE_LABEL]);
  });

  test('with no job and no status it links nothing and shows no tag', () => {
    renderedComposer({ recipientLabel: 'New product-owner session', recipientJobId: null, status: null });
    expect([screen.queryByRole('link'), document.querySelector('.design-system-tag'), document.querySelector('.bridge-composer-recipient')?.textContent])
      .toEqual([null, null, 'New product-owner session']);
  });
});

describe('the composer\'s send', () => {
  test('Enter posts the command once, and the text clears once the Overseer applied it', async () => {
    const { sent, applied, textBox } = renderedComposer();
    typed(textBox, 'Hold #008 until #007 lands.');
    fireEvent.keyDown(textBox, { key: 'Enter' });
    await waitFor(() => expect(textBox.value).toBe(''));
    expect(sent).toEqual([{ kind: 'job-message', jobId: 'J1', text: 'Hold #008 until #007 lands.' }]);
    expect(applied).toEqual([['Hold #008 until #007 lands.', null]]);
  });

  test('Send posts the same command as Enter', async () => {
    const { sent, textBox } = renderedComposer();
    typed(textBox, 'Summarise the last review of #002.');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(textBox.value).toBe(''));
    expect(sent).toEqual([{ kind: 'job-message', jobId: 'J1', text: 'Summarise the last review of #002.' }]);
  });

  test('a text User changed while the command was on its way stays once the Overseer applied it', async () => {
    const sent: ControlCommandBody[] = [];
    let answerApplied = (): void => undefined;
    const surroundings = {
      ...fakeControlSurroundingsOf().surroundings,
      commandClient: {
        send: (command: ControlCommandBody) => {
          sent.push(command);
          return new Promise<CommandOutcome>((resolve) => {
            answerApplied = () => resolve({ verdict: 'applied', outcome: 'done', result: null });
          });
        },
      },
    };
    render(
      <ControlSurroundingsContext.Provider value={surroundings}>
        <Composer {...ASSISTANT_COMPOSER} />
      </ControlSurroundingsContext.Provider>,
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
    const composer = document.querySelector('.bridge-composer');
    expect([
      composer?.children[1]?.textContent,
      composer?.querySelector('.bridge-composer-foot')?.firstElementChild?.textContent,
      [...(composer?.querySelectorAll('.bridge-composer-head .bridge-key-hint') ?? [])].map((hint) => hint.textContent),
    ]).toEqual(['Example picture tray', 'Attach pictures', ['Enter sends', 'Shift + Enter new line']]);
  });

  test('without foot controls the composer has no foot', () => {
    renderedComposer();
    expect(document.querySelector('.bridge-composer-foot')).toBeNull();
  });

  test('the text box and the paper-plane Send share one row, Send named by its label and drawing no words', () => {
    renderedComposer();
    const entryRow = document.querySelector('.bridge-composer-entry');
    const send = screen.getByRole('button', { name: 'Send' });
    expect([
      [...(entryRow?.children ?? [])].map((part) => part.className),
      entryRow?.querySelector('textarea')?.getAttribute('aria-label'),
      send.parentElement === entryRow,
      send.textContent,
      send.querySelector('svg')?.getAttribute('data-icon'),
    ]).toEqual([['bridge-textarea bridge-composer-input', 'bridge-send-button'], MESSAGE_LABEL, true, '', 'paper-plane']);
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
