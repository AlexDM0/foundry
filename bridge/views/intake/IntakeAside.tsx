/**
 * Beside a session's chat: the tickets it filed, each linking to its card with its status badge; the pictures sent in the chat; and, while
 * the session is live, Close intake (`intake-close`), which offers its drafts to ready.
 */
import { MonoId }     from 'design-system/MonoId';
import { StateBadge } from 'design-system/StateBadge';
import { Text }       from 'design-system/Text';

import type { TicketDocument }                 from '../../@types/ConversationDocuments.ts';
import type { TranscriptPictureDocument }      from '../../api/TranscriptStreamClient.ts';
import { CommandButton }                       from '../../shell/CommandButton.tsx';
import { DetailRoute }                         from '../../shell/DetailRoute.ts';
import { HashRouter }                          from '../../shell/HashRouter.ts';
import { StateToneUtil }                       from '../../utils/StateToneUtil.ts';
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
        <MonoId text={`#${ticket.id}`} tone="link" />
        <span className="bridge-intake-draft-title">{ticket.title}</span>
      </a>
      <StateBadge {...StateToneUtil.lookOf(pill.state)} label={pill.label} size="compact" />
    </li>
  );
}

export function IntakeAside({ session, pictures }: IntakeAsideProps) {
  const caption = IntakeModelUtil.closeIntakeCaptionOf(session.drafts);
  return (
    <aside className="bridge-intake-aside" aria-label={`Drafts of ${session.jobId}`}>
      <div className="bridge-intake-aside-block">
        <Text typeRole="small" element="h3" subtle>Drafts filed</Text>
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
            <Text typeRole="small" element="h3" subtle>Pictures in this chat</Text>
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
