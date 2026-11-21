/**
 * A forge in place in the shell, fed by the fleet source. What matters (SCREENS B1): Answer on E2 in Attention links to
 * `#forge/<trackerId>/questions/E2`, and that address shows Example Storefront's bar as artboard B1 draws it: the forge's mark before its
 * name, its word, its line of agents and what waits with the figures in mono and the whole reading with since in its tooltip, its controls
 * with the arrow of "Open in new tab", and no theme button, over "Opening Example Storefront." while the frame session is asked for; an
 * unreachable forge shows B3's callout in the frame area; a forge without the embed channel says it cannot be shown inside Gaia; a command
 * on its way disables the bar's controls, and the forge's refusal shows under the bar; Flint's brain shows in the bar as the forge reports
 * it, Wake waits while it is on its way, and a refused wake shows beside Wake, not under the bar; nothing of the frame is asked for or painted before
 * the first fleet document, and the page's markup carries no session code. The board's own header and tabs stand between the bar and
 * the frame, which is drawn only for a tab no view of the board draws. The bar's Open in new tab opens the same route of Gaia's own address,
 * for a forge Gaia cannot talk to as for any other, and sends no command. `GaiaApp` is rendered with React's own server renderer, which
 * runs the hooks but no effect, so no frame session is asked while rendering; the surroundings fail a spec that asks one. The bar's
 * controls are held whole to the hook-free controls drawn for the state the sender holds, whose buttons the spec reads unfolded, so no
 * spec reads the markup the package draws.
 */
import { describe, expect, test }         from 'bun:test';
import { Text }                           from 'design-system/Text';
import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup }           from 'react-dom/server';

import type { CommandAnswerDocument }                                               from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import { CommandSender }                                                            from '../../api/CommandSender.ts';
import type { FleetStreamState }                                                    from '../../api/FleetStreamClient.ts';
import type { BoardTabViewTable }                                                   from '../../board/shell/BoardTabViews.tsx';
import { Refusal }                                                                  from '../../design-system/Refusal.tsx';
import { HashRouter }                                                               from '../../shared/HashRouter.ts';
import { createFleetSource }                                                        from '../../shell/FleetSource.ts';
import { GaiaApp }                                                                  from '../../shell/GaiaApp.tsx';
import { answerResponse, senderOver }                                               from '../../testing/CommandServer.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { ReactElementTree }                                                         from '../../testing/ReactElementTree.ts';
import { forgeFrameSurroundingsAt, shellSurroundingsAt, silentBoardServicesOf }     from '../../testing/ShellSurroundingsAt.ts';
import { fleetWithStorefrontBrainOf }                                               from '../../testing/fixtures/fleet-brain-states.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeBarControls }                                                         from './ForgeFrameLayout.tsx';
import { ForgeFrameModel }                                                          from './ForgeFrameModel.ts';
import { forgeViewPartsOf }                                                         from './ForgeView.tsx';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

const STOREFRONT_ON_E2 = `#forge/${TRACKER_IDS.exampleStorefront}/questions/E2`;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const doNothing = () => undefined;

interface Rendered {
  readonly markup:        string;
  readonly trackerId:     string;
  readonly fleetDocument: FleetDocument | null;
  readonly commandSender: CommandSender;
}

function markupAt(fragment: string, fleetDocument: FleetDocument | null, commandSender: CommandSender = senderOver([]), boardTabViews: BoardTabViewTable = {}): Rendered {
  const source = createFleetSource();
  if (fleetDocument !== null) source.publish(fleetDocument);
  const shellSurroundings = shellSurroundingsAt(fragment);
  const surroundings = { ...shellSurroundings, forgeFrame: { ...shellSurroundings.forgeFrame, boardTabViews } };
  const markup = renderToStaticMarkup(<GaiaApp fleetSource={source} fleetStream={LIVE_STREAM} commandSender={commandSender} surroundings={surroundings} />);
  const route = HashRouter.routeOf(fragment);
  const trackerId = route.view === 'forge' ? route.trackerId : '';
  return {
    markup, trackerId, fleetDocument, commandSender
  };
}

/** A figure the forge reported, set in mono in the bar's line: the package's text as the bar hands it the figure. */
function figure(text: string): string {
  return renderToStaticMarkup(<Text typeRole="small" mono>{text}</Text>);
}

/**
 * The bar's buttons, each by its label and "(disabled)" where it is, once the bar's controls are the hook-free controls drawn whole for the
 * forge's bar and the state the sender holds for it, with the Stop question closed; controls of anything else fail the spec.
 */
function buttonsIn({
  markup, trackerId, fleetDocument, commandSender
}: Rendered): string[] {
  const bar = fleetDocument === null ? null : ForgeFrameModel.forgeFrameContentOf(trackerId, fleetDocument, CLOCK).bar;
  if (bar === null) throw new Error('The forge has no bar.');
  const commandState = CommandSender.stateOf(commandSender.states(), { trackerId });
  const controls = (
    <ForgeBarControls
      bar={bar}
      brainShown={bar.brain === null ? null : ForgeFrameModel.brainShownAfter(bar.brain, commandState.failure)}
      commandIsOnItsWay={commandState.onItsWay !== null}
      stopIsOpen={false}
      stopAnchorRef={{ current: null }}
      stopAgents="keep"
      onCommand={doNothing}
      onOpenStop={doNothing}
      onChooseStop={doNothing}
      onCancelStop={doNothing}
      updateStep={ForgeFrameModel.updateStepOf(commandState)}
      onDismissUpdate={doNothing}
      onOpenInNewTab={doNothing}
    />
  );
  expect(markup).toContain(`<span class="gaia-forge-frame-bar-controls">${renderToStaticMarkup(controls)}</span></header>`);
  return PackageButtons.buttonsIn(ReactElementTree.unfolded(controls))
    .map((button) => `${PackageButtons.labelOf(button)}${button.props['disabled'] === true ? ' (disabled)' : ''}`);
}

describe('from Answer on E2 to Example Storefront in place', () => {
  test('Attention\'s Answer on E2 links to the forge in place at the Bridge\'s Questions tab with E2 open', () => {
    expect(markupAt('#attention', FLEET_FIVE_FORGES).markup).toContain(`href="${STOREFRONT_ON_E2}"`);
  });

  test('that address shows the forge\'s bar of artboard B1 over "Opening Example Storefront."', () => {
    const rendered = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    const { markup } = rendered;
    expect(markup).toContain('<h1 class="gaia-forge-frame-bar-name">Example Storefront</h1>');
    const wholeReading = '4 / 5 agents · 2 wait on you · since 09:12';
    const line = `${figure('4 / 5')} agents · ${figure('2')} wait on you`;
    expect(markup).toContain(`<span class="gaia-forge-frame-bar-word">Live</span><span class="gaia-forge-frame-bar-line" title="${wholeReading}">${line}</span>`);
    expect(markup).toContain('<header class="gaia-forge-frame-bar"><svg class="brand-forge-mark" role="img" aria-label="Forge" width="22" height="22"');
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Stop', 'Open in new tab']);
    const barControls = /<span class="gaia-forge-frame-bar-controls">.*<\/span><\/header>/.exec(markup)?.[0];
    expect(barControls).toContain('<svg class="design-system-icon" viewBox="0 0 16 16" data-icon="arrow-out-of-square" aria-hidden="true"');
    expect(markup).not.toContain('aria-label="Theme: ');
    expect(markup).toContain('<p class="gaia-forge-frame-opening" role="status">Opening Example Storefront.</p>');
    expect(markup).toContain(`href="#forge/${TRACKER_IDS.exampleStorefront}" aria-current="page"`);
  });

  test('the page\'s markup carries no session code and no frame before the frame session answers', () => {
    const { markup } = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    expect(markup).not.toContain('session=');
    expect(markup).not.toContain('<iframe');
  });
});

describe('the board over the frame', () => {
  test('the board\'s own header and tabs stand under Gaia\'s bar, over the frame area of a tab not yet moved', () => {
    const { markup } = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    const barAt = markup.indexOf('class="gaia-forge-frame-bar"');
    const boardHeaderAt = markup.indexOf('class="board-header"');
    const frameAreaAt = markup.indexOf('class="gaia-forge-frame-area"');
    expect([barAt < boardHeaderAt, boardHeaderAt < frameAreaAt]).toEqual([true, true]);
    expect(markup).toContain(`href="#forge/${TRACKER_IDS.exampleStorefront}/questions"`);
    expect(markup).toContain('<main tabindex="-1" class="board-panel" data-tab="questions" data-unmoved="">');
  });

  test('the frame is drawn only for a tab no view of the board draws, never for a moved one', () => {
    const questionsMoved: BoardTabViewTable = { questions: () => <p>The moved Questions view</p> };
    const { markup } = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, senderOver([]), questionsMoved);
    expect(markup).not.toContain('gaia-forge-frame-area');
    expect(markup).not.toContain('Opening Example Storefront.');
    expect(markup).toContain('<main tabindex="-1" class="board-panel" data-tab="questions">');
    expect(markupAt(`#forge/${TRACKER_IDS.exampleStorefront}/agents`, FLEET_FIVE_FORGES, senderOver([]), questionsMoved).markup).toContain('Opening Example Storefront.');
  });
});

/** The trackers whose board services the shell asked for while rendering a fragment, and whether the board's header was drawn. */
function boardMountedAt(fragment: string, fleetDocument: FleetDocument): { readonly servicesAskedFor: string[]; readonly headerIsDrawn: boolean } {
  const servicesAskedFor: string[] = [];
  const source = createFleetSource();
  source.publish(fleetDocument);
  const shellSurroundings = shellSurroundingsAt(fragment);
  const boardServicesOf = (trackerId: string) => {
    servicesAskedFor.push(trackerId);
    return silentBoardServicesOf(trackerId);
  };
  const surroundings = { ...shellSurroundings, forgeFrame: { ...shellSurroundings.forgeFrame, boardServicesOf } };
  const markup = renderToStaticMarkup(<GaiaApp fleetSource={source} fleetStream={LIVE_STREAM} commandSender={senderOver([])} surroundings={surroundings} />);
  return { servicesAskedFor, headerIsDrawn: markup.includes('class="board-header"') };
}

describe('the board mounts only where Gaia\'s relay can read it', () => {
  test('a dormant forge and a forge whose repository is missing draw no board header and ask for no board services', () => {
    expect(boardMountedAt(`#forge/${TRACKER_IDS.designSystem}`, FLEET_FIVE_FORGES)).toEqual({ servicesAskedFor: [], headerIsDrawn: false });
    expect(boardMountedAt(`#forge/${TRACKER_IDS.legacyImporter}`, FLEET_FIVE_FORGES)).toEqual({ servicesAskedFor: [], headerIsDrawn: false });
  });

  test('a forge read in full and an unreachable forge still mount the board', () => {
    expect(boardMountedAt(`#forge/${TRACKER_IDS.exampleStorefront}`, FLEET_FIVE_FORGES))
      .toEqual({ servicesAskedFor: [TRACKER_IDS.exampleStorefront], headerIsDrawn: true });
    expect(boardMountedAt(`#forge/${TRACKER_IDS.invoiceService}`, FLEET_DEGRADED))
      .toEqual({ servicesAskedFor: [TRACKER_IDS.invoiceService], headerIsDrawn: true });
  });
});

describe('a forge that cannot show its Bridge here', () => {
  test('an unreachable forge shows B3\'s callout in the frame area, under a bar that says so and can still stop it', () => {
    const rendered = markupAt(`#forge/${TRACKER_IDS.invoiceService}`, FLEET_DEGRADED);
    const { markup } = rendered;
    expect(markup).toContain('<span class="gaia-forge-frame-bar-word">Unreachable</span><span class="gaia-forge-frame-bar-line" title="as last reported 13:14');
    expect(markup).toContain('Its Overseer stopped answering. The registry still names it.');
    expect(markup).toContain('127.0.0.1:4957 · process 48211 · last answer 13:14');
    expect(buttonsIn(rendered)).toEqual(['Stop', 'Open in new tab']);
  });

  test('a forge without the embed channel Gaia knows says so, with Open in new tab, and its controls stay off', () => {
    const rendered = markupAt(`#forge/${TRACKER_IDS.researchWiki}`, FLEET_DEGRADED);
    const { markup } = rendered;
    expect(markup).toContain('This forge cannot be shown inside Gaia yet.');
    expect(buttonsIn(rendered)).toEqual(['Pause (disabled)', 'Stop (disabled)', 'Open in new tab']);
  });

  test('before the first fleet document nothing of the forge is shown or asked for', () => {
    const rendered = markupAt(STOREFRONT_ON_E2, null);
    const { markup } = rendered;
    expect(markup).toContain(`<h1 class="gaia-forge-frame-bar-name">${TRACKER_IDS.exampleStorefront}</h1>`);
    expect(markup).not.toContain('gaia-forge-frame-bar-status');
    expect(markup).not.toContain('class="gaia-forge-frame"');
  });
});

/** The one element of the view, its components left folded, that is handed an Open in new tab; any other count fails the spec. */
function openInNewTabHandedIn(node: ReactNode): () => void {
  const handed: (() => void)[] = [];
  const visit = (visited: ReactNode): void => {
    if (Array.isArray(visited)) {
      visited.forEach(visit);
      return;
    }
    if (!isValidElement<Readonly<Record<string, unknown>> & { readonly children?: ReactNode }>(visited)) return;
    const { onOpenInNewTab, children } = visited.props;
    if (typeof onOpenInNewTab === 'function') handed.push(onOpenInNewTab as () => void);
    visit(children);
  };
  visit(node);
  expect(handed).toHaveLength(1);
  return handed[0] as () => void;
}

/** The fragments the forge view at a fragment opens in a new tab when its bar's Open in new tab is pressed. */
function fragmentsOpenedFrom(fragment: string, fleetDocument: FleetDocument): string[] {
  const route = HashRouter.routeOf(fragment);
  if (route.view !== 'forge') throw new Error(`${fragment} is not a forge's route.`);
  const opened: string[] = [];
  const surroundings = { ...forgeFrameSurroundingsAt(), openInNewTab: (openedFragment: string) => opened.push(openedFragment) };
  const parts = forgeViewPartsOf({ trackerId: route.trackerId, boardRoute: route.boardRoute }, fleetDocument, CLOCK, surroundings);
  openInNewTabHandedIn(parts.content)();
  return opened;
}

describe('the bar\'s Open in new tab', () => {
  test('opens the board\'s route of Gaia\'s own address, its tab and item kept', () => {
    expect(fragmentsOpenedFrom(STOREFRONT_ON_E2, FLEET_FIVE_FORGES)).toEqual([STOREFRONT_ON_E2]);
    expect(fragmentsOpenedFrom(`#forge/${TRACKER_IDS.exampleStorefront}`, FLEET_FIVE_FORGES)).toEqual([`#forge/${TRACKER_IDS.exampleStorefront}`]);
  });

  test('of a forge Gaia cannot talk to opens Gaia\'s route too, never the forge\'s own Bridge', () => {
    const researchWikiAgents = `#forge/${TRACKER_IDS.researchWiki}/agents`;
    expect(fragmentsOpenedFrom(researchWikiAgents, FLEET_DEGRADED)).toEqual([researchWikiAgents]);
  });
});

describe('the bar\'s commands', () => {
  test('while a command to the forge is on its way, every control of its bar is disabled', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront });
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender))).toEqual(['Pause (disabled)', 'Stop (disabled)', 'Stop (disabled)', 'Open in new tab (disabled)']);
  });

  test('the forge\'s refusal shows under the bar with its own code and sentence', async () => {
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.', forges: []
    };
    const sender = senderOver([async () => answerResponse(refused)]);
    await sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' });
    const rendered = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender);
    const { markup } = rendered;
    const refusal = <Refusal commandLabel="Stop" refusedBy="forge" code="overseer-still-live" sentence="The Overseer did not stop within its tries." onDismiss={doNothing} />;
    expect(markup).toContain(`<div class="gaia-forge-frame-refusal">${renderToStaticMarkup(refusal)}</div>`);
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Stop', 'Open in new tab']);
  });
});

describe('Flint\'s brain in the bar', () => {
  const BRAIN_OFF = fleetWithStorefrontBrainOf('off');

  test('a running brain shows its chip, as the five forges\' fixture publishes it', () => {
    expect(markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES).markup).toContain('<span class="gaia-brain-chip-group" data-state="running"><span class="gaia-brain-chip">');
  });

  test('the running brain\'s Stop sits between the forge\'s Stop and Open in new tab', () => {
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, fleetWithStorefrontBrainOf('running')))).toEqual(['Pause', 'Stop', 'Stop', 'Open in new tab']);
  });

  test('a brain that is off offers Wake, and the forge mark says a double click wakes it', () => {
    const rendered = markupAt(STOREFRONT_ON_E2, BRAIN_OFF);
    const { markup } = rendered;
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
    expect(markup).toContain('aria-label="Forge" width="22" height="22" viewBox="0 0 64 64"><title>Double-click to wake Flint&#x27;s brain</title>');
  });

  test('while the wake is on its way, Wake waits with the rest of the bar', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'forge-brain-start', trackerId: TRACKER_IDS.exampleStorefront });
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, BRAIN_OFF, sender))).toEqual([
      'Pause (disabled)', 'Stop (disabled)', 'Wake Flint\'s brain (disabled)', 'Open in new tab (disabled)',
    ]);
  });

  test('a refused wake shows beside Wake, where it was asked, and not under the bar', async () => {
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-paused', text: 'the Overseer is paused', forges: []
    };
    const sender = senderOver([async () => answerResponse(refused)]);
    await sender.send({ kind: 'forge-brain-start', trackerId: TRACKER_IDS.exampleStorefront });
    const rendered = markupAt(STOREFRONT_ON_E2, BRAIN_OFF, sender);
    const { markup } = rendered;
    expect(markup).toContain('<span class="gaia-brain-chip-group" data-state="refused">');
    expect(markup).toContain('title="The forge refused: the Overseer is paused overseer-paused"');
    expect(markup).not.toContain('class="gaia-forge-frame-refusal"');
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
  });

  test('a wake refused on Example Storefront is not Invoice Service\'s: its bar offers its own Wake, with no refusal', async () => {
    const everyForgeServesTheBrain = {
      ...BRAIN_OFF,
      forges: BRAIN_OFF.forges.map((forge) => ({ ...forge, contracts: { ...forge.contracts, control: 1 } })),
    };
    const sender = senderOver([async () => answerResponse({
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-paused', text: 'the Overseer is paused', forges: []
    })]);
    await sender.send({ kind: 'forge-brain-start', trackerId: TRACKER_IDS.exampleStorefront });
    const rendered = markupAt(`#forge/${TRACKER_IDS.invoiceService}`, everyForgeServesTheBrain, sender);
    const { markup } = rendered;
    expect(markup).toContain('<span class="gaia-brain-chip-group" data-state="off">');
    expect(markup).not.toContain('gaia-brain-chip-refusal');
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
  });
});
