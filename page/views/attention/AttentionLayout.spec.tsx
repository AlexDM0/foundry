/**
 * The Attention view's layout. What matters (SCREENS A1 acceptance 1, 3 and 4; B3 acceptance 1 and 2): the list draws its rows in the
 * content's order, the first row's button the only primary, and each row's button is a link to its forge in place, Answer on E2 to
 * `#questions/E2`; "Update forge" sends `forge-update` through the command sender and is disabled while it is on its way; a refusal shows
 * under its callout with the forge's code and sentence until dismissed; an update that left a restart pending offers Restart under the
 * callout that sent it until dismissed; nothing waiting says so; B3's banner, its stale rows that can be read and not acted on, its figures
 * folded into one line atop the main column so the side panel and Running fit the window, and the side panel that names the forges the
 * totals cannot vouch for; an empty place says so. The content comes
 * from the model over the artboards' fixtures; the command sender is the real one over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                                               from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import { type CommandSender, type CommandSubject }                                  from '../../api/CommandSender.ts';
import { answerResponse, senderOver, type SentRequest }                             from '../../testing/CommandServer.ts';
import { DrawnDots }                                                                from '../../testing/DrawnDots.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree }                                       from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { AttentionLayout }                                                          from './AttentionLayout.tsx';
import { AttentionModel }                                                           from './AttentionModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const DONE: CommandAnswerDocument = {
  answerVersion: 2, outcome: 'done', refusal: null, text: null
};

const UPDATE_REFUSED: CommandAnswerDocument = {
  answerVersion: 2,
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
      onDismissRestartPending={(subject: CommandSubject) => sender.dismissRestartPending(subject)}
    />,
  );
}

function rowsIn(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-row'));
}

function rowButtonOf(row: HostElement): HostElement {
  return tree.onlyWithClass([row], 'design-system-button');
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, label: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => tree.hasClass(element, 'design-system-button') && tree.textOf([element]) === label);
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
    expect(buttons.map((button) => [button.tag, PackageButtons.emphasisOf(button), tree.textOf([button])])).toEqual([
      ['a', 'primary', 'Answer'],
      ['a', 'quiet', 'Ready'],
      ['a', 'quiet', 'Answer'],
      ['a', 'quiet', 'Accept'],
      ['a', 'quiet', 'Answer'],
    ]);
    expect(buttons[4]?.props['href']).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`);
  });

  test('a row shows its forge with the dot and the word, the kind pill in its tone, the subject and the mono meta line', () => {
    const [first] = rowsIn(unfoldedLayout(FLEET_FIVE_FORGES));
    if (first === undefined) throw new Error('Expected a first row.');
    expect(tree.hostElementsIn([first], DrawnDots.isDot).map(DrawnDots.conditionOf)).toEqual(['live']);
    expect(tree.onlyWithClass([first], 'design-system-tag').props['data-tone']).toBe('error');
    expect(tree.textOf([first])).toBe('Invoice ServiceliveEscalatedE4The VAT gate cannot run in the sandbox. Allow network for it?from incident I2 · opened 21mAnswer');
  });

  test('with nothing waiting the list\'s place says so', () => {
    const unfolded = unfoldedLayout({ ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } });
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-list-card'))).toEqual([]);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-attention-nothing')])).toBe('Nothing waits on you.');
  });

  test('with every forge read in full the layout draws no figures: they stand stacked in the page title', () => {
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES), tree.withClass('gaia-figure'))).toEqual([]);
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

  test('an update that left a restart pending offers Restart under its callout; Restart sends forge-restart, dismiss takes it away', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 2, outcome: 'restart-pending', refusal: null, text: null
    };
    const sent: SentRequest[] = [];
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending)), () => new Promise<Response>(() => undefined)], sent);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const pending = unfoldedLayout(FLEET_FIVE_FORGES, sender);
    const pendingStep = tree.onlyWithClass([calloutNamed(pending, 'Example Mobile App')], 'gaia-pending-step');
    expect(tree.textOf([tree.onlyWithClass([pendingStep], 'gaia-pending-step-text')])).toBe('Updated; restart pending. Its Overseer runs the old code until it restarts.');
    expect(tree.hostElementsIn([calloutNamed(pending, 'Design System')], tree.withClass('gaia-pending-step'))).toEqual([]);
    tree.dispatch(buttonNamed([pendingStep], 'Restart'), 'onClick');
    expect(JSON.parse(String(sent[1]?.requestOptions.body))).toEqual({ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp, commandVersion: 1 });
    const restarting = tree.onlyWithClass([calloutNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'Example Mobile App')], 'gaia-pending-step');
    expect(buttonNamed([restarting], 'Restart').props['disabled']).toBe(true);
    sender.dismissRestartPending({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES, sender), tree.withClass('gaia-pending-step'))).toEqual([]);
  });

  test('a callout that leaves the document leaves the view', () => {
    const updated = { ...FLEET_FIVE_FORGES, needsALook: FLEET_FIVE_FORGES.needsALook.filter((look) => look.kind !== 'launches-held') };
    expect(tree.hostElementsIn(unfoldedLayout(updated), (element) => tree.textOf([element]) === 'Update forge')).toEqual([]);
  });
});

describe('forges Gaia cannot fully read (B3)', () => {
  test('an unreachable forge has a banner under the top bar with its last stamp in mono and Look again', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const inCallouts = new Set(tree.hostElementsIn(tree.hostElementsIn(unfolded, tree.withClass('gaia-callout'))));
    const banner = tree.onlyHostElementIn(unfolded, (element) => tree.hasClass(element, 'design-system-banner') && !inCallouts.has(element));
    expect(banner.props['data-tone']).toBe('error');
    const [text] = banner.children;
    expect(typeof text === 'object' ? tree.textOf([text]) : null).toBe(
      'Overseer unreachable: Invoice Service. Gaia shows what it last reported at 13:14 and tries again.',
    );
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-attention-banner-stamp')])).toBe('13:14');
    expect(tree.textOf([tree.onlyWithClass([banner], 'design-system-banner-action')])).toBe('Look again');
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
    expect(rows.map(rowButtonOf).map(PackageButtons.emphasisOf)).toEqual(['quiet', 'primary', 'quiet', 'quiet']);
  });

  test('the side panel names each forge and marks the ones figures.incompleteFor names at the end of what Gaia reads of it', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const readings = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-reading'));
    const marked = readings.filter((reading) => reading.props['data-totals-cannot-vouch'] !== undefined);
    expect(marked.map((reading) => tree.textOf([tree.onlyWithClass([reading], 'gaia-attention-reading-forge')])))
      .toEqual(['Invoice Service', 'Research Wiki', 'Analytics Sandbox']);
    expect(marked.map((reading) => tree.textOf([tree.onlyWithClass([reading], 'gaia-attention-reading-text')])))
      .toEqual([
        'Nothing since 13:14. Its rows are shown as last reported and their actions are off. The totals cannot vouch for it.',
        'Counts and jobs only. No questions, reviews or notices by name. The totals cannot vouch for it.',
        'Nothing. Its contract is newer than this Gaia. The totals cannot vouch for it.',
      ]);
    expect(tree.hostElementsIn(readings, tree.withClass('gaia-attention-reading-totals'))).toHaveLength(3);
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES), tree.withClass('gaia-attention-readings'))).toEqual([]);
  });

  test('the figures fold into one inline line atop the main column, so the side panel starts under the banner', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const main = tree.onlyWithClass(unfolded, 'gaia-attention-main');
    const figuresRow = tree.onlyWithClass([main], 'gaia-attention-figures');
    expect(figuresRow.props['data-form']).toBe('line');
    const figures = tree.hostElementsIn([figuresRow], tree.withClass('gaia-figure'));
    expect(figures.map((figure) => [figure.props['data-form'], tree.textOf([figure])])).toEqual([
      ['inline', '4+waiting on you'],
      ['inline', '10 / 12agents'],
      ['inline', '8tickets ready'],
      ['inline', '5done today'],
      ['inline', '1.08Mtokens today'],
      ['inline', '0open incidents'],
    ]);
  });

  test('B3\'s callouts are drawn in their tones, Analytics Sandbox\'s with its dashed unreadable dot', () => {
    const callouts = tree.hostElementsIn(unfoldedLayout(FLEET_DEGRADED), tree.withClass('gaia-callout'));
    expect(callouts.map((callout) => [callout.props['aria-label'], tree.onlyWithClass([callout], 'gaia-callout-body').props['data-tone']])).toEqual([
      ['Invoice Service: Unreachable', 'error'],
      ['Research Wiki: Counts only', 'neutral'],
      ['Example Mobile App: Launches held', 'warn'],
      ['Analytics Sandbox: Newer than this Gaia', 'warn'],
    ]);
    const newer = callouts[3];
    expect(newer === undefined ? null : DrawnDots.conditionOf(tree.onlyHostElementIn([newer], DrawnDots.isDot))).toBe('unreadable|missing');
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
    const firstJobs = cards[0] === undefined ? [] : tree.hostElementsIn(tree.hostElementsIn([cards[0]], tree.withClass('gaia-attention-running-job')), DrawnDots.isDot);
    expect(firstJobs.map(DrawnDots.roleOf)).toEqual(['builder', 'waiting', 'builder', 'reviewer']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-recent-entry'))).toHaveLength(4);
    expect(tree.onlyWithClass(unfolded, 'gaia-attention-link').props['href']).toBe('#activity');
  });

  test('with no activity reported, just happened says so in its place', () => {
    const unfolded = unfoldedLayout({ ...FLEET_FIVE_FORGES, activity: [] });
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-recent'))).toEqual([]);
    const recentSection = tree.onlyHostElementIn(unfolded, (element) => element.tag === 'section' && element.props['aria-labelledby'] === 'gaia-attention-recent-head');
    expect(tree.textOf([tree.onlyWithClass([recentSection], 'gaia-attention-nothing')])).toBe('No forge has reported activity yet.');
  });

  test('every control has a name, and the open-in-new-tab command shows its words beside its arrow', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const controls = tree.hostElementsIn(unfolded, (element) => element.tag === 'button' || element.tag === 'a');
    expect(controls.filter((control) => tree.textOf([control]).trim() === '' && typeof control.props['aria-label'] !== 'string')).toEqual([]);
    const openInNewTab = tree.hostElementsIn(unfolded, (element) => tree.hasClass(element, 'design-system-button') && tree.textOf([element]) === 'Open in new tab');
    expect(openInNewTab).toHaveLength(2);
    expect(openInNewTab.map((button) => tree.hostElementsIn([button], (element) => element.tag === 'svg').length)).toEqual([1, 1]);
  });
});
