/**
 * The notice over a plan the spec moved under: who approved which plan on which spec, the spec's changed lines old and new, and the links
 * to the spec and to the plan agent's proposed update. The earlier approval stays on record; the build waits for the next.
 */
import { MicroCapsLabel }            from '../../../lib/design-system/DesignSystemInterface.ts';
import type { OutOfDateNoticeModel } from './TicketDocumentsViewModel.ts';

export interface OutOfDateNoticeProps {
  readonly notice:       OutOfDateNoticeModel;
  readonly specHref:     string;
  /** Shows the plan agent's update; `null` while it proposes none. */
  readonly onShowUpdate: (() => void) | null;
}

export function OutOfDateNotice({ notice, specHref, onShowUpdate }: OutOfDateNoticeProps) {
  return (
    <div className="board-document-notice" role="status">
      <span className="board-document-notice-title">{notice.title}</span>
      <span className="board-document-notice-sentence">{notice.sentence}</span>
      {notice.changes.map((change) => (
        <div key={change.key} className="board-document-notice-change">
          <MicroCapsLabel text={change.label} />
          <span className="board-document-removed">{change.removed}</span>
          <span className="board-document-inserted">{change.inserted}</span>
        </div>
      ))}
      <div className="board-document-notice-links">
        <a className="board-document-link" href={specHref}>Open the spec change</a>
        {onShowUpdate === null
          ? null
          : (
            <>
              <span aria-hidden="true">·</span>
              <button type="button" className="board-document-link-button" onClick={onShowUpdate}>See the proposed plan update</button>
            </>
          )}
      </div>
    </div>
  );
}
