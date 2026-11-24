/**
 * The visual pass's screens (W7.3): each artboard the page builds, painted from its fixture as the page paints it, as a whole document a
 * browser opens at 1440 x 1016 to compare by eye with the artboard. What matters: no artboard is left out; both themes are the same markup
 * and differ only in the theme the root names and the theme button shows (B1 has no theme button), so a theme is the tokens' work alone; a screen
 * holds no colour of its own; and each screen shows the state its artboard draws, since a pass that compares an artboard with another state
 * compares nothing. C2 is its "What notifies" checklist, opened over Forges as the page opens it (the notifications wait for W5.6), and C3
 * is the launcher's own splash file, opened at both its steps and drawing the page's own mark. The restart an update left pending, which no
 * artboard draws, is painted over A1 and A4, the two artboards whose Update forge can leave it, under the same checks; so are the two
 * warnings of monitor contract 2, a failed restart as A1's look and an Assistant that cannot come up as a notice on A4, and B4's second
 * state, the forge program found. The Versions boards (U1 to U3) are painted over A1, A4 and B1 from the fleet-versions
 * fixture, one screen per board render, Example Billing's Update forge at each of its steps.
 *
 * The by-eye pass itself is not a spec: it writes `screenDocumentOf` for each screen and theme to a scratch folder, opens each at the
 * artboard's size in Chrome or Chromium, and compares the picture with the artboard; the splash opens at `splashScreenAddressOf`. A screen
 * leaves motion off, so none of Gaia's own motion runs; the browser is opened with reduced motion forced (`--force-prefers-reduced-motion`),
 * since the package's own pulse and dialog entry run whether or not motion is ready, and a shot must not land mid-way.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import { createElement }          from 'react';
import { renderToStaticMarkup }   from 'react-dom/server';

import { GaiaMark } from './components/GaiaMark.tsx';
import {
  Banner,
  Button,
  DataTable,
  Icon,
  SlotMeter,
  Stamp,
  Tag,
  Text
} from './lib/design-system/DesignSystemInterface.ts';
import {
  ARTBOARD_SCREENS,
  ARTBOARD_SIZE_PIXELS,
  ASSISTANT_DOWN_SENTENCE,
  type ArtboardScreen,
  B2_STOP_REFUSAL,
  RESTART_FAILED_SENTENCE,
  CRASHED_FORGE_SCREENS,
  FORGE_PROGRAM_FOUND_SCREENS,
  HIDDEN_FORGE_SCREENS,
  MONITOR_WARNING_SCREENS,
  OUTAGE_ENDINGS_SCREENS,
  type PageArtboard,
  pipelineDocumentScreenDocumentOf,
  pipelineDocumentScreenMarkupOf,
  RESTART_PENDING_SCREENS,
  screenDocumentOf,
  SCREEN_THEMES,
  screenMarkupOf,
  SPLASH_MARK_SIZE_PIXELS,
  SPLASH_PAGE_PATH,
  SPLASH_SCREENS,
  SPLASH_SIZE_PIXELS,
  splashScreenAddressOf,
  TICKET_DOCUMENT_SCREENS,
  ticketDocumentScreenDocumentOf,
  ticketDocumentScreenMarkupOf,
  VERSIONS_SCREENS,
  WHAT_NOTIFIES_SCREENS,
  whatNotifiesDocumentOf,
  whatNotifiesMarkupOf,
} from './testing/ArtboardScreens.tsx';
import { DesignSystemStylesheet }         from './testing/DesignSystemStylesheet.ts';
import { type MarkupElement, MarkupTree } from './testing/MarkupTree.ts';
import { PackageStylesheet }              from './testing/PackageStylesheet.ts';
import { PIPELINE_DOCUMENT_SCREENS }      from './testing/PipelineDocumentArtboards.tsx';

const STYLESHEETS = ['tokens.css', 'gaia.css'].map((fileName) => readFileSync(join(import.meta.dir, 'styles', fileName), 'utf8'));

/** A colour written as a value: what only tokens.css may hold. */
const COLOUR_VALUE = /oklch\(|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b|\bcolor:/i;

/** Every screen painted from the page: each artboard, and each state the owner added over one. */
const PAINTED_OVER_ARTBOARDS: readonly ArtboardScreen[] = [
  ...ARTBOARD_SCREENS,
  ...RESTART_PENDING_SCREENS,
  ...MONITOR_WARNING_SCREENS,
  ...OUTAGE_ENDINGS_SCREENS,
  ...CRASHED_FORGE_SCREENS,
  ...HIDDEN_FORGE_SCREENS,
  ...FORGE_PROGRAM_FOUND_SCREENS,
  ...VERSIONS_SCREENS,
];

function screenOf(artboard: PageArtboard): ArtboardScreen {
  const screen = ARTBOARD_SCREENS.find((candidate) => candidate.artboard === artboard);
  if (screen === undefined) throw new Error(`No screen paints artboard ${artboard}.`);
  return screen;
}

function textsOfClass(markup: string, className: string): string[] {
  return MarkupTree.textsOfClass(MarkupTree.parse(markup), className);
}

/** The ids of what waits on User, each in its row's id cell. */
function attentionRowIdsOf(markup: string): string[] {
  return textsOfClass(markup, 'gaia-attention-row-id');
}

/** The page title: the first-level heading in the shell's page title area. */
function pageTitleOf(markup: string): string[] {
  return MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-shell-page-title'))
    .flatMap((titleArea) => MarkupTree.elementsIn(titleArea, (element) => element.tag === 'h1'))
    .map(MarkupTree.textOf);
}

/** The brand bar's theme button, the one part of a screen that names its theme. */
function themeButtonsOf(markup: string): MarkupElement[] {
  return MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withRole('button', /^Theme: /));
}

function onlyThemeButtonOf(markup: string): MarkupElement {
  return MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withRole('button', /^Theme: /));
}

function elementsLabelled(scope: MarkupElement, label: string | RegExp): MarkupElement[] {
  return MarkupTree.elementsIn(scope, (element) => {
    const ariaLabel = element.attributes['aria-label'];
    return ariaLabel !== undefined && (typeof label === 'string' ? ariaLabel === label : label.test(ariaLabel));
  });
}

function elementsReading(scope: MarkupElement, text: string): MarkupElement[] {
  return MarkupTree.elementsIn(scope, (element) => MarkupTree.textOf(element) === text);
}

/** The element the selection marks, the selected row. */
function selectedOf(markup: string): MarkupElement {
  return MarkupTree.onlyElementIn(MarkupTree.parse(markup), (element) => element.attributes['aria-current'] === 'true');
}

/** What Gaia hands a compact button, drawn as the package draws it. */
function compactButtonMarkupOf(label: string, disabled = false): string {
  return MarkupTree.drawnMarkupOf(createElement(Button, { label, compact: true, disabled }));
}

/** The pending steps an update left, each a status that opens with its word. */
function restartPendingStepsIn(scope: MarkupElement): MarkupElement[] {
  return MarkupTree.elementsIn(scope, (element) => MarkupTree.withRole('status')(element) && MarkupTree.textOf(element).startsWith('Updated; restart pending.'));
}

const PRIMARY_BUTTON = () => MarkupTree.variantAttributesOf(createElement(Button, { label: 'Example' }), createElement(Button, { label: 'Example', emphasis: 'primary' }));

function inlineStylesOf(markup: string): string[] {
  return [...markup.matchAll(/ style="([^"]*)"/g)].map(([, style = '']) => style);
}

describe('the screens of the visual pass', () => {
  test('paints every artboard the page builds, each from its own artboard source', () => {
    expect(ARTBOARD_SCREENS.map((screen) => [screen.artboard, screen.designFile])).toEqual([
      ['A1', 'Main.dc.html'],
      ['A2', 'Agents.dc.html'],
      ['A3', 'Activity.dc.html'],
      ['A4', 'Forges.dc.html'],
      ['B1', 'Forge.dc.html'],
      ['B2', 'ForgeControls.dc.html'],
      ['B3', 'Degraded.dc.html'],
      ['B4', 'Empty.dc.html'],
    ]);
    expect(ARTBOARD_SIZE_PIXELS).toEqual({ width: 1440, height: 1016 });
  });

  test('builds every screen in both themes, light first as the package\'s default, since version 2 designs both', () => {
    expect(SCREEN_THEMES).toEqual(['light', 'dark']);
  });

  test('a screen document names its theme on the root as the page does before its first paint, leaves motion off, and holds every stylesheet whole', () => {
    const packageStylesheets = [DesignSystemStylesheet.fontFaceRules(), DesignSystemStylesheet.text(), PackageStylesheet.inlinedText('lib/brand/styles/brand.css')];
    for (const screen of ARTBOARD_SCREENS) {
      for (const theme of SCREEN_THEMES) {
        const screenDocument = screenDocumentOf(screen, theme);
        expect(screenDocument).toStartWith(`<!doctype html>\n<html lang="en" data-theme="${theme}">`);
        const stylesheetPlaces = [...packageStylesheets, ...STYLESHEETS].map((stylesheet) => screenDocument.indexOf(stylesheet));
        expect(stylesheetPlaces.every((place) => place > 0)).toBe(true);
        expect(stylesheetPlaces).toEqual([...stylesheetPlaces].sort((a, b) => a - b));
        expect(screenDocument).toContain(`<div id="gaia-root">${screenMarkupOf(screen, theme)}</div>`);
      }
    }
  });

  test('paints the restart an update left pending over A1 and A4, each from its own artboard source, in both themes', () => {
    expect(RESTART_PENDING_SCREENS.map((screen) => [screen.artboard, screen.designFile])).toEqual([
      ['A1', 'Main.dc.html'],
      ['A4', 'Forges.dc.html'],
    ]);
  });

  test('paints each Versions board render over the artboard of its page, from its own board source, Example Billing at each update step', () => {
    expect(VERSIONS_SCREENS.map((screen) => [screen.renderName, screen.artboard, screen.designFile, screen.updateStep])).toEqual([
      ['U1-attention', 'A1', 'VersionsAttention.dc.html', 'idle'],
      ['U2-forges-example-billing', 'A4', 'VersionsForges.dc.html', 'idle'],
      ['U2-forges-analytics-sandbox', 'A4', 'VersionsForges.dc.html', 'idle'],
      ['U2-forges-example-storefront', 'A4', 'VersionsForges.dc.html', 'idle'],
      ['U2-forges-none', 'A4', 'VersionsForges.dc.html', 'idle'],
      ['U3-forge-newer', 'B1', 'VersionsForge.dc.html', 'idle'],
      ['U3-forge-older', 'B1', 'VersionsForgeBehind.dc.html', 'idle'],
      ['U3-forge-older-pending', 'B1', 'VersionsForgeBehind.dc.html', 'pending'],
      ['U3-forge-older-done', 'B1', 'VersionsForgeBehind.dc.html', 'done'],
      ['U3-forge-older-refused', 'B1', 'VersionsForgeBehind.dc.html', 'refused'],
      ['U3-forge-ahead', 'B1', 'VersionsForge.dc.html', 'idle'],
    ]);
  });

  test('a screen holds no colour of its own: no style of its markup names one, so every colour comes from the inlined tokens', () => {
    for (const screen of PAINTED_OVER_ARTBOARDS) {
      for (const theme of SCREEN_THEMES) {
        const markup = screenMarkupOf(screen, theme);
        expect(markup).not.toContain('<style');
        for (const inlineStyle of inlineStylesOf(markup)) expect(inlineStyle).not.toMatch(COLOUR_VALUE);
      }
    }
  });

  test('the two themes paint the same markup, but for the theme the theme button shows', () => {
    const screensWithTheButton = PAINTED_OVER_ARTBOARDS.filter((candidate) => candidate.artboard !== 'B1');
    for (const screen of screensWithTheButton) {
      const dark = screenMarkupOf(screen, 'dark');
      const light = screenMarkupOf(screen, 'light');
      const darkThemeButton = onlyThemeButtonOf(dark);
      const lightThemeButton = onlyThemeButtonOf(light);
      expect(MarkupTree.nameOf(darkThemeButton)).toBe('Theme: dark. Switch to auto');
      expect(MarkupTree.nameOf(lightThemeButton)).toBe('Theme: light. Switch to dark');
      expect(dark.replace(darkThemeButton.source, '')).toBe(light.replace(lightThemeButton.source, ''));
    }
  });

  test('B1, whose route has no theme button, paints the very same markup in both themes', () => {
    expect(screenMarkupOf(screenOf('B1'), 'dark')).toBe(screenMarkupOf(screenOf('B1'), 'light'));
  });
});

describe('each screen shows the state its artboard draws', () => {
  test('C2: the "What notifies" dialog over Forges, five of its seven kinds on, shown as a modal in each theme with no colour of its own', () => {
    for (const screen of WHAT_NOTIFIES_SCREENS) {
      for (const theme of SCREEN_THEMES) {
        const markup = whatNotifiesMarkupOf(screen, theme);
        expect(markup).toContain('>5 of 7 on<');
        expect(MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withRole('checkbox'))).toHaveLength(7);
        for (const inlineStyle of inlineStylesOf(markup)) expect(inlineStyle).not.toMatch(COLOUR_VALUE);
        const screenDocument = whatNotifiesDocumentOf(screen, theme);
        expect(screenDocument).toContain(`data-theme="${theme}"`);
        expect(screenDocument).toContain('dialog.showModal()');
        expect(pageTitleOf(screenDocument)).toEqual(['Forges']);
      }
    }
  });

  test('A1: Attention lists the five entries of the artboard in its order, under the brand bar, beside the rail and under its page title', () => {
    for (const theme of SCREEN_THEMES) {
      const markup = screenMarkupOf(screenOf('A1'), theme);
      expect(markup.indexOf('<header class="gaia-brand-bar">')).toBeLessThan(markup.indexOf('<nav class="gaia-rail"'));
      expect(textsOfClass(markup, 'gaia-brand-bar-sentence')).toEqual(['1 holds its launches · 1 dormant · 1 repository missing']);
      expect(pageTitleOf(markup)).toEqual(['Attention']);
      expect(attentionRowIdsOf(markup)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    }
  });

  test('A2: the Agents table holds its ten agents under their four forges with J4 of Example Storefront selected, as its job tweak draws', () => {
    const markup = screenMarkupOf(screenOf('A2'), 'dark');
    const tree = MarkupTree.parse(markup);
    const agentRows = MarkupTree.elementsIn(tree, (element) => MarkupTree.withClass('gaia-agents-row')(element) && MarkupTree.withRole('row')(element));
    expect(agentRows.filter((row) => row.attributes['data-head'] === undefined)).toHaveLength(10);
    expect(MarkupTree.elementsIn(tree, (element) => MarkupTree.withClass('gaia-agents-group')(element) && MarkupTree.withRole('rowgroup')(element))).toHaveLength(4);
    const selectedRow = selectedOf(markup);
    expect(MarkupTree.roleOf(selectedRow)).toBe('row');
    expect(elementsLabelled(selectedRow, 'Example Storefront, J4')).toHaveLength(1);
    expect(elementsReading(selectedRow, 'J4').length).toBeGreaterThan(0);
    expect(markup).toContain('Open J4 in its forge');
  });

  test('A3 and A4: Activity and Forges each open under their own title', () => {
    expect(pageTitleOf(screenMarkupOf(screenOf('A3'), 'dark'))).toEqual(['Activity']);
    expect(pageTitleOf(screenMarkupOf(screenOf('A4'), 'dark'))).toEqual(['Forges']);
  });

  test('B1: Example Storefront in place, its bar over the board\'s header and main area, no frame, no page title and no theme button', () => {
    const markup = screenMarkupOf(screenOf('B1'), 'dark');
    expect(textsOfClass(markup, 'gaia-forge-frame-bar-name')).toEqual(['Example Storefront']);
    const boardTitleAt = markup.indexOf('<h1 class="board-title">Example Storefront</h1>');
    expect([boardTitleAt > markup.indexOf('class="gaia-forge-frame-bar"'), boardTitleAt < markup.indexOf('class="board-panel"')]).toEqual([true, true]);
    expect([markup.includes('gaia-forge-frame-area'), markup.includes('<iframe')]).toEqual([false, false]);
    const figure = (text: string) => MarkupTree.drawnMarkupOf(createElement(Text, { typeRole: 'small', mono: true, children: text }));
    const line = `${figure('4 / 5')} agents · ${figure('2')} wait on you`;
    expect(markup).toContain(`<span class="gaia-forge-frame-bar-line" title="4 / 5 agents · 2 wait on you · since 09:12">${line}</span>`);
    const openInNewTab = MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withRole('button', 'Open in new tab'));
    const arrowAfterTheWords = MarkupTree.drawnMarkupOf(createElement(Icon, { name: 'arrow-out-of-square', label: null }));
    expect(openInNewTab.source.indexOf(arrowAfterTheWords)).toBeGreaterThan(openInNewTab.source.lastIndexOf('Open in new tab'));
    expect(pageTitleOf(markup)).toEqual([]);
    expect(themeButtonsOf(markup)).toEqual([]);
  });

  test('B1: the board shows its moved Questions view at E2, read over a live stream, not a board still waiting for its first', () => {
    const markup = screenMarkupOf(screenOf('B1'), 'dark');
    expect(markup).toContain('How long should a password reset link stay valid?');
    expect([markup.includes('Waiting for the forge\'s first board.'), markup.includes('>Connecting<')]).toEqual([false, false]);
  });

  test('B2: the Stop dialog under Example Storefront, the refusal under Example Mobile App, and Design System starting', () => {
    const markup = screenMarkupOf(screenOf('B2'), 'dark');
    const tree = MarkupTree.parse(markup);
    const stopQuestion = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.withRole('group')(element) && element.attributes['aria-label'] === 'Stop Example Storefront');
    expect(MarkupTree.textOf(stopQuestion)).toContain('Stop Hephaestus of Example Storefront? 4 agents are running.');
    const refusalCode = B2_STOP_REFUSAL.refusal ?? '';
    expect(MarkupTree.textOf(tree).split(refusalCode)).toHaveLength(2);
    const refusal = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.withRole('alert')(element) && MarkupTree.textOf(element).includes(refusalCode));
    const refusalText = MarkupTree.textOf(refusal);
    expect(refusalText).toContain(B2_STOP_REFUSAL.text ?? '');
    const tryAgain = MarkupTree.onlyElementIn(refusal, MarkupTree.withRole('button', 'Try again'));
    expect(tryAgain.source).toBe(compactButtonMarkupOf('Try again'));
    expect(refusalText.indexOf(B2_STOP_REFUSAL.text ?? '')).toBeLessThan(refusalText.indexOf('Try again'));
    expect(textsOfClass(markup, 'gaia-forges-condition-detail')).toContain('forge start · waiting for its API');
    expect(MarkupTree.onlyElementIn(tree, MarkupTree.withRole('button', 'Starting')).source).toBe(compactButtonMarkupOf('Starting', true));
    expect(textsOfClass(markup, 'gaia-forges-controls-note')).toEqual([
      'A control stays disabled while its command is on its way. A refusal is the forge\'s own sentence, shown beside the control that caused it.',
    ]);
  });

  test('B3: the unreachable banner under the bar, the head that counts what is known, and the figures folded into one line atop the main column', () => {
    const markup = screenMarkupOf(screenOf('B3'), 'dark');
    const tree = MarkupTree.parse(markup);
    const lead = MarkupTree.onlyElementIn(tree, MarkupTree.withClass('gaia-attention-banner-lead'));
    expect(MarkupTree.textOf(lead)).toBe('Hephaestus unreachable: Invoice Service.');
    const errorTone = MarkupTree.variantAttributesOf(createElement(Banner, { tone: 'quiet', text: '' }), createElement(Banner, { tone: 'error', text: '' }));
    const banner = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.carries(element, errorTone) && MarkupTree.elementsIn(element).includes(lead));
    expect(MarkupTree.textOf(banner)).toStartWith('Hephaestus unreachable: Invoice Service.');
    const waitingHead = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.withRole('heading')(element) && MarkupTree.textOf(element).startsWith('Waiting on you'));
    const countTag = createElement(Tag, { key: 'count', text: '4 known, more possible', tone: 'warn' });
    const separator = createElement('span', { key: 'separator', className: 'gaia-visually-hidden' }, ' · ');
    expect(waitingHead.source).toBe(MarkupTree.drawnMarkupOf(createElement(Text, { typeRole: 'section', element: 'h2', children: ['Waiting on you', separator, countTag] })));
    expect(markup).toContain('<div class="gaia-attention-main"><div class="gaia-attention-figures" data-form="line">');
    expect(markup).not.toContain('data-form="stacked"');
  });

  test('A4 and B2: the Forges table sets its columns close, each root carrying its full path', () => {
    const tableOf = (rowHeight: 'regular' | 'tall', columnGap: 'regular' | 'narrow') => createElement(DataTable, {
      label:        'Forges',
      columns:      [],
      columnWidths: '',
      rows:         [],
      rowHeight,
      columnGap,
    });
    const tallRowsSetClose = MarkupTree.variantAttributesOf(tableOf('regular', 'regular'), tableOf('tall', 'narrow'));
    for (const artboard of ['A4', 'B2'] as const) {
      const markup = screenMarkupOf(screenOf(artboard), 'dark');
      const forgesTable = MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withRole('table', 'Forges'));
      expect(MarkupTree.carries(forgesTable, tallRowsSetClose)).toBe(true);
      expect(markup).toContain('<span class="gaia-forges-forge-root" title="/Users/alexexample/development/example-storefront">~/development/example-storefront</span>');
    }
  });

  test('B4: no forge registered, with Add a repository in the head\'s place, the rail\'s forges group saying so, and every slot free', () => {
    const markup = screenMarkupOf(screenOf('B4'), 'dark');
    expect(markup).toContain('Nothing waits on you, because no forge is registered.');
    expect(markup).toContain('Add and start');
    expect(pageTitleOf(markup)).toEqual([]);
    expect(textsOfClass(markup, 'gaia-brand-bar-sentence')).toEqual(['nothing runs on this machine yet']);
    expect(textsOfClass(markup, 'gaia-rail-no-forge')).toEqual(['No forge is registered']);
    expect(textsOfClass(markup, 'gaia-rail-machine-line')).toEqual(['no limit known · 12 CPUs']);
    const rail = MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withRole('navigation'));
    const slotMeter = MarkupTree.onlyElementIn(rail, MarkupTree.withRole('img'));
    const everySlotFree = createElement(SlotMeter, {
      label:  MarkupTree.nameOf(slotMeter),
      filled: 0,
      limit:  12,
      tone:   'accent',
      wrap:   true,
    });
    expect(slotMeter.source).toBe(MarkupTree.drawnMarkupOf(everySlotFree));
  });

  test('B4 found: the forge program named from ~ under the card, beside the one line that says a forge set up elsewhere appears by itself', () => {
    const [found] = FORGE_PROGRAM_FOUND_SCREENS;
    if (found === undefined) throw new Error('The forge program found screen is missing.');
    for (const theme of SCREEN_THEMES) {
      const markup = screenMarkupOf(found, theme);
      expect(textsOfClass(markup, 'gaia-attention-no-forge-program')).toEqual(['~/.bun/bin/forge']);
      expect(textsOfClass(markup, 'gaia-attention-no-forge-elsewhere')).toEqual(['A forge set up elsewhere appears here by itself.']);
      expect(markup.split('appears here by itself')).toHaveLength(2);
      expect(markup).not.toContain('gaia-add-repository-program-missing');
    }
  });
});

describe('B1\'s bar', () => {
  function barControlsOf(markup: string): MarkupElement {
    return MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-forge-frame-bar-controls'));
  }

  function buttonLabelsOf(controls: MarkupElement): string[] {
    return MarkupTree.elementsIn(controls, MarkupTree.withRole('button')).map(MarkupTree.textOf);
  }

  test('holds Pause, Stop and Open in new tab, and nothing more', () => {
    expect(buttonLabelsOf(barControlsOf(screenMarkupOf(screenOf('B1'), 'dark')))).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });
});

describe('the restart an update left pending, over the artboard it changes', () => {
  test('A1: Updated; restart pending with Restart under Example Mobile App\'s callout, and the rest of A1 as drawn', () => {
    const attention = RESTART_PENDING_SCREENS[0];
    if (attention === undefined) throw new Error('A restart pending screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    expect(attentionRowIdsOf(markup)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const tree = MarkupTree.parse(markup);
    expect(restartPendingStepsIn(tree)).toHaveLength(1);
    const heldLook = MarkupTree.onlyElementIn(tree, (element) => (
      MarkupTree.withClass('gaia-attention-look')(element) && elementsLabelled(element, 'Example Mobile App: Launches held.').length > 0
    ));
    const [pendingStep, ...otherPendingSteps] = restartPendingStepsIn(heldLook);
    if (pendingStep === undefined) throw new Error('Example Mobile App\'s callout holds no pending restart.');
    expect(otherPendingSteps).toEqual([]);
    expect(MarkupTree.textOf(pendingStep)).toStartWith('Updated; restart pending. Its Hephaestus runs the old code until it restarts.');
    expect(MarkupTree.elementsIn(heldLook, MarkupTree.withRole('button', 'Restart'))).toHaveLength(1);
  });

  test('A4: Updated; restart pending with Restart under Example Mobile App\'s held banner, and nothing under its row', () => {
    const forges = RESTART_PENDING_SCREENS[1];
    if (forges === undefined) throw new Error('A restart pending screen is missing.');
    const markup = screenMarkupOf(forges, 'dark');
    expect(pageTitleOf(markup)).toEqual(['Forges']);
    const tree = MarkupTree.parse(markup);
    expect(restartPendingStepsIn(tree)).toHaveLength(1);
    const heldGroup = MarkupTree.onlyElementIn(tree, MarkupTree.withClass('gaia-forges-held-group'));
    expect(restartPendingStepsIn(heldGroup)).toHaveLength(1);
    expect(MarkupTree.elementsIn(heldGroup, MarkupTree.withRole('button', 'Restart'))).toHaveLength(1);
  });
});

describe('A4 as drawn, with the forge hidden in Gaia that the five forges\' fixture does not hold', () => {
  test('counts seven registered and one hidden, folds Old Prototype under its head, and keeps Restart the held area\'s one primary', () => {
    const [forges] = HIDDEN_FORGE_SCREENS;
    if (forges === undefined) throw new Error('The hidden forge screen is missing.');
    const markup = screenMarkupOf(forges, 'dark');
    expect(textsOfClass(markup, 'gaia-forges-hidden-summary')).toEqual(['Hidden in Gaia · 1']);
    const tree = MarkupTree.parse(markup);
    expect(elementsReading(tree, 'Old Prototype').length).toBeGreaterThan(0);
    const heldGroup = MarkupTree.onlyElementIn(tree, MarkupTree.withClass('gaia-forges-held-group'));
    const primaryButton = PRIMARY_BUTTON();
    const primaries = MarkupTree.elementsIn(heldGroup, (element) => MarkupTree.carries(element, primaryButton));
    expect(primaries.map((primary) => [MarkupTree.roleOf(primary), MarkupTree.nameOf(primary)])).toEqual([['button', 'Restart']]);
  });
});

describe('the agents a network outage stopped, over the artboards that show them', () => {
  test('A1: the fleet\'s alert heads what waits, naming each forge with its own count, and the outage resume stands in the page title', () => {
    const [attention] = OUTAGE_ENDINGS_SCREENS;
    if (attention === undefined) throw new Error('An outage screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    const [outageRow = MarkupTree.parse('')] = MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-attention-row'));
    expect(MarkupTree.textOf(outageRow)).toContain('3 agents stopped on a network outage');
    expect(MarkupTree.textOf(outageRow)).toContain('Example Storefront 2 · Invoice Service 1');
    expect(MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withRole('button', 'Resume agents stopped by an outage'))).toHaveLength(1);
  });

  test('A4: each forge holding such agents says its own count under its row', () => {
    const forges = OUTAGE_ENDINGS_SCREENS[1];
    if (forges === undefined) throw new Error('An outage screen is missing.');
    expect(textsOfClass(screenMarkupOf(forges, 'dark'), 'gaia-forges-row-outage')).toEqual([
      '2 agents stopped on a network outage',
      '1 agent stopped on a network outage',
    ]);
  });
});

describe('a crashed forge in place, which no artboard draws', () => {
  test('off after its crash: the alert with the registry\'s crash summary and Start, and no board read', () => {
    const [crashed] = CRASHED_FORGE_SCREENS;
    if (crashed === undefined) throw new Error('A crashed forge\'s screen is missing.');
    const markup = screenMarkupOf(crashed, 'dark');
    expect(markup).toContain('Forge crashed');
    expect(markup).toContain('hephaestus · TypeError: Cannot read properties of undefined');
    expect(MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withRole('button', 'Start'))).toHaveLength(1);
    expect(markup).not.toContain('How long should a password reset link stay valid?');
  });

  test('started again: its crash log open in place of Show log, with the error, the jobs active then and the tail of its log', () => {
    const started = CRASHED_FORGE_SCREENS[1];
    if (started === undefined) throw new Error('A crashed forge\'s screen is missing.');
    const markup = screenMarkupOf(started, 'dark');
    expect(markup).toContain('Crash log 1');
    expect(markup).toContain('Hephaestus crashed in pass 412: TypeError.');
    expect(MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withRole('button', 'Show log'))).toEqual([]);
  });
});

describe('the warnings of monitor contract 2, over the artboard that shows each', () => {
  test('A1: a failed restart is Invoice Service\'s error look, in the forge\'s own sentence with Open, before the two looks A1 draws', () => {
    const [attention] = MONITOR_WARNING_SCREENS;
    if (attention === undefined) throw new Error('A monitor warning screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    expect(attentionRowIdsOf(markup)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const looks = MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-attention-look'));
    expect(looks).toHaveLength(3);
    const [restartLook = MarkupTree.parse('')] = looks;
    expect(elementsLabelled(restartLook, 'Invoice Service: Restart failed.')).toHaveLength(1);
    expect(MarkupTree.textOf(restartLook)).toContain(RESTART_FAILED_SENTENCE);
    expect(MarkupTree.elementsIn(restartLook, MarkupTree.withRole('link', 'Open'))).toHaveLength(1);
  });

  test('A4: an Assistant that cannot come up is a notice under Research Wiki\'s row, in Gaia\'s words', () => {
    const forges = MONITOR_WARNING_SCREENS[1];
    if (forges === undefined) throw new Error('A monitor warning screen is missing.');
    const markup = screenMarkupOf(forges, 'dark');
    expect(textsOfClass(markup, 'gaia-forges-row-notice')).toEqual([ASSISTANT_DOWN_SENTENCE]);
  });

  test('A3: the usage line names when the current window resets, under the limit', () => {
    const activity = ARTBOARD_SCREENS.find((screen) => screen.artboard === 'A3');
    if (activity === undefined) throw new Error('No screen paints artboard A3.');
    const markup = screenMarkupOf(activity, 'dark');
    expect(textsOfClass(markup, 'gaia-activity-usage-line')).toEqual(['under its limit · window resets 16:00']);
    const usageLine = MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-activity-usage-line'));
    expect(usageLine.source).toEndWith(`window resets ${MarkupTree.drawnMarkupOf(createElement(Stamp, { shortText: '16:00' }))}</p>`);
  });
});

describe('C3, the launcher\'s splash, opened as the file it is', () => {
  const splashText = readFileSync(SPLASH_PAGE_PATH, 'utf8');

  test('is shown at both steps C3 draws, in both themes, at C3\'s size, from its own artboard source', () => {
    expect(SPLASH_SCREENS.map((screen) => [screen.artboard, screen.designFile, screen.step])).toEqual([
      ['C3', 'Splash.dc.html', 'starting'],
      ['C3', 'Splash.dc.html', 'opening'],
    ]);
    expect(SPLASH_SIZE_PIXELS).toEqual({ width: 900, height: 560 });
    const addresses = SPLASH_SCREENS.flatMap((screen) => SCREEN_THEMES.map((theme) => new URL(splashScreenAddressOf(screen, theme))));
    expect(addresses.map((address) => [address.protocol, address.searchParams.get('theme'), address.hash])).toEqual([
      ['file:', 'light', '#step=starting'],
      ['file:', 'dark', '#step=starting'],
      ['file:', 'light', '#step=opening'],
      ['file:', 'dark', '#step=opening'],
    ]);
  });

  test('draws the very mark the page draws, at the splash\'s size', () => {
    expect(splashText).toContain(renderToStaticMarkup(createElement(GaiaMark, { sizePixels: SPLASH_MARK_SIZE_PIXELS })));
  });

  test('paints the mark with the page\'s own rules for it, since a file page links no gaia.css', () => {
    const markRules = (STYLESHEETS[1] ?? '').split('\n').filter((line) => line.startsWith('.gaia-mark'));
    expect(markRules.length).toBeGreaterThan(0);
    for (const markRule of markRules) expect(splashText).toContain(markRule);
  });
});

/** What each documents artboard shows that no other does, in the words the page draws. */
const TICKET_DOCUMENT_SCREEN_STATES: Readonly<Record<number, readonly string[]>> = {
  1: ['Reading package.json for C2', 'Approve spec · start Plan', 'Plan · after spec'],
  2: ['C3 · § 2 Outcome · line 11 · Preview', 'The agent gets the quote, its section and lines 9–13.'],
  3: ['C3 · lines 17–23 · Code', '§ 3 Behaviour › mermaid block Theme flow'],
  4: ['Spec agent proposes · line 29 only', 'Waiting on you · 1 edit to review', 'spec · v4 · 1 edit proposed'],
  5: ['Replying to C3 · started on v5', 'Queue ⌘↵', 'Queued for the agent', 'spec · v6 · editing'],
  6: ['C3 · § 3 Behaviour · line 20 · Preview', 'The agent gets the node, its section and lines 18–22.'],
  7: ['What the plan names', 'Unresolved · 2', 'Approve plan · start build', 'Waiting on you · 2 unresolved places'],
  8: ['Approve plan again · start build', 'then Build · held', 'The spec changed after this plan was approved', 'Plan agent proposes, for spec v6'],
};

describe('the ticket document screens', () => {
  test('artboards 1 to 8 are each painted once', () => {
    expect(TICKET_DOCUMENT_SCREENS.map((screen) => screen.artboard)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('each screen shows the state its artboard draws', () => {
    for (const screen of TICKET_DOCUMENT_SCREENS) {
      const text = MarkupTree.textOf(MarkupTree.parse(ticketDocumentScreenMarkupOf(screen)));
      for (const shown of TICKET_DOCUMENT_SCREEN_STATES[screen.artboard] ?? []) expect([screen.artboard, text.includes(shown)]).toEqual([screen.artboard, true]);
    }
  });

  test('a screen holds no colour of its own, and its document names its theme and links the documents\' stylesheet', () => {
    for (const screen of TICKET_DOCUMENT_SCREENS) {
      for (const inlineStyle of inlineStylesOf(ticketDocumentScreenMarkupOf(screen))) expect(inlineStyle).not.toMatch(COLOUR_VALUE);
      for (const theme of SCREEN_THEMES) {
        const screenDocument = ticketDocumentScreenDocumentOf(screen, theme);
        expect([screenDocument.includes(`<html lang="en" data-theme="${theme}">`), screenDocument.includes('.board-document-page')]).toEqual([true, true]);
      }
    }
  });
});

/** What each pipeline documents artboard shows, in the words the page draws: 9 the Ticket phase open, 10 the reviewer's documents. */
const PIPELINE_DOCUMENT_SCREEN_STATES: Readonly<Record<string, readonly string[]>> = {
  9:  ['Phase 1 of 4', 'How a ticket is written', 'Human spec review', 'plan.md', 'An approved plan'],
  10: ['Phase 3 of 4', 'Pipeline documents', 'Reads the spec and the plan, always.', 'Reset to default'],
};

describe('the pipeline document screens', () => {
  test('artboards 9 and 10 are each painted once', () => {
    expect(PIPELINE_DOCUMENT_SCREENS.map((screen) => screen.artboard)).toEqual(['9', '10']);
  });

  test('each screen shows the phase and the state its artboard draws', () => {
    for (const screen of PIPELINE_DOCUMENT_SCREENS) {
      const text = MarkupTree.textOf(MarkupTree.parse(pipelineDocumentScreenMarkupOf(screen, 'light')));
      for (const shown of PIPELINE_DOCUMENT_SCREEN_STATES[screen.artboard] ?? []) expect([screen.artboard, text.includes(shown)]).toEqual([screen.artboard, true]);
    }
  });

  test('a screen holds no colour of its own, its document names its theme, and only artboard 10 opens a dialog', () => {
    for (const screen of PIPELINE_DOCUMENT_SCREENS) {
      for (const theme of SCREEN_THEMES) {
        for (const inlineStyle of inlineStylesOf(pipelineDocumentScreenMarkupOf(screen, theme))) expect(inlineStyle).not.toMatch(COLOUR_VALUE);
        const screenDocument = pipelineDocumentScreenDocumentOf(screen, theme);
        expect([screen.artboard, screenDocument.includes(`<html lang="en" data-theme="${theme}">`), screenDocument.includes('showModal()')])
          .toEqual([screen.artboard, true, screen.artboard === '10']);
      }
    }
  });
});
