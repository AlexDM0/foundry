/** A picture User sent, in User's turn: the picture itself, linking to its served route in a new tab, with its name and size under it. */
import type { TranscriptPictureDocument } from '../../api/TranscriptStreamClient.ts';
import { PictureAttachmentsModelUtil }    from './PictureAttachmentsModel.ts';

export function SentPicture({ picture }: { readonly picture: TranscriptPictureDocument }) {
  const name = PictureAttachmentsModelUtil.pictureNameOf(picture);
  const route = PictureAttachmentsModelUtil.pictureRouteOf(picture.pictureId);
  return (
    <a className="bridge-picture-sent" href={route} target="_blank" rel="noopener" aria-label={`Open picture ${name}`}>
      <img className="bridge-picture-sent-image" src={route} alt="" />
      <span className="bridge-picture-name">{`${name} · ${PictureAttachmentsModelUtil.sizeWordingOf(picture.bytes)}`}</span>
    </a>
  );
}
