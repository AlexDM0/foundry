/**
 * The visual pass's screens (W7.3): each artboard the page builds, painted from its fixture as the page paints it, as a whole document a
 * browser opens at 1440 x 1016 to compare by eye with the artboard. What matters: no artboard is left out; both themes are the same markup
 * and differ only in the theme the root names and the theme button shows (B1 has no theme button), so a theme is the tokens' work alone; a screen
 * holds no colour of its own; and each screen shows the state its artboard draws, since a pass that compares an artboard with another state
 * compares nothing. C2 is its "What notifies" checklist, opened over Forges as the page opens it (the notifications wait for W5.6), and C3
 * is the launcher's own splash file, opened at both its steps and drawing the page's own mark. The restart an update left pending, which no
 * artboard draws, is painted over A1 and A4, the two artboards whose Update forge can leave it, under the same checks; so are the two
 * warnings of monitor contract 2, a failed Baton pass as A1's look and an Assistant that cannot come up as a notice on A4, and B4's second
 * state, the forge program found. B1 is painted in each of the five states of its `brain` tweak, each showing exactly its own parts of
 * Flint's brain between Stop and Open in new tab.
 *
 * The by-eye pass itself is not a spec: it writes `screenDocumentOf` for each screen and theme to a scratch folder, opens each at the
 * artboard's size in Chrome or Chromium, and compares the picture with the artboard; the splash opens at `splashScreenAddressOf`. A screen
 * leaves motion off, so none of Gaia's own motion runs; the browser is opened with reduced motion forced (`--force-prefers-reduced-motion`),
 * since the package's own pulse and dialog entry run whether or not motion is ready, and a shot must not land mid-way.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import { Banner }                 from 'design-system/Banner';
import { Button }                 from 'design-system/Button';
import { SlotMeter }              from 'design-system/SlotMeter';
import { Stamp }                  from 'design-system/Stamp';
import { Tag }                    from 'design-system/Tag';
import { Text }                   from 'design-system/Text';
import { DataTable }              from 'design-system-contributions/DataTable';
import { createElement }          from 'react';
import { renderToStaticMarkup }   from 'react-dom/server';

import { GaiaMark }       from './design-system/GaiaMark.tsx';
import {
  ARTBOARD_SCREENS,
  ARTBOARD_SIZE_PIXELS,
  ASSISTANT_DOWN_SENTENCE,
  type ArtboardScreen,
  B2_STOP_REFUSAL,
  BRAIN_SCREENS,
  BRAIN_STATE_SCREENS,
  BATON_PASS_FAILED_SENTENCE,
  FORGE_PROGRAM_FOUND_SCREENS,
  HIDDEN_FORGE_SCREENS,
  MONITOR_WARNING_SCREENS,
  type PageArtboard,
  RESTART_PENDING_SCREENS,
  screenDocumentOf,
  SCREEN_THEMES,
  screenMarkupOf,
  SPLASH_MARK_SIZE_PIXELS,
  SPLASH_PAGE_PATH,
  SPLASH_SCREENS,
  SPLASH_SIZE_PIXELS,
  splashScreenAddressOf,
  WHAT_NOTIFIES_SCREENS,
  whatNotifiesDocumentOf,
  whatNotifiesMarkupOf,
} from './testing/ArtboardScreens.tsx';
import { DesignSystemStylesheet }         from './testing/DesignSystemStylesheet.ts';
import { type MarkupElement, MarkupTree } from './testing/MarkupTree.ts';
import { PackageStylesheet }              from './testing/PackageStylesheet.ts';

const STYLESHEETS = ['tokens.css', 'gaia.css'].map((fileName) => readFileSync(join(import.meta.dir, 'styles', fileName), 'utf8'));

/** A colour written as a value: what only tokens.css may hold. */
const COLOUR_VALUE = /oklch\(|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b|\bcolor:/i;

/** Every screen painted from the page: each artboard, and each state the owner added over one. */
const PAINTED_OVER_ARTBOARDS: readonly ArtboardScreen[] = [
  ...ARTBOARD_SCREENS,
  ...BRAIN_SCREENS,
  ...BRAIN_STATE_SCREENS,
  ...RESTART_PENDING_SCREENS,
  ...MONITOR_WARNING_SCREENS,
  ...HIDDEN_FORGE_SCREENS,
  ...FORGE_PROGRAM_FOUND_SCREENS,
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
    const packageStylesheets = [DesignSystemStylesheet.fontFaceRules(), DesignSystemStylesheet.text(), PackageStylesheet.inlinedText('brand/brand.css')];
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

  test('B1, whose route has no theme button, paints the very same markup in both themes, in every state of its brain', () => {
    for (const forgeInPlace of [screenOf('B1'), ...BRAIN_STATE_SCREENS]) expect(screenMarkupOf(forgeInPlace, 'dark')).toBe(screenMarkupOf(forgeInPlace, 'light'));
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

  test('A2: the Agents table holds its ten agents and the brain under their four forges with J4 of Example Storefront selected, as its job tweak draws', () => {
    const markup = screenMarkupOf(screenOf('A2'), 'dark');
    const tree = MarkupTree.parse(markup);
    const agentRows = MarkupTree.elementsIn(tree, (element) => MarkupTree.withClass('gaia-agents-row')(element) && MarkupTree.withRole('row')(element));
    expect(agentRows.filter((row) => row.attributes['data-head'] === undefined)).toHaveLength(11);
    const wakeLabels = elementsLabelled(tree, /^Wake Flint's brain on /).map((element) => element.attributes['aria-label']);
    expect(wakeLabels).toEqual(['Wake Flint\'s brain on Invoice Service', 'Wake Flint\'s brain on Research Wiki']);
    expect(MarkupTree.elementsIn(tree, (element) => MarkupTree.withClass('gaia-agents-group')(element) && MarkupTree.withRole('rowgroup')(element))).toHaveLength(4);
    const selectedRow = selectedOf(markup);
    expect(MarkupTree.roleOf(selectedRow)).toBe('row');
    expect(elementsLabelled(selectedRow, 'Example Storefront, J4')).toHaveLength(1);
    expect(elementsReading(selectedRow, 'J4').length).toBeGreaterThan(0);
    expect(markup).toContain('Open J4 in its forge');
  });

  test('A2 with the brain selected: its row marked, its panel beside the table with Stop, both themes from its own artboard source', () => {
    expect(BRAIN_SCREENS.map((screen) => [screen.artboard, screen.designFile])).toEqual([['A2', 'AgentsBrain.dc.html']]);
    const [brainScreen] = BRAIN_SCREENS;
    if (brainScreen === undefined) throw new Error('No screen paints A2 with the brain selected.');
    const markup = screenMarkupOf(brainScreen, 'dark');
    const selectedRow = selectedOf(markup);
    expect(MarkupTree.roleOf(selectedRow)).toBe('row');
    expect(elementsLabelled(selectedRow, 'Example Storefront, Flint\'s brain')).toHaveLength(1);
    const tree = MarkupTree.parse(markup);
    expect(elementsReading(tree, 'Last moves it chose').length).toBeGreaterThan(0);
    expect(elementsLabelled(tree, 'Stop Flint\'s brain on Example Storefront')).toHaveLength(2);
  });

  test('A3 and A4: Activity and Forges each open under their own title', () => {
    expect(pageTitleOf(screenMarkupOf(screenOf('A3'), 'dark'))).toEqual(['Activity']);
    expect(pageTitleOf(screenMarkupOf(screenOf('A4'), 'dark'))).toEqual(['Forges']);
  });

  test('B1: Example Storefront in place, its bar over the frame area that opens the Bridge, no page title and no theme button', () => {
    const markup = screenMarkupOf(screenOf('B1'), 'dark');
    expect(textsOfClass(markup, 'gaia-forge-frame-bar-name')).toEqual(['Example Storefront']);
    expect(textsOfClass(markup, 'gaia-forge-frame-opening')).toEqual(['Opening Example Storefront.']);
    const figure = (text: string) => MarkupTree.drawnMarkupOf(createElement(Text, { typeRole: 'small', mono: true, children: text }));
    const line = `${figure('4 / 5')} agents · ${figure('2')} wait on you`;
    expect(markup).toContain(`<span class="gaia-forge-frame-bar-line" title="4 / 5 agents · 2 wait on you · since 09:12">${line}</span>`);
    const openInNewTab = MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withRole('button', 'Open in new tab'));
    const glyph = MarkupTree.onlyElementIn(openInNewTab, MarkupTree.withClass('gaia-open-in-new-tab-glyph'));
    expect(openInNewTab.source.indexOf(glyph.source)).toBeLessThan(openInNewTab.source.lastIndexOf('Open in new tab'));
    expect(pageTitleOf(markup)).toEqual([]);
    expect(themeButtonsOf(markup)).toEqual([]);
  });

  test('B2: the Stop dialog under Example Storefront, the refusal under Example Mobile App, and Design System starting', () => {
    const markup = screenMarkupOf(screenOf('B2'), 'dark');
    expect(textsOfClass(markup, 'gaia-confirm-question')).toEqual(['Stop the Overseer of Example Storefront? 4 agents are running.']);
    const tree = MarkupTree.parse(markup);
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
    expect(MarkupTree.textOf(lead)).toBe('Overseer unreachable: Invoice Service.');
    const errorTone = MarkupTree.variantAttributesOf(createElement(Banner, { tone: 'quiet', text: '' }), createElement(Banner, { tone: 'error', text: '' }));
    const banner = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.carries(element, errorTone) && MarkupTree.elementsIn(element).includes(lead));
    expect(MarkupTree.textOf(banner)).toStartWith('Overseer unreachable: Invoice Service.');
    const waitingHead = MarkupTree.onlyElementIn(tree, (element) => MarkupTree.withRole('heading')(element) && MarkupTree.textOf(element).startsWith('Waiting on you'));
    const countTag = createElement(Tag, { key: 'count', text: '4 known, more possible', tone: 'warn' });
    const separator = createElement('span', { key: 'separator', className: 'gaia-visually-hidden' }, ' · ');
    expect(waitingHead.source).toBe(MarkupTree.drawnMarkupOf(createElement(Text, { typeRole: 'page', element: 'h2', children: ['Waiting on you', separator, countTag] })));
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

describe('B1 in each state of its brain tweak', () => {
  function barControlsOf(markup: string): MarkupElement {
    return MarkupTree.onlyElementIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-forge-frame-bar-controls'));
  }

  function buttonLabelsOf(controls: MarkupElement): string[] {
    return MarkupTree.elementsIn(controls, MarkupTree.withRole('button')).map(MarkupTree.textOf);
  }

  test('paints the five states in the tweak\'s order, off being the artboard\'s own, each from B1\'s source in both themes', () => {
    expect(BRAIN_STATE_SCREENS.map((screen) => [screen.artboard, screen.designFile, screen.brainState])).toEqual([
      ['B1', 'Forge.dc.html', 'off'],
      ['B1', 'Forge.dc.html', 'starting'],
      ['B1', 'Forge.dc.html', 'running'],
      ['B1', 'Forge.dc.html', 'refused'],
      ['B1', 'Forge.dc.html', 'ended'],
    ]);
    expect(screenMarkupOf(screenOf('B1'), 'dark')).toBe(screenMarkupOf(BRAIN_STATE_SCREENS[0] ?? screenOf('B1'), 'dark'));
  });

  test('each state shows its own parts of the brain between Stop and Open in new tab, and nothing of another', () => {
    const barByState = BRAIN_STATE_SCREENS.map((screen) => {
      const controls = barControlsOf(screenMarkupOf(screen, 'dark'));
      const groups = MarkupTree.elementsIn(controls, MarkupTree.withClass('gaia-brain-chip-group'));
      return [screen.brainState, groups[0]?.attributes['data-state'] ?? null, buttonLabelsOf(controls)];
    });
    expect(barByState).toEqual([
      ['off', 'off', ['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']],
      ['starting', 'starting', ['Pause', 'Stop', 'Open in new tab']],
      ['running', 'running', ['Pause', 'Stop', 'Stop', 'Open in new tab']],
      ['refused', 'refused', ['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']],
      ['ended', 'ended', ['Pause', 'Stop', 'Open in new tab']],
    ]);
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
    expect(MarkupTree.textOf(pendingStep)).toStartWith('Updated; restart pending. Its Overseer runs the old code until it restarts.');
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

describe('the warnings of monitor contract 2, over the artboard that shows each', () => {
  test('A1: a failed Baton pass is Invoice Service\'s error look, in the forge\'s own sentence with Open, before the two looks A1 draws', () => {
    const [attention] = MONITOR_WARNING_SCREENS;
    if (attention === undefined) throw new Error('A monitor warning screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    expect(attentionRowIdsOf(markup)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const looks = MarkupTree.elementsIn(MarkupTree.parse(markup), MarkupTree.withClass('gaia-attention-look'));
    expect(looks).toHaveLength(3);
    const [batonLook = MarkupTree.parse('')] = looks;
    expect(elementsLabelled(batonLook, 'Invoice Service: Baton pass failed.')).toHaveLength(1);
    expect(MarkupTree.textOf(batonLook)).toContain(BATON_PASS_FAILED_SENTENCE);
    expect(MarkupTree.elementsIn(batonLook, MarkupTree.withRole('link', 'Open'))).toHaveLength(1);
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
