/**
 * A section of a view: its head (a small-capitals title, an optional count apart at its end, then whatever the caller adds), then either
 * its list of items or, with none, its empty card in the section's own words.
 */
import { Fragment, type ReactNode } from 'react';

import { EmptyState }       from '../atoms/EmptyState.tsx';
import type { TextElement } from '../atoms/Text.tsx';
import { SectionHead }      from '../molecules/SectionHead.tsx';

export interface ListSectionProps<Item> {
  /** The section's accessible name. */
  readonly label:         string;
  readonly title:         string;
  /** The title's heading level, chosen by the screen; an `h2` by default. */
  readonly titleElement?: TextElement;
  readonly count?:        number;
  /** What the head holds after its title and count. */
  readonly headEnd?:      ReactNode;
  readonly emptyText:     string;
  readonly items:         readonly Item[];
  readonly keyOf:         (item: Item, position: number) => string;
  /** Each item renders its own `li`. */
  readonly renderItem:    (item: Item) => ReactNode;
  readonly listLabel?:    string;
}

export function ListSection<Item>({
  label, title, titleElement, count, headEnd, emptyText, items, keyOf, renderItem, listLabel
}: ListSectionProps<Item>) {
  return (
    <section className="design-system-section" aria-label={label}>
      <SectionHead title={title} {...(titleElement === undefined ? {} : { titleElement })} {...(count === undefined ? {} : { count })}>
        {headEnd}
      </SectionHead>
      {items.length === 0
        ? <EmptyState text={emptyText} />
        : (
          <ul className="design-system-list" aria-label={listLabel}>
            {items.map((item, position) => <Fragment key={keyOf(item, position)}>{renderItem(item)}</Fragment>)}
          </ul>
        )}
    </section>
  );
}
