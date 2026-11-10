/**
 * Beside a session's chat: the tickets it filed, each linking to its card with its status badge; the pictures sent in the chat; and, while
 * the session is live, Close intake (`intake-close`), which offers its drafts to ready.
 */
import type { TicketDocument }                 from '../../@types/ConversationDocuments.ts';
import type { TranscriptPictureDocument }      from '../../api/TranscriptStreamClient.ts';
import { MicroCapsLabel }                      from '../../design-system/MicroCapsLabel.tsx';
import { MonoId }                              from '../../design-system/MonoId.tsx';
import { StateBadge }                          from '../../design-system/StateBadge.tsx';
import { CommandButton }                       from '../../shell/CommandButton.tsx';
import { DetailRoute }                         from '../../shell/DetailRoute.ts';
import { HashRouter }                          from '../../shell/HashRouter.ts';
import { IntakeModelUtil, type IntakeSession } from './IntakeModel.ts';
import { PictureAttachmentsModelUtil }         from './PictureAttachmentsModel.ts';

export interface IntakeAsideProps {
  readonly session:  IntakeSession;
  readonly pictures: readonly TranscriptPictureDocument[];
}

function DraftItem({ ticket }: { readonly ticket: TicketDocument }) {
  const pill = IntakeModelUtil.draftPillOf(ticket);
  return (
    <li className="bridge-intake-draft">
      <a
        className="bridge-intake-draft-link"
        href={HashRouter.fragmentOf({ tab: 'kanban', item: DetailRoute.itemTextOf({ form: 'ticket', ticketId: ticket.id }) })}
      >
        <MonoId text={`#${ticket.id}`} />
        <span className="bridge-intake-draft-title">{ticket.title}</span>
      </a>
      <StateBadge state={pill.state} label={pill.label} />
    </li>
  );
}

export function IntakeAside({ session, pictures }: IntakeAsideProps) {
  const caption = IntakeModelUtil.closeIntakeCaptionOf(session.drafts);
  return (
    <aside className="bridge-intake-aside" aria-label={`Drafts of ${session.jobId}`}>
      <div className="bridge-intake-aside-block">
        <MicroCapsLabel text="Drafts filed" element="h3" />
        {session.drafts.length === 0
          ? <p className="bridge-card-meta">No ticket filed yet.</p>
          : (
            <ul className="bridge-intake-drafts" aria-label={`Drafts of ${session.jobId}`}>
              {session.drafts.map((ticket) => <DraftItem key={ticket.id} ticket={ticket} />)}
            </ul>
          )}
      </div>
      {pictures.length === 0
        ? null
        : (
          <div className="bridge-intake-aside-block">
            <MicroCapsLabel text="Pictures in this chat" element="h3" />
            <ul className="bridge-intake-pictures" aria-label={`Pictures of ${session.jobId}`}>
              {pictures.map((picture) => (
                <li key={picture.pictureId}>
                  <a className="bridge-intake-picture-link" href={PictureAttachmentsModelUtil.pictureRouteOf(picture.pictureId)} target="_blank" rel="noopener">
                    {PictureAttachmentsModelUtil.pictureNameOf(picture)}
                  </a>
                  {` · ${PictureAttachmentsModelUtil.sizeWordingOf(picture.bytes)}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      {session.closed
        ? null
        : (
          <div className="bridge-intake-close">
            <div className="bridge-card-actions">
              <CommandButton label="Close intake" command={{ kind: 'intake-close', jobId: session.jobId, proposedDraftSets: [] }} />
            </div>
            {caption === null ? null : <p className="bridge-card-meta">{caption}</p>}
          </div>
        )}
    </aside>
  );
}
