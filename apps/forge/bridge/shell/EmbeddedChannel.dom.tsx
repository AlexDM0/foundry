/**
 * The Bridge's window ends in a happy-dom window. What matters: Esc reaches the parent at its origin, as the leave message the caller
 * hands in, only while no panel is open and no inner layer used the key, and never where the parent or its origin is unknown.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { EmbeddedChannel } from './EmbeddedChannel.ts';

const PARENT_ORIGIN = 'http://127.0.0.1:5101';
const LEAVE_MESSAGE = { kind: 'leave' };

interface PostedMessage {
  readonly message:      unknown;
  readonly targetOrigin: string;
}

let closeChannel = (): void => undefined;

afterEach(() => {
  closeChannel();
});

function openedChannel(panelIsOpen = false, parentOrigin: string | null = PARENT_ORIGIN) {
  const posted: PostedMessage[] = [];
  const parent = {
    postMessage: (message: unknown, targetOrigin: string) => {
      posted.push({ message, targetOrigin });
    },
  } as unknown as Window;
  const escapeForwarder = EmbeddedChannel.forwardEscape({ window, parent, parentOrigin }, () => panelIsOpen, LEAVE_MESSAGE);
  closeChannel = escapeForwarder.close;
  return { posted };
}

describe('Esc out', () => {
  test('Esc with no panel open posts the leave message to the parent\'s origin only', () => {
    const { posted } = openedChannel();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(posted).toEqual([{ message: LEAVE_MESSAGE, targetOrigin: PARENT_ORIGIN }]);
  });

  test('Esc with the parent\'s origin unknown posts nothing', () => {
    const { posted } = openedChannel(false, null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(posted).toEqual([]);
  });

  test('an Esc an inner layer already used, by preventing its default, posts nothing', () => {
    const { posted } = openedChannel();
    const closeLayerOnEscape = (event: KeyboardEvent): void => event.preventDefault();
    document.addEventListener('keydown', closeLayerOnEscape);
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } finally {
      document.removeEventListener('keydown', closeLayerOnEscape);
    }
    expect(posted).toEqual([]);
  });

  test('Esc with a panel open, and any other key, posts nothing', () => {
    const { posted } = openedChannel(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(posted).toEqual([]);
  });
});
