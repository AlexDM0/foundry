/**
 * A forge-level condition as a card: a title line with the forge's dot, its name and a micro-caps word, one sentence, one mono line, and
 * its actions at the end. Warn and error take their tones; neutral is a dashed card on the sunken ground, for what is only incomplete.
 */
import type { ReactNode } from 'react';

export type CalloutTone = 'warn' | 'error' | 'neutral';

export interface CalloutProps {
  readonly tone:         CalloutTone;
  /** The forge's condition dot; the word beside it carries the meaning. */
  readonly dot:          ReactNode;
  readonly title:        string;
  readonly word:         string;
  readonly sentence:     string;
  readonly machineLine?: string;
  readonly actions?:     ReactNode;
}

export function Callout({
  tone, dot, title, word, sentence, machineLine, actions
}: CalloutProps) {
  return (
    <section className="gaia-callout" data-tone={tone} aria-label={`${title}: ${word}`}>
      <div className="gaia-callout-body">
        <div className="gaia-callout-title">
          {dot}
          <span className="gaia-callout-name">{title}</span>
          <span className="gaia-callout-word">{word}</span>
        </div>
        <p className="gaia-callout-sentence">{sentence}</p>
        {machineLine === undefined ? null : <p className="gaia-callout-machine-line">{machineLine}</p>}
      </div>
      {actions === undefined ? null : <div className="gaia-callout-actions">{actions}</div>}
    </section>
  );
}
