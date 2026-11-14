/**
 * An Intake chat column: the thread, when there is one, over a composer that carries pictures. A picture is attached, pasted into the text
 * box or dropped anywhere on the column; it uploads at once and goes with the next send, which waits until every upload settled. With no
 * picture limits served, or no picture client in the shell, no picture is offered and a pasted or dropped one is ignored. What sends the
 * chat habitat's own cues of the intake goes inside the card, where the relay reaches the thread.
 */
import type { TagProps }                            from 'design-system/Tag';
import { useState, type DragEvent, type ReactNode } from 'react';

import type { PictureLimitsDocument }                             from '../../@types/ConversationDocuments.ts';
import type { ControlCommandBody }                                from '../../api/CommandClient.ts';
import { ChatCard }                                               from '../../conversation/ChatThread.tsx';
import { Composer }                                               from '../../conversation/Composer.tsx';
import { AttachPicturesButton }                                   from './AttachPicturesButton.tsx';
import { usePictureAttachments }                                  from './PictureAttachments.ts';
import { PictureAttachmentsModelUtil, type SentPictureReference } from './PictureAttachmentsModel.ts';
import { PictureTray }                                            from './PictureTray.tsx';

export interface IntakeChatProps {
  readonly label:          string;
  readonly thread:         ReactNode;
  readonly composerLabel:  string;
  readonly recipientLabel: string;
  readonly recipientJobId: string | null;
  readonly status:         TagProps | null;
  readonly placeholder:    string;
  readonly sendLabel:      string;
  readonly pictureLimits:  PictureLimitsDocument | null;
  /** The command a sendable text and its uploaded pictures make. */
  readonly commandOf:      (text: string, pictures: readonly SentPictureReference[]) => ControlCommandBody;
  readonly onApplied?:     (result: unknown) => void;
  /** Rendered inside the chat card, after the thread, so it can cue the thread's habitat. */
  readonly chatCues?:      ReactNode;
}

const FILES_DRAG_TYPE = 'Files';

function imagesOf(files: readonly File[]): File[] {
  return files.filter((file) => file.type.startsWith('image/'));
}

export function IntakeChat({
  label, thread, composerLabel, recipientLabel, recipientJobId, status, placeholder, sendLabel, pictureLimits, commandOf, onApplied, chatCues
}: IntakeChatProps) {
  const attachments = usePictureAttachments(pictureLimits);
  const [dropActive, setDropActive] = useState(false);
  const { limits } = attachments;

  const acceptsDrag = (event: DragEvent<HTMLDivElement>): boolean => attachments.enabled && event.dataTransfer.types.includes(FILES_DRAG_TYPE);
  const dragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    setDropActive(true);
  };
  const dragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDropActive(false);
  };
  const drop = (event: DragEvent<HTMLDivElement>): void => {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    setDropActive(false);
    attachments.add(imagesOf([...event.dataTransfer.files]));
  };

  const pictureParts = limits === null
    ? {}
    : {
      attachments: attachments.pending.length === 0 && !dropActive
        ? null
        : <PictureTray pending={attachments.pending} onRemove={attachments.remove} dropActive={dropActive} />,
      footStart: (
        <AttachPicturesButton
          mediaTypes={limits.mediaTypes}
          hint={PictureAttachmentsModelUtil.attachHintOf(attachments.pending, limits)}
          disabled={!attachments.enabled}
          onFiles={attachments.add}
        />
      ),
      onFilesPasted: (files: readonly File[]) => attachments.add(imagesOf(files)),
    };

  return (
    <div className="bridge-intake-chat" onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}>
      <ChatCard label={label}>
        {thread}
        {chatCues}
        <Composer
          label={composerLabel}
          recipientLabel={recipientLabel}
          recipientJobId={recipientJobId}
          status={status}
          placeholder={placeholder}
          sendLabel={sendLabel}
          commandOf={(text) => (PictureAttachmentsModelUtil.sendableOf(text, attachments.pending)
            ? commandOf(text.trim(), PictureAttachmentsModelUtil.sentPicturesOf(attachments.pending))
            : null)}
          onApplied={(_text, result) => {
            // This render's pictures are the ones the applied command carried.
            attachments.removeSent(attachments.pending.map((picture) => picture.key));
            onApplied?.(result);
          }}
          {...pictureParts}
        />
      </ChatCard>
    </div>
  );
}
