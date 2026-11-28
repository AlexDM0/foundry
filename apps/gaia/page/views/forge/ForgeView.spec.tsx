/**
 * A forge in place in the shell, fed by the fleet source: the bar over the board, its controls disabled while a command is on its way, and the setup
 * bar while the board has no readable pipeline. `GaiaApp` is rendered with React's own server renderer, which runs the hooks but no effect, and the
 * bar's controls are held whole to the hook-free controls drawn for the sender's state.
 */
import { describe, expect, test }         from 'bun:test';
import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup }           from 'react-dom/server';

import type { CommandAnswerDocument }                                               from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentForge }                                   from '../../@types/FleetDocument.ts';
import type { BoardDocument }                                                       from '../../@types/board/BoardDocument.ts';
import { CommandSender }                                                            from '../../api/CommandSender.ts';
import type { FleetStreamState }                                                    from '../../api/FleetStreamClient.ts';
import { pipelineBoardStateOf }                                                     from '../../board/testing/PipelineFixture.ts';
import { Refusal }                                                                  from '../../components/Refusal.tsx';
import { Text }                                                                     from '../../lib/design-system/DesignSystemInterface.ts';
import { HashRouter }                                                               from '../../shared/HashRouter.ts';
import { createFleetSource }                                                        from '../../shell/FleetSource.ts';
import { GaiaApp }                                                                  from '../../shell/GaiaApp.tsx';
import { answerResponse, senderOver }                                               from '../../testing/CommandServer.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { ReactElementTree }                                                         from '../../testing/ReactElementTree.ts';
import { forgeViewSurroundingsAt, shellSurroundingsAt, silentBoardServicesOf }      from '../../testing/ShellSurroundingsAt.ts';
import { FLEET_DEGRADED }                                                           from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeBarControls }                                                         from './ForgeLayout.tsx';
import { ForgeModel }                                                               from './ForgeModel.ts';
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

function markupAt(fragment: string, fleetDocument: FleetDocument | null, commandSender: CommandSender = senderOver([])): Rendered {
  const source = createFleetSource();
  if (fleetDocument !== null) source.publish(fleetDocument);
  const surroundings = shellSurroundingsAt(fragment);
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
  const bar = fleetDocument === null ? null : ForgeModel.forgeContentOf(trackerId, fleetDocument, CLOCK).bar;
  if (bar === null) throw new Error('The forge has no bar.');
  const commandState = CommandSender.stateOf(commandSender.states(), { trackerId });
  const controls = (
    <ForgeBarControls
      bar={bar}
      commandIsOnItsWay={commandState.onItsWay !== null}
      stopIsOpen={false}
      stopAnchorRef={{ current: null }}
      stopAgents="keep"
      onCommand={doNothing}
      onOpenStop={doNothing}
      onChooseStop={doNothing}
      onCancelStop={doNothing}
      updateStep={ForgeModel.updateStepOf(commandState)}
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

  test('that address shows the forge\'s bar of artboard B1 over the board, which waits for its first read', () => {
    const rendered = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    const { markup } = rendered;
    expect(markup).toContain('<h1 class="gaia-forge-frame-bar-name">Example Storefront</h1>');
    const wholeReading = '4 / 5 agents · 2 wait on you · since 09:12';
    const line = `${figure('4 / 5')} agents · ${figure('2')} wait on you`;
    expect(markup).toContain(`<span class="gaia-forge-frame-bar-word">Live</span><span class="gaia-forge-frame-bar-line" title="${wholeReading}">${line}</span>`);
    expect(markup).toContain('<header class="gaia-forge-frame-bar"><svg class="brand-forge-mark" role="img" aria-label="Forge" width="22" height="22"');
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Open in new tab']);
    const barControls = /<span class="gaia-forge-frame-bar-controls">.*<\/span><\/header>/.exec(markup)?.[0];
    expect(barControls).toContain('<svg class="design-system-icon" viewBox="0 0 16 16" data-icon="arrow-out-of-square" aria-hidden="true"');
    expect(markup).toContain('aria-label="Theme: ');
    expect(markup).toContain('Waiting for the forge&#x27;s first board.');
    expect(markup).toContain(`href="${STOREFRONT_ON_E2}" aria-current="page"`);
  });

  test('the page\'s markup carries no session code and no frame', () => {
    const { markup } = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    expect(markup).not.toContain('session=');
    expect(markup).not.toContain('<iframe');
  });
});

describe('the board under the bar', () => {
  test('the board\'s own header and tabs stand under Gaia\'s bar, over the routed tab\'s main area', () => {
    const { markup } = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    const barAt = markup.indexOf('class="gaia-forge-frame-bar"');
    const boardHeaderAt = markup.indexOf('class="board-header"');
    const mainAreaAt = markup.indexOf('class="board-panel"');
    expect([barAt < boardHeaderAt, boardHeaderAt < mainAreaAt]).toEqual([true, true]);
    expect(markup).toContain(`href="#forge/${TRACKER_IDS.exampleStorefront}/questions"`);
    expect(markup).toContain('<main tabindex="-1" class="board-panel" data-tab="questions">');
  });

  test('no tab is left to a frame: every tab draws in the board\'s main area', () => {
    for (const tab of ['agents', 'kanban', 'pipeline', 'intake']) {
      const { markup } = markupAt(`#forge/${TRACKER_IDS.exampleStorefront}/${tab}`, FLEET_FIVE_FORGES);
      expect([tab, markup.includes('gaia-forge-frame-area'), markup.includes('<iframe')]).toEqual([tab, false, false]);
    }
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
  const surroundings = { ...shellSurroundings, forgeView: { ...shellSurroundings.forgeView, boardServicesOf } };
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

describe('a forge whose Hephaestus is not read in full', () => {
  test('an unreachable forge shows its board as last reported, under a bar that says so and can still stop it', () => {
    const rendered = markupAt(`#forge/${TRACKER_IDS.invoiceService}`, FLEET_DEGRADED);
    const { markup } = rendered;
    expect(markup).toContain('<span class="gaia-forge-frame-bar-word">Unreachable</span><span class="gaia-forge-frame-bar-line" title="as last reported 13:14');
    expect(markup).toContain('class="board-header"');
    expect(buttonsIn(rendered)).toEqual(['Stop', 'Open in new tab']);
  });

  test('a forge read through its summary says Gaia cannot read its board, with no board, and its controls stay off', () => {
    const rendered = markupAt(`#forge/${TRACKER_IDS.researchWiki}`, FLEET_DEGRADED);
    const { markup } = rendered;
    expect(markup).toContain('Gaia cannot read this forge&#x27;s board.');
    expect(markup).not.toContain('class="board-header"');
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
  const surroundings = { ...forgeViewSurroundingsAt(), openInNewTab: (openedFragment: string) => opened.push(openedFragment) };
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
    const disabledControls = ['Pause (disabled)', 'Stop (disabled)', 'Open in new tab (disabled)'];
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender))).toEqual(disabledControls);
  });

  test('the forge\'s refusal shows under the bar with its own code and sentence', async () => {
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'hephaestus-still-live', text: 'Hephaestus did not stop within its tries.', forges: []
    };
    const sender = senderOver([async () => answerResponse(refused)]);
    await sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' });
    const rendered = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender);
    const { markup } = rendered;
    const refusal = <Refusal commandLabel="Stop" refusedBy="forge" code="hephaestus-still-live" sentence="Hephaestus did not stop within its tries." onDismiss={doNothing} />;
    expect(markup).toContain(`<div class="gaia-forge-frame-refusal">${renderToStaticMarkup(refusal)}</div>`);
    expect(buttonsIn(rendered)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });
});

/** The forge view at a fragment with its board read at mount, as a page painted without effects shows it. */
function markupWithBoardAt(fragment: string, fleetDocument: FleetDocument, board: BoardDocument): string {
  const source = createFleetSource();
  source.publish(fleetDocument);
  const shellSurroundings = shellSurroundingsAt(fragment);
  const boardServicesOf = (trackerId: string) => ({ ...silentBoardServicesOf(trackerId), readingAtMount: { board, connection: 'live' as const } });
  const surroundings = { ...shellSurroundings, forgeView: { ...shellSurroundings.forgeView, boardServicesOf } };
  return renderToStaticMarkup(<GaiaApp fleetSource={source} fleetStream={LIVE_STREAM} commandSender={senderOver([])} surroundings={surroundings} />);
}

/** The forge's bar, from its opening tag to its end. */
function barIn(markup: string): string {
  const barStart = markup.indexOf('<header class="gaia-forge-frame-bar"');
  return markup.slice(barStart, markup.indexOf('</header>', barStart) + '</header>'.length);
}

describe('a forge whose board is in setup', () => {
  test('a live forge\'s bar is its name, the setup step bar and one menu, and the board draws no header of its own', () => {
    const markup = markupWithBoardAt(`#forge/${TRACKER_IDS.exampleStorefront}`, FLEET_FIVE_FORGES, pipelineBoardStateOf('A0b-recheck'));
    const bar = barIn(markup);
    expect(bar).toStartWith('<header class="gaia-forge-frame-bar" data-setup="">');
    expect(bar).toContain('<h1 class="gaia-forge-frame-bar-name">Example Storefront</h1><span class="gaia-forge-frame-bar-setup"><div class="board-setup-step-bar">');
    expect(bar).toContain('aria-label="Setup steps"');
    expect(bar).toContain('aria-label="Forge actions of Example Storefront"');
    expect([bar.includes('gaia-forge-frame-bar-status'), bar.includes('>Pause<'), markup.includes('gaia-forge-frame-running')]).toEqual([false, false, false]);
    expect(markup).not.toContain('class="board-header"');
  });

  test('before a setup record opens the bar shows the repository\'s path in the step bar\'s place', () => {
    const bar = barIn(markupWithBoardAt(`#forge/${TRACKER_IDS.exampleStorefront}`, FLEET_FIVE_FORGES, pipelineBoardStateOf('A0')));
    expect(bar).toContain('~/development/example-storefront');
    expect(bar).not.toContain('aria-label="Setup steps"');
  });

  test('a paused, held, restarting or unreachable forge keeps the setup bar and its steps, and says its condition', () => {
    const storefrontIn = (condition: FleetDocumentForge['condition']): FleetDocument => ({
      ...FLEET_FIVE_FORGES,
      forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? { ...forge, condition } : forge)),
    });
    const bars = [
      ...(['paused', 'held', 'restarting'] as const).map((condition) => (
        barIn(markupWithBoardAt(`#forge/${TRACKER_IDS.exampleStorefront}`, storefrontIn(condition), pipelineBoardStateOf('A0b-recheck')))
      )),
      barIn(markupWithBoardAt(`#forge/${TRACKER_IDS.invoiceService}`, FLEET_DEGRADED, pipelineBoardStateOf('A0b-recheck'))),
    ];
    for (const bar of bars) {
      expect([
        bar.includes('data-setup'),
        bar.includes('aria-label="Setup steps"'),
        bar.includes('gaia-forge-frame-bar-condition'),
        bar.includes('gaia-forge-frame-bar-status'),
        bar.includes('gaia-forge-frame-running'),
      ]).toEqual([true, true, true, false, false]);
    }
  });
});
