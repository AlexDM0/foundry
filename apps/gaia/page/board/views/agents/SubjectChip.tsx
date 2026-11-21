/** What a job works on as a bordered link chip: a ticket's mono id and title, or an intake's request, ellipsised with its whole text on hover. */
import { MonoId } from '../../../lib/design-system/DesignSystemInterface.ts';

export interface SubjectChipProps {
  readonly href:   string;
  /** A ticket's id; an intake's request has none. */
  readonly idText: string | null;
  /** `null` for a ticket the board does not list: the id shows alone. */
  readonly text:   string | null;
}

export function SubjectChip({ href, idText, text }: SubjectChipProps) {
  return (
    <a className="agents-subject" href={href} title={text ?? undefined}>
      {idText === null ? null : <MonoId text={idText} tone="muted" weight="medium" />}
      {text === null ? null : <span className="agents-subject-text">{text}</span>}
    </a>
  );
}
