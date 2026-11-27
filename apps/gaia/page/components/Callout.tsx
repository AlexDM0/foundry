/**
 * A forge-level condition built on the design system's callout: a title line with the forge's dot, name and word, one sentence, a mono or
 * versions line, and the actions. Warn (held) is the tinted warn callout, error (unreachable) the error one, and neutral, for what is only
 * incomplete or only explains, the dashed one.
 */
import type { ReactNode }            from 'react';
import { Callout as PackageCallout } from '../lib/design-system/DesignSystemInterface.ts';

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

function PackageCalloutOf({ tone, actions, children }: { readonly tone: CalloutTone; readonly actions: ReactNode; readonly children: ReactNode }) {
  const actionsProp = actions === undefined ? {} : { actions };
  if (tone === 'warn') return <PackageCallout tone="warn" tinted {...actionsProp}>{children}</PackageCallout>;
  if (tone === 'error') return <PackageCallout tone="error" {...actionsProp}>{children}</PackageCallout>;
  return <PackageCallout tone="neutral" dashed {...actionsProp}>{children}</PackageCallout>;
}

export function Callout({ actions, ...bodyProps }: CalloutProps) {
  const { tone, title, word } = bodyProps;
  return (
    <section className="gaia-callout" aria-label={`${title}: ${word}`}>
      <PackageCalloutOf tone={tone} actions={actions}>
        <CalloutBody {...bodyProps} />
      </PackageCalloutOf>
    </section>
  );
}
