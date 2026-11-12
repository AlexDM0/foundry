/**
 * The listed file, in a happy-dom document. What matters: the name and role text read as given; the open action is a link with an `href`
 * or a button that calls `onPress`, and absent without one; the remove button is named by `removeLabel` and calls `onRemove`; and a change
 * sets `data-change`, which is absent without one.
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
  jest,
  test
} from 'bun:test';

import { ListedFile } from './ListedFile.tsx';

afterEach(() => {
  cleanup();
});

describe('the listed file', () => {
  test('the name and role read as given, and the remove button calls onRemove', () => {
    const onRemove = jest.fn();
    const { container } = render(<ListedFile name="builder.md" roleText="default" removeLabel="Remove builder.md" onRemove={onRemove} />);
    expect([
      container.querySelector('.bridge-listed-file-name')?.textContent,
      container.querySelector('.bridge-listed-file-role')?.textContent,
      container.querySelector('.bridge-listed-file')?.hasAttribute('data-change'),
    ]).toEqual(['builder.md', 'default', false]);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove builder.md' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('an open action with an href is a link; with onPress it is a button that calls it', () => {
    const onEdit = jest.fn();
    render(
      <>
        <ListedFile name="builder.md" roleText="default" openAction={{ label: 'Open', href: '#pipeline/brief/builder' }} removeLabel="Remove builder.md" onRemove={jest.fn()} />
        <ListedFile
          name="constitution.md"
          roleText="constitution · drafted"
          openAction={{ label: 'Edit', onPress: onEdit }}
          removeLabel="Remove constitution.md"
          onRemove={jest.fn()}
        />
      </>,
    );
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#pipeline/brief/builder');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('a change sets data-change', () => {
    const { container } = render(
      <>
        <ListedFile name="a.md" roleText="changed" change="changed" removeLabel="Remove a.md" onRemove={jest.fn()} />
        <ListedFile name="b.md" roleText="new" change="new" removeLabel="Remove b.md" onRemove={jest.fn()} />
        <ListedFile name="c.md" roleText="removed" change="removed" removeLabel="Remove c.md" onRemove={jest.fn()} />
      </>,
    );
    expect([...container.querySelectorAll('.bridge-listed-file')].map((row) => row.getAttribute('data-change'))).toEqual(['changed', 'new', 'removed']);
  });
});
