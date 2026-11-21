/**
 * The listed file, in a happy-dom document. What matters: the name and role text read as given; the action the caller composes sits
 * before the remove button, and nothing is there without one; the remove button is named by `removeLabel` and calls `onRemove`; and a change
 * sets `data-change`, which is absent without one; ruled sets `data-ruled`.
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

import { TextButton } from '../atoms/TextButton.tsx';
import { ListedFile } from './ListedFile.tsx';

afterEach(() => {
  cleanup();
});

describe('the listed file', () => {
  test('the name and role read as given, and the remove button calls onRemove', () => {
    const onRemove = jest.fn();
    const { container } = render(<ListedFile name="writer.md" roleText="default" removeLabel="Remove writer.md" onRemove={onRemove} />);
    expect([
      container.querySelector('.design-system-listed-file-name')?.textContent,
      container.querySelector('.design-system-listed-file-role')?.textContent,
      container.querySelector('.design-system-listed-file')?.hasAttribute('data-change'),
    ]).toEqual(['writer.md', 'default', false]);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove writer.md' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('the action the caller composes sits before the remove button', () => {
    const onEdit = jest.fn();
    const { container } = render(
      <ListedFile
        name="constitution.md"
        roleText="constitution · drafted"
        action={<TextButton label="Edit" onPress={onEdit} />}
        removeLabel="Remove constitution.md"
        onRemove={jest.fn()}
      />,
    );
    const row = container.querySelector('.design-system-listed-file');
    expect([...row?.querySelectorAll('button') ?? []].map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Edit', 'Remove constitution.md']);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  test('ruled sets data-ruled, and a file without it sets none', () => {
    const { container } = render(
      <>
        <ListedFile name="a.md" roleText="brief" removeLabel="Remove a.md" onRemove={jest.fn()} ruled />
        <ListedFile name="b.md" roleText="brief" removeLabel="Remove b.md" onRemove={jest.fn()} />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-listed-file')].map((row) => row.hasAttribute('data-ruled'))).toEqual([true, false]);
  });

  test('a change sets data-change', () => {
    const { container } = render(
      <>
        <ListedFile name="a.md" roleText="changed" change="changed" removeLabel="Remove a.md" onRemove={jest.fn()} />
        <ListedFile name="b.md" roleText="new" change="new" removeLabel="Remove b.md" onRemove={jest.fn()} />
        <ListedFile name="c.md" roleText="removed" change="removed" removeLabel="Remove c.md" onRemove={jest.fn()} />
      </>,
    );
    expect([...container.querySelectorAll('.design-system-listed-file')].map((row) => row.getAttribute('data-change'))).toEqual(['changed', 'new', 'removed']);
  });
});
