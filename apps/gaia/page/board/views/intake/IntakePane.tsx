/**
 * A card of the Intake view, named for the screen reader: its head (the title in the page face with an optional mono mark and what sits
 * beside it, then its end at the far side) over a hairline, then its body edge to edge.
 */

import type { ReactNode }  from 'react';
import { Card, Row, Text } from '../../../lib/design-system/DesignSystemInterface.ts';

export interface IntakePaneProps {
  readonly label:        string;
  readonly title:        string;
  /** A mono id after the title, such as the session's job. */
  readonly titleMark?:   string;
  /** What follows the title, such as the count of sessions. */
  readonly besideTitle?: ReactNode;
  readonly headEnd?:     ReactNode;
  readonly children:     ReactNode;
}

export function IntakePane({
  label, title, titleMark, besideTitle, headEnd, children
}: IntakePaneProps) {
  return (
    <section className="board-intake-pane" aria-label={label}>
      <Card padding="none" divider clipped>
        <Row between centerY wrap gap="ten" paddingVertical="twelve" paddingLeft="eighteen" paddingRight="fourteen">
          <Row centerY gap="eight">
            <Text typeRole="page" element="h2">{title}</Text>
            {titleMark === undefined ? null : <Text typeRole="small" mono muted>{titleMark}</Text>}
            {besideTitle}
          </Row>
          {headEnd === undefined ? null : <Row centerY wrap gap="ten">{headEnd}</Row>}
        </Row>
        {children}
      </Card>
    </section>
  );
}
