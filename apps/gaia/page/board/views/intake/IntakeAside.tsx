/**
 * Beside a session's chat: the tickets it filed, each linking to its card with its status badge; the pictures sent in the chat; and, while
 * the session is live, Close intake (`intake-close`), which offers its drafts to ready.
 */

import { PAGE_CONTRACT_VERSIONS }              from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardTicketDocument }            from '../../../@types/board/BoardTicketDocuments.ts';
import type { BoardTranscriptPictureDocument } from '../../../@types/board/ConversationDocument.ts';
import { MonoId, StateBadge, Text }            from '../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf }                      from '../../shell/BoardRouteLinks.ts';
import { CommandButton }                       from '../../shell/CommandButton.tsx';
import { DetailRoute }                         from '../../shell/DetailRoute.ts';
import { StateToneUtil }                       from '../../utils/StateToneUtil.ts';
import { IntakeModelUtil, type IntakeSession } from './IntakeModel.ts';
import { usePictureAddressOf }                 from './PictureAttachments.ts';
import { PictureAttachmentsModelUtil }         from './PictureAttachmentsModel.ts';

export interface IntakeAsideProps {
  readonly session:  IntakeSession;
  readonly pictures: readonly BoardTranscriptPictureDocument[];
}

function DraftItem({ ticket }: { readonly ticket: BoardTicketDocument }) {
  const pill = IntakeModelUtil.draftPillOf(ticket);
  const hrefOf = useBoardHrefOf();
  return (
    <li className="board-intake-draft">
      <a
        className="board-intake-draft-link"
        href={hrefOf({ tab: 'kanban', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId: ticket.id }) })}
      >
        <MonoId text={`#${ticket.id}`} tone="link" />
        <span className="board-intake-draft-title">{ticket.title}</span>
      </a>
      <StateBadge {...StateToneUtil.lookOf(pill.state)} label={pill.label} size="compact" />
    </li>
  );
}

export function IntakeAside({ session, pictures }: IntakeAsideProps) {
  const caption = IntakeModelUtil.closeIntakeCaptionOf(session.drafts);
  const pictureAddressOf = usePictureAddressOf();
  return (
    <aside className="board-intake-aside" aria-label={`Drafts of ${session.jobId}`}>
      <div className="board-intake-aside-block">
        <Text typeRole="small" element="h3" subtle>Drafts filed</Text>
        {session.drafts.length === 0
          ? <p className="board-card-meta">No ticket filed yet.</p>
          : (
            <ul className="board-intake-drafts" aria-label={`Drafts of ${session.jobId}`}>
              {session.drafts.map((ticket) => <DraftItem key={ticket.id} ticket={ticket} />)}
            </ul>
          )}
      </div>
      {pictures.length === 0
        ? null
        : (
          <div className="board-intake-aside-block">
            <Text typeRole="small" element="h3" subtle>Pictures in this chat</Text>
            <ul className="board-intake-pictures" aria-label={`Pictures of ${session.jobId}`}>
              {pictures.map((picture) => (
                <li key={picture.pictureId}>
                  <a className="board-intake-picture-link" href={pictureAddressOf(picture.pictureId)} target="_blank" rel="noopener">
                    {PictureAttachmentsModelUtil.pictureNameOf(picture)}
                  </a>
                  {` · ${PictureAttachmentsModelUtil.sizeWordingOf(picture.bytes)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      {session.ended
        ? null
        : (
          <div className="board-intake-close">
            <div className="board-card-actions">
              <CommandButton label="Close intake" command={{
                boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'intake-close', jobId: session.jobId, proposedDraftSets: []
              }} />
            </div>
            {caption === null ? null : <p className="board-card-meta">{caption}</p>}
          </div>
        )}
    </aside>
  );
}
