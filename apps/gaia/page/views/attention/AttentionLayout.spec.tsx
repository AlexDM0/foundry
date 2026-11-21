/**
 * The Attention view's layout. What matters (SCREENS A1 acceptance 1, 3 and 4; B3 acceptance 1 and 2): the list draws its rows in the content's order,
 * the first row's button the only primary, and each row's button is a link to its forge in place, Answer on E2 to `#questions/E2`; "Update forge" sends
 * `forge-update` through the command sender and is disabled while it is on its way; a refusal shows under its callout with the forge's code and sentence
 * until dismissed; an update that left a restart pending offers Restart under the callout that sent it until dismissed, and a refused Restart's refusal
 * shows there too; nothing waiting says so; B3's banner, its stale rows that can be read and not acted on, its figures folded into one line atop the
 * main column so the side panel and Running fit the window, and the side panel that names the forges the totals cannot vouch for; an empty place says
 * so; U1's older forge's callout with its versions line and Update forge's pending and done steps, its newer forge's neutral callout, the side panel
 * naming each forge's version and the notes naming the forges the totals leave out. The content comes from the model over the artboards' fixtures;
 * the command sender is the real one over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }              from '../../@types/CommandDocument.ts';
import type { FleetDocument }                      from '../../@types/FleetDocument.ts';
import { type CommandSender, type CommandSubject } from '../../api/CommandSender.ts';
import {
  Banner,
  Button,
  EmptyState,
  Figure,
  MonoId,
  PendingStep,
  Tag,
  TextButton
} from '../../lib/design-system/DesignSystemInterface.ts';
import { answerResponse, senderOver, type SentRequest }                             from '../../testing/CommandServer.ts';
import { DrawnDots }                                                                from '../../testing/DrawnDots.ts';
import { FailedActions }                                                            from '../../testing/FailedActions.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { PackageControls }                                                          from '../../testing/PackageControls.ts';
import { type HostElement, ReactElementTree }                                       from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS }                               from '../../testing/fixtures/fleet-versions.ts';
import { AttentionLayout }                                                          from './AttentionLayout.tsx';
import { AttentionModel }                                                           from './AttentionModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const DONE: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'done', refusal: null, text: null, forges: []
};

const UPDATE_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'update-in-progress',
  text:          'An update already runs in this repository.',
  forges:        [],
};

function contentOf(fleetDocument: FleetDocument) {
  const screen = AttentionModel.screenOf(fleetDocument, { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' });
  if (screen.kind !== 'fleet') throw new Error('Expected the fleet screen.');
  return screen.content;
}

/** Each send the layout makes is kept in `sends`, so a spec can wait for its answer. */
function unfoldedLayout(fleetDocument: FleetDocument, sender: CommandSender = senderOver([]), sends: Promise<unknown>[] = []) {
  const states = sender.states();
  return tree.unfolded(
    <AttentionLayout
      content={contentOf(fleetDocument)}
      outageResumeAnswer={AttentionModel.outageResumeAnswerOf(states.fleetAnswers.get('fleet-outage-resume') ?? null, fleetDocument)}
      commandStates={states}
      onCommand={(command) => {
        sends.push(sender.send(command));
      }}
      onDismissFailure={(subject: CommandSubject) => sender.dismissFailure(subject)}
      onDismissRestartPending={(subject: CommandSubject) => sender.dismissRestartPending(subject)}
      onDismissOutageResumeAnswer={() => sender.dismissAnswer('fleet-outage-resume')}
    />,
  );
}

function rowsIn(unfolded: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-row'));
}

function rowButtonOf(row: HostElement): HostElement {
  return tree.onlyOfComponent([row], Button);
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, label: string): HostElement {
  return PackageButtons.onlyLabelled(nodes, label);
}

/** Whether the package's button is handed a link, which it draws as one, or a press. */
function buttonFormOf(button: HostElement): 'link' | 'button' {
  return button.props['href'] === undefined ? 'button' : 'link';
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
    expect(rows.map((row) => tree.onlyOfComponent([tree.onlyWithClass([row], 'gaia-attention-row-id')], MonoId).props['text'])).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const buttons = rows.map(rowButtonOf);
    expect(buttons.map((button) => [buttonFormOf(button), PackageButtons.emphasisOf(button), PackageButtons.labelOf(button)])).toEqual([
      ['link', 'primary', 'Answer'],
      ['link', 'quiet', 'Ready'],
      ['link', 'quiet', 'Answer'],
      ['link', 'quiet', 'Accept'],
      ['link', 'quiet', 'Answer'],
    ]);
    expect(buttons[4]?.props['href']).toBe(`#forge/${TRACKER_IDS.exampleStorefront}/questions/E2`);
  });

  test('a row shows its forge with the dot and the word, the kind pill in its tone, the subject and the mono meta line', () => {
    const [first] = rowsIn(unfoldedLayout(FLEET_FIVE_FORGES));
    if (first === undefined) throw new Error('Expected a first row.');
    expect(tree.hostElementsIn([first], DrawnDots.isDot).map(DrawnDots.conditionOf)).toEqual(['live']);
    const kind = tree.onlyOfComponent([first], Tag);
    expect([kind.props['text'], kind.props['tone']]).toEqual(['Escalated', 'warn']);
    expect(tree.onlyOfComponent([first], MonoId).props['text']).toBe('E4');
    expect(tree.textOf([first])).toBe('Invoice ServiceliveThe VAT gate cannot run in the sandbox. Allow network for it?from incident I2 · opened 21m');
    expect(first.children.map((cell) => (typeof cell === 'string' ? cell : cell.props['className'] ?? cell.tag))).toEqual([
      'gaia-attention-row-forge', 'gaia-attention-row-kind', 'gaia-attention-row-id', 'gaia-attention-row-text', 'Button',
    ]);
    expect(PackageButtons.labelOf(rowButtonOf(first))).toBe('Answer');
  });

  test('with nothing waiting the list\'s place says so', () => {
    const unfolded = unfoldedLayout({ ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } });
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-list-card'))).toEqual([]);
    expect(tree.onlyOfComponent([tree.onlyWithClass(unfolded, 'gaia-attention-waiting')], EmptyState).props['text']).toBe('Nothing waits on you.');
  });

  test('with every forge read in full the layout draws no figures: they stand stacked in the page title', () => {
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES), tree.withComponent(Figure))).toEqual([]);
  });
});

describe('a callout\'s command', () => {
  test('"Update forge" sends forge-update and is disabled while it is on its way, and only that forge\'s buttons are', async () => {
    const answer = heldAnswer();
    const sent: SentRequest[] = [];
    const sender = senderOver([() => answer.promise], sent);
    const sends: Promise<unknown>[] = [];
    PackageButtons.press(buttonNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender, sends), 'Update forge'));
    expect(sent.map((request) => JSON.parse(String(request.requestOptions.body)))).toEqual([
      { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp, commandVersion: 5 },
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
    const refusal = FailedActions.onlyFailedActionIn([calloutNamed(refused, 'Example Mobile App')]);
    expect(FailedActions.wordsOf(refusal)).toEqual(['The forge refused Update forge: ', 'update-in-progress', 'An update already runs in this repository.']);
    expect(FailedActions.failedActionsIn([calloutNamed(refused, 'Design System')])).toEqual([]);
    expect(refusal.props['retryLabel']).toBe('Try again');
    tree.dispatch(refusal, 'onRetry');
    expect(sent).toHaveLength(2);
    sender.dismissFailure({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(FailedActions.failedActionsIn(unfoldedLayout(FLEET_FIVE_FORGES, sender))).toEqual([]);
  });

  test('an update that left a restart pending offers Restart under its callout; Restart sends forge-restart, dismiss takes it away', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
    };
    const sent: SentRequest[] = [];
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending)), () => new Promise<Response>(() => undefined)], sent);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const pending = unfoldedLayout(FLEET_FIVE_FORGES, sender);
    const pendingStep = tree.onlyOfComponent([calloutNamed(pending, 'Example Mobile App')], PendingStep);
    expect([pendingStep.props['word'], pendingStep.props['sentence']]).toEqual(['Updated; restart pending.', 'Its Overseer runs the old code until it restarts.']);
    expect(tree.hostElementsIn([calloutNamed(pending, 'Design System')], tree.withComponent(PendingStep))).toEqual([]);
    PackageButtons.press(buttonNamed(tree.unfoldedProp(pendingStep, 'action'), 'Restart'));
    expect(JSON.parse(String(sent[1]?.requestOptions.body))).toEqual({ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp, commandVersion: 5 });
    const restarting = tree.onlyOfComponent([calloutNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'Example Mobile App')], PendingStep);
    expect(buttonNamed(tree.unfoldedProp(restarting, 'action'), 'Restart').props['disabled']).toBe(true);
    sender.dismissRestartPending({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES, sender), tree.withComponent(PendingStep))).toEqual([]);
  });

  test('a Restart the pending step sent that the forge refuses shows its refusal under the callout that offered it', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
    };
    const restartRefused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-busy', text: 'Its Overseer is busy with a baton pass.', forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending)), () => Promise.resolve(answerResponse(restartRefused))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    await sender.send({ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp });
    const refusal = FailedActions.onlyFailedActionIn([calloutNamed(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'Example Mobile App')]);
    expect(FailedActions.wordsOf(refusal)).toEqual(['The forge refused Restart: ', 'overseer-busy', 'Its Overseer is busy with a baton pass.']);
  });

  test('a callout that leaves the document leaves the view', () => {
    const updated = { ...FLEET_FIVE_FORGES, needsALook: FLEET_FIVE_FORGES.needsALook.filter((look) => look.kind !== 'launches-held') };
    expect(PackageButtons.buttonsIn(unfoldedLayout(updated)).filter((button) => PackageButtons.labelOf(button) === 'Update forge')).toEqual([]);
  });
});

describe('forges Gaia cannot fully read (B3)', () => {
  test('an unreachable forge has a banner atop the view with its last stamp in mono and Look again', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const inCallouts = new Set(tree.hostElementsIn(tree.hostElementsIn(unfolded, tree.withClass('gaia-callout'))));
    const banner = tree.onlyHostElementIn(unfolded, (element) => tree.withComponent(Banner)(element) && !inCallouts.has(element));
    expect(banner.props['tone']).toBe('error');
    const textParts = tree.unfoldedProp(banner, 'text').map((part) => {
      if (typeof part === 'string') return part;
      return part.tag === 'Stamp' ? `[stamp ${String(part.props['shortText'])}]` : tree.textOf([part]);
    });
    expect(textParts.join('')).toBe('Overseer unreachable: Invoice Service. Gaia shows what it last reported at [stamp 13:14] and tries again.');
    expect(PackageButtons.buttonsIn(tree.unfoldedProp(banner, 'action')).map(PackageButtons.labelOf)).toEqual(['Look again']);
  });

  test('its rows can be read, at reduced contrast, and not acted on: the button is disabled and goes nowhere', () => {
    const rows = rowsIn(unfoldedLayout(FLEET_DEGRADED));
    expect(rows.map((row) => row.props['data-stale'])).toEqual(['', undefined, '', undefined]);
    const stale = rows.filter((row) => row.props['data-stale'] !== undefined);
    expect(stale.map((row) => tree.textOf([tree.onlyWithClass([row], 'gaia-attention-row-subject')]))).toEqual([
      'The VAT gate cannot run in the sandbox. Allow network for it?',
      'Round VAT per line, not per invoice',
    ]);
    expect(stale.map(rowButtonOf).map((button) => [buttonFormOf(button), button.props['disabled'], button.props['href']])).toEqual([
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
        'Nothing since 13:14. Its rows show as last reported. The totals cannot vouch for it.',
        'Counts and jobs only. No questions or reviews by name. The totals cannot vouch for it.',
        'Nothing. Its contract is newer than this Gaia. The totals cannot vouch for it.',
      ]);
    expect(tree.hostElementsIn(readings, tree.withClass('gaia-visually-hidden'))).toHaveLength(3);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-attention-note')]))
      .toBe('Gaia never guesses a count. The totals leave out the three forges it cannot read in full.');
    expect(tree.hostElementsIn([tree.onlyWithClass(unfolded, 'gaia-attention-note')], tree.withComponent(TextButton))).toEqual([]);
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES), tree.withClass('gaia-attention-readings'))).toEqual([]);
  });

  test('the figures fold into one inline line atop the main column, so the side panel starts under the banner', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const main = tree.onlyWithClass(unfolded, 'gaia-attention-main');
    const figuresRow = tree.onlyWithClass([main], 'gaia-attention-figures');
    expect(figuresRow.props['data-form']).toBe('line');
    const figures = tree.hostElementsIn([figuresRow], tree.withComponent(Figure));
    expect(figures.map((figure) => [figure.props['form'], figure.props['value'], figure.props['label']])).toEqual([
      ['inline', '4+', 'waiting on you'],
      ['inline', '10 / 12', 'agents'],
      ['inline', '8', 'tickets ready'],
      ['inline', '5', 'done today'],
      ['inline', '1.08M', 'tokens today'],
      ['inline', '0', 'open incidents'],
    ]);
  });

  test('the primary row alone carries the orange edge\'s mark, and a compact running card heads its waiting line unless it is stale', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    expect(rowsIn(unfolded).map((row) => row.props['data-primary'])).toEqual([undefined, '', undefined, undefined]);
    const cards = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-running-card'));
    expect(cards.map((card) => card.props['data-form'])).toEqual(['compact', 'compact', 'compact', 'compact']);
    expect(cards.map((card) => tree.hostElementsIn([tree.onlyWithClass([card], 'gaia-attention-running-head')], tree.withClass('gaia-attention-running-waiting'))
      .map((waiting) => tree.textOf([waiting])))).toEqual([['2 wait on you'], [], ['1 waits on you'], []]);
  });

  test('each look carries its kind, so a held forge\'s agents line can be set as a sentence and not as a machine value', () => {
    const looks = tree.hostElementsIn(unfoldedLayout(FLEET_DEGRADED), tree.withClass('gaia-attention-look'));
    expect(looks.map((look) => look.props['data-look-kind'])).toEqual(['unreachable', 'launches-held', 'newer-contract', 'counts-only']);
  });

  test('B3\'s callouts are drawn in their tones, Analytics Sandbox\'s neutral, as Gaia is the one behind, with its dashed unreadable dot', () => {
    const callouts = tree.hostElementsIn(unfoldedLayout(FLEET_DEGRADED), tree.withClass('gaia-callout'));
    expect(callouts.map((callout) => [callout.props['aria-label'], tree.onlyWithClass([callout], 'gaia-callout-body').props['data-tone']])).toEqual([
      ['Invoice Service: Unreachable.', 'error'],
      ['Example Mobile App: Launches held.', 'warn'],
      ['Analytics Sandbox: Newer than this Gaia.', 'neutral'],
      ['Research Wiki: Counts only', 'neutral'],
    ]);
    const newer = callouts[2];
    expect(newer === undefined ? null : DrawnDots.conditionOf(tree.onlyHostElementIn([newer], DrawnDots.isDot))).toBe('unreadable|missing');
    const looks = tree.hostElementsIn(unfoldedLayout(FLEET_DEGRADED), tree.withClass('gaia-attention-look'));
    expect(looks.map((look) => look.props['data-word-form'])).toEqual(['sentence', 'sentence', 'sentence', 'pill']);
  });
});

describe('forges at a version this Gaia cannot talk to (U1)', () => {
  const BILLING = FLEET_VERSIONS_TRACKER_IDS.exampleBilling;

  test('each callout sets its versions line in the sentence\'s face with the numbers in mono, and no machine line', () => {
    const unfolded = unfoldedLayout(FLEET_VERSIONS);
    for (const [project, line] of [
      ['Example Billing', 'forge 1.8 · this Gaia is built for forge 3.1'],
      ['Analytics Sandbox', 'forge 4.1 · serves clients built for forge 4.0 and later · this Gaia is built for forge 3.1'],
    ] as const) {
      const callout = calloutNamed(unfolded, project);
      expect(tree.textOf([tree.onlyWithClass([callout], 'gaia-versions-line')])).toBe(line);
      expect(tree.hostElementsIn([callout], tree.withClass('gaia-callout-machine-line'))).toEqual([]);
    }
    const numbers = tree.hostElementsIn([calloutNamed(unfolded, 'Example Billing')], tree.withClass('gaia-version-number'));
    expect(numbers.map((number) => tree.textOf([number]))).toEqual(['1.8', '3.1']);
  });

  test('Update forge on its way turns the older callout into its status beside a ring, and its one button waits as Updating', () => {
    const answer = heldAnswer();
    const sender = senderOver([() => answer.promise]);
    PackageButtons.press(buttonNamed(unfoldedLayout(FLEET_VERSIONS, sender), 'Update forge'));
    const callout = calloutNamed(unfoldedLayout(FLEET_VERSIONS, sender), 'Example Billing');
    const status = tree.onlyWithClass([callout], 'gaia-attention-look-status');
    expect(tree.textOf([status])).toBe('Updating the forge… its agents keep running');
    expect(tree.hostElementsIn([status], DrawnDots.isDot).map(DrawnDots.conditionOf)).toEqual(['starting']);
    const buttons = PackageButtons.buttonsIn([callout]);
    expect(buttons.map((button) => [PackageButtons.labelOf(button), button.props['disabled']])).toEqual([['Updating', true]]);
    expect(tree.hostElementsIn([callout], tree.withClass('gaia-versions-line'))).toEqual([]);
  });

  test('once the update leaves a restart pending, the callout says the forge stays older and the step under it offers a secondary Restart', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending))]);
    await sender.send({ kind: 'forge-update', trackerId: BILLING });
    const callout = calloutNamed(unfoldedLayout(FLEET_VERSIONS, sender), 'Example Billing');
    expect(tree.textOf([tree.onlyWithClass([callout], 'gaia-callout-sentence')]))
      .toBe('This forge stays older than the forge this Gaia is built for until its Overseer restarts.');
    const pendingStep = tree.onlyOfComponent([callout], PendingStep);
    expect([pendingStep.props['word'], pendingStep.props['sentence']])
      .toEqual(['Updated; restart pending.', 'Its Overseer runs the old code, and this Gaia reads none of it, until it restarts.']);
    const restart = buttonNamed(tree.unfoldedProp(pendingStep, 'action'), 'Restart');
    expect(PackageButtons.emphasisOf(restart)).toBe('quiet');
    expect(PackageButtons.buttonsIn([tree.onlyWithClass([callout], 'gaia-callout')])).toEqual([]);
  });

  test('the side panel sets each forge\'s version, orange only for the older one, and the notes name the forges the totals leave out', () => {
    const unfolded = unfoldedLayout(FLEET_VERSIONS);
    const versions = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-reading-version'));
    expect(versions.map((version) => [tree.textOf([version]), version.props['data-work'] !== undefined])).toEqual([
      ['forge 3.4 · ahead', false],
      ['forge 3.1', false],
      ['forge 3.1', false],
      ['forge 1.8 · older', true],
      ['forge 4.1 · newer', false],
    ]);
    const [readingsNote, runningNote] = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-note'));
    expect(tree.textOf([tree.onlyWithClass(readingsNote === undefined ? [] : [readingsNote], 'gaia-attention-note-sentence')]))
      .toBe('Gaia never guesses a count. The totals leave out Example Billing and Analytics Sandbox.');
    const versionsLink = tree.onlyOfComponent(readingsNote === undefined ? [] : [readingsNote], TextButton);
    expect([versionsLink.props['label'], versionsLink.props['href']]).toEqual(['Versions', '#forges']);
    expect(tree.textOf(runningNote === undefined ? [] : [runningNote])).toBe('Example Billing and Analytics Sandbox run too. This Gaia cannot read their agents.');
  });

  test('the figures stand in the page title, so the layout draws none', () => {
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_VERSIONS), tree.withComponent(Figure))).toEqual([]);
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
    expect(firstJobs.map(DrawnDots.roleOf)).toEqual(['builder', 'needs-user', 'builder', 'reviewer']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-recent-entry'))).toHaveLength(4);
    const allActivity = tree.onlyOfComponent(unfolded, TextButton);
    expect([allActivity.props['label'], allActivity.props['href']]).toEqual(['All activity', '#activity']);
  });

  test('with no activity reported, just happened says so in its place', () => {
    const unfolded = unfoldedLayout({ ...FLEET_FIVE_FORGES, activity: [] });
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-recent'))).toEqual([]);
    const recentSection = tree.onlyHostElementIn(unfolded, (element) => element.tag === 'section' && element.props['aria-label'] === 'Just happened');
    expect(tree.onlyOfComponent([recentSection], EmptyState).props['text']).toBe('No forge has reported activity yet.');
  });

  test('every control has a name, and none opens a forge\'s own Bridge', () => {
    const unfolded = unfoldedLayout(FLEET_DEGRADED);
    const controls = tree.hostElementsIn(unfolded, (element) => PackageControls.isControl(element) || element.tag === 'a' || PackageButtons.isButton(element));
    expect(controls.filter((control) => PackageControls.nameOf(control).trim() === '')).toEqual([]);
    expect(PackageButtons.buttonsIn(unfolded).filter((button) => PackageButtons.labelOf(button) === 'Open in new tab')).toEqual([]);
  });

});

describe('the outage resume\'s answer', () => {
  const OUTAGE_RESUME_COMMAND = { kind: 'fleet-outage-resume' } as const;

  function outageAnswerOf(forges: CommandAnswerDocument['forges'], outcome: CommandAnswerDocument['outcome'] = 'done'): CommandAnswerDocument {
    return {
      answerVersion: 3, outcome, refusal: null, text: null, forges
    };
  }

  test('shows one line per forge that resumed, refused or did not answer, until dismissed', async () => {
    const answer = outageAnswerOf([
      {
        trackerId: TRACKER_IDS.exampleStorefront, outcome: 'resumed', resumedCount: 2, refusalText: null
      },
      {
        trackerId: TRACKER_IDS.invoiceService, outcome: 'refused', resumedCount: 0, refusalText: 'The Overseer is held by an install change.'
      },
      {
        trackerId: TRACKER_IDS.designSystem, outcome: 'not-reached', resumedCount: 0, refusalText: null
      },
    ]);
    const sender = senderOver([() => Promise.resolve(answerResponse(answer))]);
    await sender.send(OUTAGE_RESUME_COMMAND);
    const unfolded = unfoldedLayout(FLEET_FIVE_FORGES, sender);
    const lines = tree.hostElementsIn(unfolded, tree.withClass('gaia-attention-outage-answer-line'));
    expect(lines.map((line) => [line.props['data-outcome'], tree.textOf([line])])).toEqual([
      ['resumed', 'Example Storefront Resumed 2 agents'],
      ['refused', 'Invoice Service The Overseer is held by an install change.'],
      ['not-reached', 'Design System Did not answer. Nothing was resumed there.'],
    ]);
    tree.dispatch(tree.onlyOfComponent([tree.onlyWithClass(unfolded, 'gaia-attention-outage-answer')], TextButton), 'onPress');
    expect(tree.hostElementsIn(unfoldedLayout(FLEET_FIVE_FORGES, sender), tree.withClass('gaia-attention-outage-answer'))).toEqual([]);
  });

  test('says "Nothing to resume" when every forge answered nothing to do', async () => {
    const nothing = outageAnswerOf([{
      trackerId: TRACKER_IDS.exampleStorefront, outcome: 'nothing-to-do', resumedCount: 0, refusalText: null
    }], 'nothing-to-do');
    const sender = senderOver([() => Promise.resolve(answerResponse(nothing))]);
    await sender.send(OUTAGE_RESUME_COMMAND);
    expect(tree.textOf([tree.onlyWithClass(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'gaia-attention-outage-answer-nothing')])).toBe('Nothing to resume');
  });

  test('shows Gaia\'s refusal when the resume could not be carried, and Try again sends it once more', async () => {
    const sent: SentRequest[] = [];
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'registry-unreadable', text: null, forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(refused, 409)), () => new Promise<Response>(() => undefined)], sent);
    await sender.send(OUTAGE_RESUME_COMMAND);
    const refusal = FailedActions.onlyFailedActionIn([tree.onlyWithClass(unfoldedLayout(FLEET_FIVE_FORGES, sender), 'gaia-attention-refusal')]);
    tree.dispatch(refusal, 'onRetry');
    expect(sent.map((request) => JSON.parse(String(request.requestOptions.body)) as unknown)).toEqual([
      { ...OUTAGE_RESUME_COMMAND, commandVersion: 5 },
      { ...OUTAGE_RESUME_COMMAND, commandVersion: 5 },
    ]);
  });
});
