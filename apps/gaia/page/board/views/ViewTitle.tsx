/**
 * The title row a board view opens with: the view's name in the display role, as the page's `h2`, and one sentence under it in the lead
 * role, muted. The space under the row is the view's own.
 */
import { Text }           from 'design-system/Text';
import { View }           from 'design-system/View';
import type { ReactNode } from 'react';

export interface ViewTitleProps {
  readonly title: string;
  /** The one sentence under the title; it may hold markup, such as a count read out as it changes. */
  readonly lead:  ReactNode;
}

export function ViewTitle({ title, lead }: ViewTitleProps) {
  return (
    <View gap="two">
      <Text typeRole="display" element="h2">{title}</Text>
      <Text typeRole="lead" muted element="p">{lead}</Text>
    </View>
  );
}
