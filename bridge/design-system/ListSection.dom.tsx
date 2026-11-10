/**
 * The list section, in a happy-dom document. What matters: an empty section shows its empty text and no list; a section of items lists one
 * entry per item, in order; the count shows only when given; what the head adds sits in the head; the section is named by its label; the
 * empty state shows an action after its text; and the words are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { EmptyState, ListSection } from './ListSection.tsx';

interface ExampleItem {
  readonly id:    string;
  readonly title: string;
}

function renderedSection(items: readonly ExampleItem[], count?: number): HTMLElement {
  render(
    <ListSection
      label="Example decisions"
      title="Open questions"
      {...(count === undefined ? {} : { count })}
      headEnd={<button type="button">Example head action</button>}
      emptyText="No question waits on User."
      items={items}
      keyOf={(item) => item.id}
      renderItem={(item) => <li>{item.title}</li>}
      listLabel="Example list"
    />,
  );
  return screen.getByRole('region', { name: 'Example decisions' });
}

afterEach(() => {
  cleanup();
});

describe('the list section', () => {
  test('an empty section shows its empty text and no list', () => {
    const section = renderedSection([]);
    expect([section.querySelector('.bridge-empty')?.textContent, section.querySelector('.bridge-list')]).toEqual(['No question waits on User.', null]);
  });

  test('a section of items lists one entry per item, in order, and shows no empty text', () => {
    const section = renderedSection([{ id: 'E1', title: 'First example' }, { id: 'E2', title: 'Second example' }]);
    expect([...section.querySelectorAll('.bridge-list > li')].map((entry) => entry.textContent)).toEqual(['First example', 'Second example']);
    expect([section.querySelector('.bridge-empty'), screen.getByRole('list', { name: 'Example list' }).className]).toEqual([null, 'bridge-list']);
  });

  test('the count shows only when given, and what the head adds sits in the head', () => {
    const counted = renderedSection([], 2);
    expect(counted.querySelector('.bridge-section-head .bridge-section-count')?.textContent).toBe('2');
    expect(counted.querySelector('.bridge-section-head button')?.textContent).toBe('Example head action');
    cleanup();
    expect(renderedSection([]).querySelector('.bridge-section-count')).toBeNull();
  });

  test('the title heads the section', () => {
    expect(renderedSection([]).querySelector('h2.bridge-section-title')?.textContent).toBe('Open questions');
  });

  test('the empty state shows an action after its text', () => {
    const { container } = render(<EmptyState text="3 jobs. "><a href="#kanban/merge-queue">Merge queue</a></EmptyState>);
    expect([container.querySelector('.bridge-empty')?.textContent, container.querySelector('.bridge-empty > a')?.getAttribute('href')]).toEqual([
      '3 jobs. Merge queue',
      '#kanban/merge-queue',
    ]);
  });

  test('the words are text, never markup', () => {
    render(
      <ListSection
        label="<b>planted</b>"
        title="<b>planted</b>"
        emptyText="<b>planted</b>"
        items={[]}
        keyOf={() => 'never'}
        renderItem={() => null}
      />,
    );
    const section = screen.getByRole('region', { name: '<b>planted</b>' });
    expect([section.querySelector('b'), section.querySelector('.bridge-section-title')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
