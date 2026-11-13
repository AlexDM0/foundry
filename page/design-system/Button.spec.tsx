/**
 * The button. What matters: a press reaches onPress; primary is a data attribute on the one class; with an href the button is a link,
 * but a disabled one is a disabled button, since a link cannot be disabled; an icon-only button keeps its label as its accessible name
 * and tooltip; the "Open in new tab" arrow is drawn and hidden, and follows the label as the artboard draws it; the dismiss sign is a
 * character, also hidden.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { Button }           from './Button.tsx';

describe('the button', () => {
  test('a plain button is a button of type button that calls onPress', () => {
    const presses: string[] = [];
    const unfolded = ReactElementTree.unfolded(<Button label="Look again" onPress={() => presses.push('pressed')} />);
    const button = ReactElementTree.onlyWithClass(unfolded, 'gaia-button');
    ReactElementTree.dispatch(button, 'onClick');
    expect([button.tag, button.props['type'], button.props['data-emphasis'], button.props['disabled']]).toEqual(['button', 'button', 'plain', false]);
    expect([presses, ReactElementTree.textOf(unfolded)]).toEqual([['pressed'], 'Look again']);
  });

  test('primary is carried as data-emphasis and has a rule of its own', () => {
    const button = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Button label="Start forge" emphasis="primary" />), 'gaia-button');
    expect(button.props['data-emphasis']).toBe('primary');
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-button', 'data-emphasis', 'primary')).toBe(true);
  });

  test('with an href it is a link to that route, and no button', () => {
    const unfolded = ReactElementTree.unfolded(<Button label="Open" href="#forge/example-storefront" />);
    const link = ReactElementTree.onlyWithClass(unfolded, 'gaia-button');
    expect([link.tag, link.props['href']]).toEqual(['a', '#forge/example-storefront']);
  });

  test('a disabled button with an href is a disabled button, since a link cannot be disabled', () => {
    const button = ReactElementTree.onlyWithClass(ReactElementTree.unfolded(<Button label="Open" href="#forge/example-storefront" disabled />), 'gaia-button');
    expect([button.tag, button.props['disabled'], button.props['href']]).toEqual(['button', true, undefined]);
  });

  test('an icon-only button shows the drawn arrow, hidden, and keeps its label as its accessible name and tooltip', () => {
    const unfolded = ReactElementTree.unfolded(<Button label="Open in new tab" icon="open-in-new-tab" iconOnly onPress={() => undefined} />);
    const button = ReactElementTree.onlyWithClass(unfolded, 'gaia-button');
    const icon = ReactElementTree.onlyWithClass(unfolded, 'gaia-button-icon');
    expect([button.props['aria-label'], button.props['title'], button.props['data-icon-only']]).toEqual(['Open in new tab', 'Open in new tab', '']);
    expect([icon.tag, icon.props['aria-hidden'], ReactElementTree.textOf(unfolded)]).toEqual(['svg', 'true', '']);
  });

  test('the dismiss icon is the multiplication sign, hidden, and a button with an icon and its label shows both', () => {
    const iconOnly = ReactElementTree.unfolded(<Button label="Dismiss this refusal" icon="dismiss" iconOnly onPress={() => undefined} />);
    expect(ReactElementTree.onlyWithClass(iconOnly, 'gaia-button-icon').props['aria-hidden']).toBe('true');
    expect(ReactElementTree.textOf(iconOnly)).toBe('×');
    const withLabel = ReactElementTree.unfolded(<Button label="Open in new tab" icon="open-in-new-tab" />);
    const button = ReactElementTree.onlyWithClass(withLabel, 'gaia-button');
    expect([button.props['aria-label'], button.props['data-icon-only'], ReactElementTree.textOf(withLabel)]).toEqual([undefined, undefined, 'Open in new tab']);
  });

  test('the "Open in new tab" arrow follows its label, as artboard B1 draws it', () => {
    const markup = renderToStaticMarkup(<Button label="Open in new tab" icon="open-in-new-tab" />);
    expect(markup).toMatch(/^<button[^>]*>Open in new tab<svg class="gaia-button-icon"/);
  });

  test('iconOnly without an icon still shows its label, so no button is left without a name', () => {
    expect(ReactElementTree.textOf(ReactElementTree.unfolded(<Button label="Stop" iconOnly />))).toBe('Stop');
  });
});
