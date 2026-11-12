/** The kind of an attention row as a 20 px pill: the attention tone for what waits on User, the error tone for what escalated. */
export type PillTone = 'attention' | 'error';

export interface PillProps {
  readonly text: string;
  readonly tone: PillTone;
}

export function Pill({ text, tone }: PillProps) {
  return <span className="gaia-pill" data-tone={tone}>{text}</span>;
}
