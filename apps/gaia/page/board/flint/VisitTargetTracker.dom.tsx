/**
 * The board's visit target in a happy-dom document: the open screen's slot whatever User does, and with no slot the habitat User last pressed
 * or focused in, the innermost one winning; a newly shown slot sends Flint there at once.
 */
import { afterEach, expect, test } from 'bun:test';

import { FLINT_OVERLAY_ATTRIBUTE, type RegisteredHabitat }     from '../../lib/flint/FlintInterface.ts';
import { createVisitTargetTracker, FLINT_WORKPLACE_ATTRIBUTE } from './VisitTargetTracker.ts';

afterEach(() => {
  document.body.replaceChildren();
});

interface Page {
  readonly thread:    RegisteredHabitat;
  readonly agents:    RegisteredHabitat;
  /** A Flint slot inside the chat card, as in the Assistant's chat head. */
  readonly slot:      RegisteredHabitat;
  readonly otherSlot: RegisteredHabitat;
  readonly composer:  HTMLElement;
  readonly elsewhere: HTMLElement;
}

function registeredOf(element: HTMLElement, kind: string): RegisteredHabitat {
  return { element, habitat: { kind, description: `The ${kind}.`, suggestions: [] } };
}

function page(): Page {
  const card = document.createElement('section');
  card.setAttribute(FLINT_WORKPLACE_ATTRIBUTE, '');
  const slotElement = document.createElement('div');
  const threadElement = document.createElement('ol');
  const composer = document.createElement('textarea');
  card.append(slotElement, threadElement, composer);
  const agentsElement = document.createElement('div');
  const otherSlotElement = document.createElement('div');
  const elsewhere = document.createElement('button');
  document.body.append(card, agentsElement, otherSlotElement, elsewhere);
  return {
    thread:    registeredOf(threadElement, 'chat'),
    agents:    registeredOf(agentsElement, 'agent-panel'),
    slot:      registeredOf(slotElement, 'assistant-slot'),
    otherSlot: registeredOf(otherSlotElement, 'kanban-slot'),
    composer,
    elsewhere,
  };
}

function press(element: Element): void {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

function focus(element: Element): void {
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
}

test('with no slot shown, nothing is the target before User works, then the habitat around the newest focus or press', () => {
  const { thread, agents, composer } = page();
  const tracker = createVisitTargetTracker();
  const stop = tracker.follow(document);
  expect(tracker.visitTarget([thread, agents])).toBeNull();
  press(composer);
  expect(tracker.visitTarget([agents, thread])).toBe(thread);
  focus(agents.element);
  expect(tracker.visitTarget([agents, thread])).toBe(agents);
  stop();
});

test('the open screen\'s slot is the target whatever User presses or focuses, the chat card around it and other habitats alike', () => {
  const {
    thread, agents, slot, composer
  } = page();
  const habitats = [thread, agents, slot];
  const tracker = createVisitTargetTracker();
  const stop = tracker.follow(document);
  tracker.slotShown(slot.element);
  expect(tracker.visitTarget(habitats)).toBe(slot);
  press(composer);
  expect(tracker.visitTarget(habitats)).toBe(slot);
  press(thread.element);
  focus(agents.element);
  expect(tracker.visitTarget(habitats)).toBe(slot);
  stop();
});

test('a press outside every habitat, or on Flint\'s overlay, keeps the target', () => {
  const { thread, composer, elsewhere } = page();
  const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute(FLINT_OVERLAY_ATTRIBUTE, '');
  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  overlay.append(body);
  document.body.append(overlay);
  const tracker = createVisitTargetTracker();
  const stop = tracker.follow(document);
  press(composer);
  expect(tracker.visitTarget([thread])).toBe(thread);
  press(elsewhere);
  expect(tracker.visitTarget([thread])).toBe(thread);
  press(body);
  expect(tracker.visitTarget([thread])).toBe(thread);
  stop();
});

test('the newest slot that shows is the target, the slot that goes leaves the one before, and with none left the habitat worked in since', () => {
  const {
    thread, agents, slot, otherSlot, composer
  } = page();
  const habitats = [thread, agents, slot, otherSlot];
  const tracker = createVisitTargetTracker();
  const stop = tracker.follow(document);
  const gone = tracker.slotShown(slot.element);
  press(composer);
  const goneAgain = tracker.slotShown(otherSlot.element);
  focus(agents.element);
  expect(tracker.visitTarget(habitats)).toBe(otherSlot);
  goneAgain();
  expect(tracker.visitTarget(habitats)).toBe(slot);
  gone();
  expect(tracker.visitTarget(habitats)).toBe(agents);
  stop();
});

test('a newer slot that is not among the habitats Flint can live in leaves the target to the older slot that shows', () => {
  const { thread, slot, otherSlot } = page();
  const tracker = createVisitTargetTracker();
  tracker.slotShown(slot.element);
  tracker.slotShown(otherSlot.element);
  expect(tracker.visitTarget([thread, slot])).toBe(slot);
  expect(tracker.visitTarget([thread, slot, otherSlot])).toBe(otherSlot);
});

test('a slot that shows sends Flint to visit at once, a Flint made while a slot shows goes too, and with no slot shown none is sent', () => {
  const { slot, otherSlot } = page();
  const tracker = createVisitTargetTracker();
  const firstSent: string[] = [];
  tracker.flintMade({ perform: (intent) => firstSent.push(intent) });
  expect(firstSent).toEqual([]);
  const gone = tracker.slotShown(slot.element);
  expect(firstSent).toEqual(['visit']);
  tracker.flintMade(null);
  tracker.slotShown(otherSlot.element);
  const madeAgainSent: string[] = [];
  tracker.flintMade({ perform: (intent) => madeAgainSent.push(intent) });
  expect([firstSent, madeAgainSent]).toEqual([['visit'], ['visit']]);
  gone();
});

test('once stopped, the tracker follows nothing', () => {
  const { thread, composer } = page();
  const tracker = createVisitTargetTracker();
  tracker.follow(document)();
  press(composer);
  expect(tracker.visitTarget([thread])).toBeNull();
});
