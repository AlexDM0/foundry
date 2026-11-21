/**
 * The pictures a message is about to carry, above the composer's text box: a thumbnail per picture with its name and size, or the refusal
 * that keeps it out of the message, and a button that removes it; then the zone a dragged picture is dropped on.
 */
import { PictureAttachmentsModelUtil, type PendingPicture } from './PictureAttachmentsModel.ts';

export interface PictureTrayProps {
  readonly pending:    readonly PendingPicture[];
  readonly onRemove:   (key: string) => void;
  /** A picture is dragged over the composer. */
  readonly dropActive: boolean;
}

function PictureThumbnail({ picture, onRemove }: { readonly picture: PendingPicture; readonly onRemove: (key: string) => void }) {
  const refusal = typeof picture.upload === 'object' && 'refusal' in picture.upload ? picture.upload.refusal : null;
  return (
    <li className="board-picture-thumbnail" data-uploading={picture.upload === 'uploading' ? '' : undefined} data-refused={refusal === null ? undefined : ''}>
      {picture.thumbnailDataUrl === null
        ? <span className="board-picture-thumbnail-image" aria-hidden="true" />
        : <img className="board-picture-thumbnail-image" src={picture.thumbnailDataUrl} alt="" />}
      <span className="board-picture-thumbnail-text">
        <span className="board-picture-thumbnail-name">{picture.name}</span>
        {refusal === null
          ? <span className="board-picture-thumbnail-size">{PictureAttachmentsModelUtil.sizeWordingOf(picture.bytes)}</span>
          : <span className="board-picture-thumbnail-refusal" role="status">{refusal}</span>}
      </span>
      <button type="button" className="board-picture-thumbnail-remove" aria-label={`Remove ${picture.name}`} onClick={() => onRemove(picture.key)}>
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

export function PictureTray({ pending, onRemove, dropActive }: PictureTrayProps) {
  return (
    <ul className="board-picture-tray" aria-label="Pictures to send">
      {pending.map((picture) => <PictureThumbnail key={picture.key} picture={picture} onRemove={onRemove} />)}
      <li className="board-picture-drop" data-active={dropActive ? '' : undefined} aria-hidden="true">Drop or paste pictures here</li>
    </ul>
  );
}
