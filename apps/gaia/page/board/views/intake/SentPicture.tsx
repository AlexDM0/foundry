/**
 * A picture User sent, in User's turn: the picture itself, loaded through Gaia's relay of its forge and opening there in a new tab, with
 * its name and size under it.
 */
import type { BoardTranscriptPictureDocument } from '../../../@types/board/ConversationDocument.ts';
import { usePictureAddressOf }                 from './PictureAttachments.ts';
import { PictureAttachmentsModelUtil }         from './PictureAttachmentsModel.ts';

export function SentPicture({ picture }: { readonly picture: BoardTranscriptPictureDocument }) {
  const name = PictureAttachmentsModelUtil.pictureNameOf(picture);
  const route = usePictureAddressOf()(picture.pictureId);
  return (
    <a className="board-picture-sent" href={route} target="_blank" rel="noopener" aria-label={`Open picture ${name}`}>
      <img className="board-picture-sent-image" src={route} alt="" />
      <span className="board-picture-name">{`${name} · ${PictureAttachmentsModelUtil.sizeWordingOf(picture.bytes)}`}</span>
    </a>
  );
}
