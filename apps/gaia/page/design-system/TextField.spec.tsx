/**
 * The text field. What matters: the input sits inside its label, so the label names it even when hidden; a change hands on the new value;
 * the face is marked; disabled reaches the input.
 */
import { describe, expect, test } from 'bun:test';

import { GaiaStylesheet }   from '../testing/GaiaStylesheet.ts';
import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { TextField }        from './TextField.tsx';

describe('the text field', () => {
  test('the input sits inside its label, in the UI face by default, and a change hands on the new value', () => {
    const values: string[] = [];
    const unfolded = ReactElementTree.unfolded(<TextField label="Project name" value="Example Storefront" onChange={(value) => values.push(value)} />);
    const label = ReactElementTree.onlyWithClass(unfolded, 'gaia-text-field');
    const input = ReactElementTree.onlyWithTag([label], 'input');
    expect([label.tag, input.props['type'], input.props['value'], input.props['data-face'], input.props['disabled']]).toEqual(['label', 'text', 'Example Storefront', 'ui', false]);
    expect(ReactElementTree.textOf(unfolded)).toBe('Project name');
    ReactElementTree.dispatch(input, 'onChange', { currentTarget: { value: 'Example Shop' } });
    expect(values).toEqual(['Example Shop']);
  });

  test('a hidden label still names the field, a path takes the mono face, and disabled reaches the input', () => {
    const unfolded = ReactElementTree.unfolded(
      <TextField label="Repository folder" value="~/development/example-storefront" onChange={() => undefined} face="mono" labelHidden disabled />,
    );
    const labelText = ReactElementTree.onlyWithClass(unfolded, 'gaia-text-field-label');
    const input = ReactElementTree.onlyWithTag(unfolded, 'input');
    expect([labelText.props['data-hidden'], ReactElementTree.textOf([labelText]), input.props['data-face'], input.props['disabled']])
      .toEqual(['', 'Repository folder', 'mono', true]);
    expect(GaiaStylesheet.stylesVariant(GaiaStylesheet.text(), 'gaia-text-field-input', 'data-face', 'mono')).toBe(true);
  });
});
