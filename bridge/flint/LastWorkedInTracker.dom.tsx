/**
 * The Bridge's visit target in a happy-dom document. What matters: nothing is the target before User focuses or presses anything; the
 * habitat whose workplace holds the newest focus or press is the target, so a press on a chat card's composer picks the thread beside it;
 * a press outside every workplace picks none; a press on Flint's overlay keeps the target; and once stopped, the tracker follows nothing.
 */
import { afterEach, expect, test } from 'bun:test';

import { FLINT_OVERLAY_ATTRIBUTE, type RegisteredHabitat }      from '../../flint/SpriteHabitat.ts';
import { createLastWorkedInTracker, FLINT_WORKPLACE_ATTRIBUTE } from './LastWorkedInTracker.ts';

afterEach(() => {
  document.body.replaceChildren();
});

interface Page {
  readonly thread:    RegisteredHabitat;
  readonly agents:    RegisteredHabitat;
  readonly composer:  HTMLElement;
  readonly elsewhere: HTMLElement;
}

function page(): Page {
  const card = document.createElement('section');
  card.setAttribute(FLINT_WORKPLACE_ATTRIBUTE, '');
  const threadElement = document.createElement('ol');
  const composer = document.createElement('textarea');
  card.append(threadElement, composer);
  const agentsElement = document.createElement('div');
  const elsewhere = document.createElement('button');
  document.body.append(card, agentsElement, elsewhere);
  return {
    thread: { element: threadElement, habitat: { kind: 'chat', description: 'A chat.', suggestions: [] } },
    agents: { element: agentsElement, habitat: { kind: 'agent-panel', description: 'The agents.', suggestions: [] } },
    composer,
    elsewhere,
  };
}

function press(element: Element): void {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

test('nothing is the target before User focuses or presses anything', () => {
  const { thread, agents } = page();
  const tracker = createLastWorkedInTracker();
  const stop = tracker.follow(document);
  expect(tracker.visitTarget([thread, agents])).toBeNull();
  stop();
});

test('the habitat whose workplace holds the newest focus or press is the target, and a press elsewhere picks none', () => {
  const {
    thread, agents, composer, elsewhere
  } = page();
  const tracker = createLastWorkedInTracker();
  const stop = tracker.follow(document);
  press(composer);
  expect(tracker.visitTarget([agents, thread])).toBe(thread);
  agents.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  expect(tracker.visitTarget([agents, thread])).toBe(agents);
  press(elsewhere);
  expect(tracker.visitTarget([agents, thread])).toBeNull();
  stop();
});

test('a press on Flint\'s overlay keeps the habitat User worked in as the target', () => {
  const { thread, composer } = page();
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute(FLINT_OVERLAY_ATTRIBUTE, '');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  overlay.append(body);
  document.body.append(overlay);
  const tracker = createLastWorkedInTracker();
  const stop = tracker.follow(document);
  press(composer);
  press(body);
  expect(tracker.visitTarget([thread])).toBe(thread);
  stop();
});

test('once stopped, the tracker follows nothing', () => {
  const { thread, composer } = page();
  const tracker = createLastWorkedInTracker();
  tracker.follow(document)();
  press(composer);
  expect(tracker.visitTarget([thread])).toBeNull();
});
