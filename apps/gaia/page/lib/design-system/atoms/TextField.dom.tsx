/**
 * The text field, in a happy-dom document. What matters: the field is named by its label, also when the label is hidden; typing hands the
 * new value to onChange; the mono face is a `data-*` attribute; and a disabled field is disabled.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TextField } from './TextField.tsx';

afterEach(() => {
  cleanup();
});

describe('the text field', () => {
  test('its label names it, and typing hands the new value to onChange', () => {
    const values: string[] = [];
    render(<TextField label="Folder" value="" onChange={(value) => values.push(value)} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Folder' }), { target: { value: '/example/folder' } });
    expect(values).toEqual(['/example/folder']);
  });

  test('a hidden label still names the field, and only the hidden label is marked', () => {
    render(<TextField label="Project name" value="Example" onChange={() => undefined} labelHidden />);
    const field = screen.getByRole('textbox', { name: 'Project name' });
    expect([field.getAttribute('value'), screen.getByText('Project name').hasAttribute('data-hidden')]).toEqual(['Example', true]);
  });

  test('the mono face and a disabled field are marked, and the interface face is the default', () => {
    render(
      <>
        <TextField label="Path" value="" onChange={() => undefined} mono disabled placeholder="/example" />
        <TextField label="Name" value="" onChange={() => undefined} />
      </>,
    );
    const path = screen.getByRole('textbox', { name: 'Path' });
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect([path.hasAttribute('data-mono'), (path as HTMLInputElement).disabled, path.getAttribute('placeholder')]).toEqual([true, true, '/example']);
    expect([name.hasAttribute('data-mono'), (name as HTMLInputElement).disabled]).toEqual([false, false]);
  });
});
