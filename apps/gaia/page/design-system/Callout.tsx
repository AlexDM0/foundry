/**
 * A forge-level condition, composed from the design-system package: a title line with the forge's dot, its name and its word, one sentence,
 * one mono line or a versions line, and the actions at the end. Warn (held) and error (unreachable) are the package's banner in its orange
 * and crimson, with the 4 px left edge; neutral, for what is only incomplete or only explains, is the package's dashed card. The section
 * is named by its title and word.
 */

import { Banner }         from 'design-system/Banner';
import { Card }           from 'design-system/Card';
import { Row }            from 'design-system/Row';
import type { ReactNode } from 'react';

export type CalloutTone = 'warn' | 'error' | 'neutral';

export interface CalloutProps {
  readonly tone:          CalloutTone;
  /** The forge's condition dot; the word beside it carries the meaning. */
  readonly dot:           ReactNode;
  readonly title:         string;
  readonly word:          string;
  /** A sentence, or a status in its place, such as a step on its way. */
  readonly sentence:      ReactNode;
  readonly machineLine?:  string;
  /** A line set in the sentence's face with its machine values in mono, in place of the machine line. */
  readonly versionsLine?: ReactNode;
  readonly actions?:      ReactNode;
}

function CalloutBody({
  tone, dot, title, word, sentence, machineLine, versionsLine
}: Omit<CalloutProps, 'actions'>) {
  return (
    <span className="gaia-callout-body" data-tone={tone}>
      <span className="gaia-callout-title">
        {dot}
        <span className="gaia-callout-name">{title}</span>
        <span className="gaia-callout-word">{word}</span>
      </span>
      <span className="gaia-callout-sentence">{sentence}</span>
      {machineLine === undefined ? null : <span className="gaia-callout-machine-line">{machineLine}</span>}
      {versionsLine ?? null}
    </span>
  );
}

function CalloutFrame({ tone, body, actions }: { readonly tone: CalloutTone; readonly body: ReactNode; readonly actions: ReactNode }) {
  if (tone === 'neutral') {
    return (
      <Card dashed paddingVertical="twelve" paddingHorizontal="sixteen">
        <Row centerY gap="sixteen">
          {body}
          {actions}
        </Row>
      </Card>
    );
  }
  return <Banner tone={tone} text={body} {...(actions === null ? {} : { action: actions })} />;
}

export function Callout({ actions, ...bodyProps }: CalloutProps) {
  const { tone, title, word } = bodyProps;
  return (
    <section className="gaia-callout" aria-label={`${title}: ${word}`}>
      <CalloutFrame tone={tone} body={<CalloutBody {...bodyProps} />} actions={actions === undefined ? null : <span className="gaia-callout-actions">{actions}</span>} />
    </section>
  );
}
