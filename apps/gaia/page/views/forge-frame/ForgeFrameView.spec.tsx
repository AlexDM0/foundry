/**
 * A forge in place in the shell, fed by the fleet source. What matters (SCREENS B1): Answer on E2 in Attention links to
 * `#forge/<trackerId>/#questions/E2`, and that address shows Example Storefront's bar as artboard B1 draws it: the forge's mark before its
 * name, its word, its line of agents and what waits with the figures in mono and the whole reading with since in its tooltip, its controls
 * with the arrow of "Open in new tab", and no theme button, over "Opening Example Storefront." while the frame session is asked for; an
 * unreachable forge shows B3's callout in the frame area; a forge without the embed channel says it cannot be shown inside Gaia; a command
 * on its way disables the bar's controls, and the forge's refusal shows under the bar; Flint's brain shows in the bar as the forge reports
 * it, Wake waits while it is on its way, and a refused wake shows beside Wake, not under the bar; nothing of the frame is asked for or painted before
 * the first fleet document, and the page's markup carries no session code. `GaiaApp` is rendered with React's own server renderer, which
 * runs the hooks but no effect, so no frame session is asked while rendering; the surroundings fail a spec that asks one.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { CommandAnswerDocument }                       from '../../@types/CommandDocument.ts';
import type { FleetDocument }                               from '../../@types/FleetDocument.ts';
import type { CommandSender }                               from '../../api/CommandSender.ts';
import type { FleetStreamState }                            from '../../api/FleetStreamClient.ts';
import { createFleetSource }                                from '../../shell/FleetSource.ts';
import { GaiaApp }                                          from '../../shell/GaiaApp.tsx';
import { answerResponse, senderOver }                       from '../../testing/CommandServer.ts';
import { shellSurroundingsAt }                              from '../../testing/ShellSurroundingsAt.ts';
import { fleetWithStorefrontBrainOf }                       from '../../testing/fixtures/fleet-brain-states.ts';
import { FLEET_DEGRADED }                                   from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../../testing/fixtures/fleet-five-forges.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

const STOREFRONT_ON_E2 = `#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`;

function markupAt(fragment: string, fleetDocument: FleetDocument | null, commandSender: CommandSender = senderOver([])): string {
  const source = createFleetSource();
  if (fleetDocument !== null) source.publish(fleetDocument);
  return renderToStaticMarkup(<GaiaApp fleetSource={source} fleetStream={LIVE_STREAM} commandSender={commandSender} surroundings={shellSurroundingsAt(fragment)} />);
}

/** A figure the forge reported, set in mono in the bar's line. */
function figure(text: string): string {
  return `<span class="design-system-text" data-type-role="small" data-mono="">${text}</span>`;
}

function buttonsIn(markup: string): string[] {
  const barControls = /<span class="gaia-forge-frame-bar-controls">(.*?)<\/span><\/header>/.exec(markup)?.[1] ?? '';
  return [...barControls.matchAll(/<button type="button" class="design-system-button"([^>]*)>(?:<svg.*?<\/svg>|<span[^>]*><\/span>)?([^<]*)<\/button>/g)]
    .map(([, attributes = '', label = '']) => `${label.replace('&#x27;', '\'')}${attributes.includes(' disabled=""') ? ' (disabled)' : ''}`);
}

describe('from Answer on E2 to Example Storefront in place', () => {
  test('Attention\'s Answer on E2 links to the forge in place at the Bridge\'s Questions tab with E2 open', () => {
    expect(markupAt('#attention', FLEET_FIVE_FORGES)).toContain(`href="${STOREFRONT_ON_E2}"`);
  });

  test('that address shows the forge\'s bar of artboard B1 over "Opening Example Storefront."', () => {
    const markup = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    expect(markup).toContain('<h1 class="gaia-forge-frame-bar-name">Example Storefront</h1>');
    const wholeReading = '4 / 5 agents · 2 wait on you · since 09:12';
    const line = `${figure('4 / 5')} agents · ${figure('2')} wait on you`;
    expect(markup).toContain(`<span class="gaia-forge-frame-bar-word">Live</span><span class="gaia-forge-frame-bar-line" title="${wholeReading}">${line}</span>`);
    expect(markup).toContain('<header class="gaia-forge-frame-bar"><svg class="gaia-mark" role="img" aria-label="Forge" width="22" height="22"');
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Open in new tab']);
    expect(markup).toMatch(/<svg class="gaia-open-in-new-tab-glyph" aria-hidden="true"[^>]*>.*?<\/svg>Open in new tab<\/button>/);
    expect(markup).not.toContain('aria-label="Theme: ');
    expect(markup).toContain('<p class="gaia-forge-frame-opening" role="status">Opening Example Storefront.</p>');
    expect(markup).toContain(`href="#forge/${TRACKER_IDS.exampleStorefront}" aria-current="page"`);
  });

  test('the page\'s markup carries no session code and no frame before the frame session answers', () => {
    const markup = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    expect(markup).not.toContain('session=');
    expect(markup).not.toContain('<iframe');
  });
});

describe('a forge that cannot show its Bridge here', () => {
  test('an unreachable forge shows B3\'s callout in the frame area, under a bar that says so and can still stop it', () => {
    const markup = markupAt(`#forge/${TRACKER_IDS.invoiceService}`, FLEET_DEGRADED);
    expect(markup).toContain('<span class="gaia-forge-frame-bar-word">Unreachable</span><span class="gaia-forge-frame-bar-line" title="as last reported 13:14');
    expect(markup).toContain('Its Overseer stopped answering. The registry still names it.');
    expect(markup).toContain('127.0.0.1:4957 · process 48211 · last answer 13:14');
    expect(buttonsIn(markup)).toEqual(['Stop', 'Open in new tab']);
  });

  test('a forge without the embed channel Gaia knows says so, with Open in new tab, and its controls stay off', () => {
    const markup = markupAt(`#forge/${TRACKER_IDS.researchWiki}`, FLEET_DEGRADED);
    expect(markup).toContain('This forge cannot be shown inside Gaia yet.');
    expect(buttonsIn(markup)).toEqual(['Pause (disabled)', 'Stop (disabled)', 'Open in new tab']);
  });

  test('before the first fleet document nothing of the forge is shown or asked for', () => {
    const markup = markupAt(STOREFRONT_ON_E2, null);
    expect(markup).toContain(`<h1 class="gaia-forge-frame-bar-name">${TRACKER_IDS.exampleStorefront}</h1>`);
    expect(markup).not.toContain('gaia-forge-frame-bar-status');
    expect(markup).not.toContain('class="gaia-forge-frame"');
  });
});

describe('the bar\'s commands', () => {
  test('while a command to the forge is on its way, every control of its bar is disabled', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'forge-pause', trackerId: TRACKER_IDS.exampleStorefront });
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender))).toEqual(['Pause (disabled)', 'Stop (disabled)', 'Open in new tab (disabled)']);
  });

  test('the forge\'s refusal shows under the bar with its own code and sentence', async () => {
    const refused: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.'
    };
    const sender = senderOver([async () => answerResponse(refused)]);
    await sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' });
    const markup = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES, sender);
    expect(markup).toContain('The forge refused Stop: <span class="design-system-failed-action-code">overseer-still-live</span>. The Overseer did not stop within its tries.');
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });
});

describe('Flint\'s brain in the bar', () => {
  const BRAIN_OFF = fleetWithStorefrontBrainOf('off');

  test('a running brain at control contract 1 shows its chip with no Stop, as the five forges\' fixture publishes it', () => {
    const markup = markupAt(STOREFRONT_ON_E2, FLEET_FIVE_FORGES);
    expect(markup).toContain('<span class="gaia-brain-chip-group" data-state="running"><span class="gaia-brain-chip">');
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });

  test('at control contract 2 the running brain\'s Stop sits between the forge\'s Stop and Open in new tab', () => {
    expect(buttonsIn(markupAt(STOREFRONT_ON_E2, fleetWithStorefrontBrainOf('running')))).toEqual(['Pause', 'Stop', 'Stop', 'Open in new tab']);
  });

  test('a brain that is off offers Wake, and the forge mark says a double click wakes it', () => {
    const markup = markupAt(STOREFRONT_ON_E2, BRAIN_OFF);
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
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
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-paused', text: 'the Overseer is paused'
    };
    const sender = senderOver([async () => answerResponse(refused)]);
    await sender.send({ kind: 'forge-brain-start', trackerId: TRACKER_IDS.exampleStorefront });
    const markup = markupAt(STOREFRONT_ON_E2, BRAIN_OFF, sender);
    expect(markup).toContain('<span class="gaia-brain-chip-group" data-state="refused">');
    expect(markup).toContain('title="The forge refused: the Overseer is paused overseer-paused"');
    expect(markup).not.toContain('class="gaia-forge-frame-refusal"');
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
  });

  test('a wake refused on Example Storefront is not Invoice Service\'s: its bar offers its own Wake, with no refusal', async () => {
    const everyForgeServesTheBrain = {
      ...BRAIN_OFF,
      forges: BRAIN_OFF.forges.map((forge) => ({ ...forge, contracts: { ...forge.contracts, control: 2 } })),
    };
    const sender = senderOver([async () => answerResponse({
      answerVersion: 3, outcome: 'refused', refusal: 'overseer-paused', text: 'the Overseer is paused'
    })]);
    await sender.send({ kind: 'forge-brain-start', trackerId: TRACKER_IDS.exampleStorefront });
    const markup = markupAt(`#forge/${TRACKER_IDS.invoiceService}`, everyForgeServesTheBrain, sender);
    expect(markup).toContain('<span class="gaia-brain-chip-group" data-state="off">');
    expect(markup).not.toContain('gaia-brain-chip-refusal');
    expect(buttonsIn(markup)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
  });
});
