/**
 * The pictures a composer is about to send: each file the served limits admit is read for its thumbnail and uploaded at once through the
 * shell's picture client, so Send waits only on uploads still running; a file they refuse stays shown with its refusal and is never sent.
 */
import { useContext, useRef, useState } from 'react';

import type { PictureLimitsDocument }                                                from '../../@types/ConversationDocuments.ts';
import type { PictureUpload }                                                        from '../../api/PictureUploadClient.ts';
import { ControlAvailabilityUtil, ControlSurroundingsContext }                       from '../../shell/ControlAvailability.ts';
import { UNREACHABLE_WORDING }                                                       from '../../shell/ControlCommandSender.ts';
import { PictureAttachmentsModelUtil, type PendingPicture, type PictureUploadState } from './PictureAttachmentsModel.ts';

export interface PictureAttachments {
  /** The served limits, while pictures can be sent at all: the board serves them and the shell can upload. */
  readonly limits:  PictureLimitsDocument | null;
  /** Whether a picture may be added now: never while the shell's controls may not act. */
  readonly enabled: boolean;
  readonly pending: readonly PendingPicture[];
  readonly add:     (files: readonly File[]) => void;
  readonly remove:  (key: string) => void;
  readonly clear:   () => void;
}

function thumbnailOf(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : null));
    reader.addEventListener('error', () => resolve(null));
    reader.readAsDataURL(file);
  });
}

function uploadStateOf(upload: PictureUpload): PictureUploadState {
  switch (upload.verdict) {
    case 'uploaded':
      return { pictureId: upload.pictureId };
    case 'refused':
      return { refusal: upload.refusal };
    case 'unreachable':
    case 'no-session':
      return { refusal: UNREACHABLE_WORDING };
  }
}

export function usePictureAttachments(servedLimits: PictureLimitsDocument | null): PictureAttachments {
  const { availability, pictureUploadClient, onSessionLost } = useContext(ControlSurroundingsContext);
  const [pending, setPending] = useState<readonly PendingPicture[]>([]);
  const nextKeyNumber = useRef(1);
  const limits = pictureUploadClient === undefined ? null : servedLimits;
  const enabled = limits !== null && ControlAvailabilityUtil.controlIsEnabled(availability, false);

  const update = (key: string, change: Partial<PendingPicture>): void => {
    setPending((current) => current.map((picture) => (picture.key === key ? { ...picture, ...change } : picture)));
  };

  const add = (files: readonly File[]): void => {
    if (!enabled || pictureUploadClient === undefined || files.length === 0) return;
    const verdicts = PictureAttachmentsModelUtil.admissionsOf(files, pending, limits);
    const added = files.map((file, position): PendingPicture => {
      const key = `picture-${nextKeyNumber.current}`;
      nextKeyNumber.current += 1;
      const verdict = verdicts[position];
      return {
        key,
        name:             file.name,
        bytes:            file.size,
        mediaType:        file.type,
        thumbnailDataUrl: null,
        upload:           verdict === undefined || verdict.admitted ? 'uploading' : { refusal: verdict.refusal },
      };
    });
    setPending((current) => [...current, ...added]);
    added.forEach((picture, position) => {
      const file = files[position];
      if (file === undefined || picture.upload !== 'uploading') return;
      void thumbnailOf(file).then((thumbnailDataUrl) => update(picture.key, { thumbnailDataUrl }));
      void pictureUploadClient.upload(file).then((upload) => {
        if (upload.verdict === 'no-session') onSessionLost?.();
        update(picture.key, { upload: uploadStateOf(upload) });
      });
    });
  };

  return {
    limits,
    enabled,
    pending,
    add,
    remove: (key) => setPending((current) => current.filter((picture) => picture.key !== key)),
    clear:  () => setPending([]),
  };
}
