/**
 * The Attention view's layout. What matters (SCREENS A1 acceptance 1, 3 and 4; B3 acceptance 1 and 2): the list draws its rows in the
 * content's order, the first row's button the only primary, and each row's button is a link to its forge in place, Answer on E2 to
 * `#questions/E2`; "Update forge" sends `forge-update` through the command sender and is disabled while it is on its way; a refusal shows
 * under its callout with the forge's code and sentence until dismissed; nothing waiting says so; B3's banner, its stale rows that can be
 * read and not acted on, and the side panel that names the forges the totals cannot vouch for. The content comes from the model over the
 * artboards' fixtures; the command sender is the real one over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                                               from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import { type CommandSender, type CommandSubject }                                  from '../../api/CommandSender.ts';
import { answerResponse, senderOver, type SentRequest }                             from '../../testing/CommandServer.ts';
import { type HostElement, ReactElementTree }                                       from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { AttentionLayout }                                                          from './AttentionLayout.tsx';
import { AttentionModel }                                                           from './AttentionModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const DONE: CommandAnswerDocument = {
  answerVersion: 1, outcome: 'done', refusal: null, text: null
};

const UPDATE_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'update-in-progress',
  text:          'An update already runs in this repository.',
};

function contentOf(fleetDocument: FleetDocument) {
  const screen = AttentionModel.screenOf(fleetDocument, { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' });
  if (screen.kind !== 'fleet') throw new Error('Expected the fleet screen.');
  return screen.content;
}

/** Each send the layout makes is kept in `sends`, so a spec can wait for its answer. */
function unfoldedLayout(fleetDocument: FleetDocument, sender: CommandSender = senderOver([]), sends: Promise<unknown>[] = []) {
  return tree.unfolded(
    <AttentionLayout
      content={contentOf(fleetDocument)}
      commandStates={sender.states()}
      onCommand={(command) => {
        sends.push(sender.send(command));
      }}
      onDismissFailure={(subject: CommandSubject) => sender.dismissFailure(subject)}
    />,
  );
}

function rowsIn(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-row'));
}

function rowButtonOf(row: HostElement): HostElement {
  return tree.onlyWithClass([row], 'gaia-button');
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, label: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => tree.hasClass(element, 'gaia-button') && tree.textOf([element]) === label);
}

function calloutNamed(nodes: ReturnType<typeof tree.unfolded>, project: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => tree.hasClass(element, 'gaia-attention-look') && tree.textOf([element]).startsWith(project));
}

/** A promise the spec resolves when it chooses, so a command stays on its way until then. */
function heldAnswer() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe('the list of what waits on User', () => {
  test('draws the five rows in order, each button a link to its forge in place, the first one alone primary', () => {
    const rows = rowsIn(unfoldedLayout(FLEET_FIVE_FORGES));
    expect(rows.map((row) => tree.textOf([tree.onlyWithClass([row], 'gaia-attention-row-id')]))).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const buttons = rows.map(rowButtonOf);
    expect(buttons.map((button) => [button.tag, button.props['data-emphasis'], tree.textOf([button])])).toEqual([
      ['a', 'primary', 'Answer'],
      ['a', 'plain', 'Ready'],
      ['a', 'plain', 'Answer'],
      ['a', 'plain', 'Accept'],
      ['a', 'plain', 'Answer'],
    ]);
    expect(buttons[4]?.props['href']).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`);
  });

  test('a row shows its forge with the dot and the word, the kind pill in its tone, the subject and the mono meta line', () => {
    const [first] = rowsIn(unfoldedLayout(FLEET_FIVE_FORGES));
    if (first === undefined) throw new Error('Expected a first row.');
    expect(tree.hostElementsIn([first], tree.withClass('gaia-condition-dot')).map((dot) => dot.props['data-condition'])).toEqual(['live']);
    expect(tree.onlyWithClass([first], 'gaia-pill').props['data-tone']).toBe('error');
    expect(tree.textOf([first])).toBe('Invoice ServiceliveEscalatedE4The VAT gate cannot run in the sandbox. Allow network for it?from incident I2 · opened 21mAnswer');
  });

  test('with nothing waiting the list\'s place says so', () => {
    const unfolded = unfoldedLayout({ ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } });
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-list-card'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-attention-nothing')])).toBe('Nothing waits on you.');
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-figure'))).toHaveLength(6);
  });
});

describe('a callout\'s command', () => {
  test('"Update forge" sends forge-update and is disabled while it is on its way, and only that forge\'s buttons are', async () => {
    const answer = heldAnswer();
    const sent: SentRequest[] = [];
    const sender = senderOver([() => answer.promise], sent);
    const sends: Promise<unknown>[] = [];
    tree.dispatch(buttonNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender, sends), 'Update forge'), 'onClick');
    expect(sent.map((request) => JSON.parse(String(request.requestOptions.body)))).toEqual([
      { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp, commandVersion: 1 },
    ]);
    const onItsWay = unfoldedLayout(FLEET_FIVE_FORGES, sender);
    expect(buttonNamed(onItsWay, 'Update forge').props['disabled']).toBe(true);
    expect(buttonNamed(onItsWay, 'Start forge').props['disabled']).toBe(false);
    answer.resolve(answerResponse(DONE));
    await Promise.all(sends);
    expect(buttonNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'Update forge').props['disabled']).toBe(false);
  });

  test('a refusal shows under its callout with the forge\'s code and sentence; Try again sends again, dismiss takes it away', async () => {
    const sent: SentRequest[] = [];
    const sender = senderOver([() => Promise.resolve(answerResponse(UPDATE_REFUSED)), () => new Promise<Response>(() => undefined)], sent);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const refused = unfoldedLayout(FLEET_FIVE_FORGES, sender);
    const refusal = tree.onlyWithClass([calloutNamed(refused, 'Example Mobile App')], 'gaia-refusal');
    expect(tree.textOf([tree.onlyWithClass([refusal], 'gaia-refusal-text')])).toBe(
      'The forge refused Update forge: update-in-progress. An update already runs in this repository.',
    );
    expect(tree.hostElementsIn([calloutNamed(refused, 'Design System')], tree.withClass('gaia-refusal'))).toEqual([]);
    tree.dispatch(buttonNamed([refusal], 'Try again'), 'onClick');
    expect(sent).toHaveLength(2);
    sender.dismissFailure({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES, sender), tree.withClass('gaia-refusal'))).toEqual([]);
  });

  test('a callout that leaves the document leaves the view', () => {
    const updated = { ...FLEET_FIVE_FORGES, needsALook: FLEET_FIVE_FORGES.needsALook.filter((look) => look.kind !== 'launches-held') };
    expect(tree.hostElementsIn(unfoldedLayout(updated), (element) => tree.textOf([element]) === 'Update forge')).toEqual([]);
  });
});

describe('forges Gaia cannot fully read (B3)', () => {
  test('an unreachable forge has a banner under the top bar with its last stamp in mono and Look again', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const banner = tree.onlyWithClass(unfolded, 'gaia-banner');
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-banner-text')])).toBe(
      'Overseer unreachable: Invoice Service. Gaia shows what it last reported at 13:14 and tries again.',
    );
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-attention-banner-stamp')])).toBe('13:14');
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-button')])).toBe('Look again');
  });

  test('its rows can be read, at reduced contrast, and not acted on: the button is disabled and goes nowhere', () => {
    const rows = rowsIn(unfoldedLayout(FLEET_DEGRADED));
    expect(rows.map((row) => row.props['data-stale'])).toEqual(['', undefined, '', undefined]);
    const stale = rows.filter((row) => row.props['data-stale'] !== undefined);
    expect(stale.map((row) => tree.textOf([tree.onlyWithClass([row], 'gaia-attention-row-subject')]))).toEqual([
      'The VAT gate cannot run in the sandbox. Allow network for it?',
      'Round VAT per line, not per invoice',
    ]);
    expect(stale.map(rowButtonOf).map((button) => [button.tag, button.props['disabled'], button.props['href']])).toEqual([
      ['button', true, undefined],
      ['button', true, undefined],
    ]);
    expect(rows.map(rowButtonOf).map((button) => button.props['data-emphasis'])).toEqual(['plain', 'primary', 'plain', 'plain']);
  });

  test('the side panel names each forge and marks the ones figures.incompleteFor names', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const readings = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-reading'));
    expect(readings.filter((reading) => reading.props['data-totals-cannot-vouch'] !== undefined)
      .map((reading) => tree.textOf([tree.onlyWithClass([reading], 'gaia-attention-reading-forge')])))
      .toEqual(['Invoice Service', 'Research Wiki', 'Analytics Sandbox']);
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES), tree.withClass('gaia-attention-readings'))).toEqual([]);
  });

  test('B3\'s callouts are drawn in their tones, Analytics Sandbox\'s with its dashed unreadable dot', () => {
    const callouts = tree.hostElementsIn(unfoldedLayout(FLEET_DEGRADED), tree.withClass('gaia-callout'));
    expect(callouts.map((callout) => [callout.props['aria-label'], callout.props['data-tone']])).toEqual([
      ['Invoice Service: Unreachable', 'error'],
      ['Research Wiki: Counts only', 'neutral'],
      ['Example Mobile App: Launches held', 'warn'],
      ['Analytics Sandbox: Newer than this Gaia', 'warn'],
    ]);
    const newer = callouts[3];
    expect(newer === undefined ? null : tree.onlyWithClass([newer], 'gaia-condition-dot').props['data-condition']).toBe('unreadable');
  });
});

describe('the side of the view', () => {
  test('a running card links to its forge in place; just happened lists four entries and links to all activity', () => {
    const unfolded = unfoldedLayout(FLEET_FIVE_FORGES);
    const cards = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-running-card'));
    expect(cards.map((card) => [card.tag, card.props['href']])).toEqual([
      ['a', `#forge/${TRACKER_IDS.exampleStorefront}`],
      ['a', `#forge/${TRACKER_IDS.invoiceService}`],
      ['a', `#forge/${TRACKER_IDS.researchWiki}`],
      ['a', `#forge/${TRACKER_IDS.exampleMobileApp}`],
    ]);
    const firstJobs = cards[0] === undefined ? [] : tree.hostElementsIn([cards[0]], tree.withClass('gaia-role-dot'));
    expect(firstJobs.map((dot) => dot.props['data-role'])).toEqual(['builder', 'waiting', 'builder', 'reviewer']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-recent-entry'))).toHaveLength(4);
    expect(tree.onlyWithClass(unfolded, 'gaia-attention-link').props['href']).toBe('#activity');
  });

  test('every control has a name, and the open-in-new-tab command shows its words beside its arrow', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const controls = tree.hostElementsIn(unfolded, (element) => element.tag === 'button' || element.tag === 'a');
    expect(controls.filter((control) => tree.textOf([control]).trim() === '' && typeof control.props['aria-label'] !== 'string')).toEqual([]);
    const openInNewTab = tree.hostElementsIn(unfolded, (element) => tree.hasClass(element, 'gaia-button') && tree.textOf([element]) === 'Open in new tab');
    expect(openInNewTab).toHaveLength(2);
    expect(openInNewTab.map((button) => tree.hostElementsIn([button], (element) => element.tag === 'svg').length)).toEqual([1, 1]);
  });
});
