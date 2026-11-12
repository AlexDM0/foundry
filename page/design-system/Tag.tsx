/** An 18 px flag on an agent: the warn tone for a quiet agent, the attention tone for one that asks User. */
export type TagTone = 'warn' | 'attention';

export interface TagProps {
  readonly text: string;
  readonly tone: TagTone;
}

export function Tag({ text, tone }: TagProps) {
  return <span className="gaia-tag" data-tone={tone}>{text}</span>;
}
