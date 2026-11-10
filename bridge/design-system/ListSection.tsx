/**
 * A section of a view: its head (a small-capitals title, an optional count apart at its end, then whatever the caller adds), then either
 * its list of items or, with none, its empty card in the section's own words.
 */
import { Fragment, type ReactNode } from 'react';

export interface SectionHeadProps {
  readonly title:     string;
  /** Shown apart, muted at the head's end; left out where a section counts nothing. */
  readonly count?:    number;
  readonly children?: ReactNode;
}

export function SectionHead({ title, count, children }: SectionHeadProps) {
  return (
    <div className="bridge-section-head">
      <h2 className="bridge-section-title">{title}</h2>
      {count === undefined ? null : <span className="bridge-section-count">{count}</span>}
      {children}
    </div>
  );
}

export interface EmptyStateProps {
  readonly text:      string;
  /** An action after the text, such as a link to where the work is. */
  readonly children?: ReactNode;
}

export function EmptyState({ text, children }: EmptyStateProps) {
  return (
    <p className="bridge-empty">
      {text}
      {children}
    </p>
  );
}

export interface ListSectionProps<Item> {
  /** The section's accessible name. */
  readonly label:      string;
  readonly title:      string;
  readonly count?:     number;
  /** What the head holds after its title and count. */
  readonly headEnd?:   ReactNode;
  readonly emptyText:  string;
  readonly items:      readonly Item[];
  readonly keyOf:      (item: Item, position: number) => string;
  /** Each item renders its own `li`. */
  readonly renderItem: (item: Item) => ReactNode;
  readonly listLabel?: string;
}

export function ListSection<Item>({
  label, title, count, headEnd, emptyText, items, keyOf, renderItem, listLabel
}: ListSectionProps<Item>) {
  return (
    <section className="bridge-section" aria-label={label}>
      <SectionHead title={title} {...(count === undefined ? {} : { count })}>{headEnd}</SectionHead>
      {items.length === 0
        ? <EmptyState text={emptyText} />
        : (
          <ul className="bridge-list" aria-label={listLabel}>
            {items.map((item, position) => <Fragment key={keyOf(item, position)}>{renderItem(item)}</Fragment>)}
          </ul>
        )}
    </section>
  );
}
