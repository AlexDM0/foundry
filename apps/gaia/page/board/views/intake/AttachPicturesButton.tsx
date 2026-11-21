/** Attach pictures: a button-styled label over a hidden file field of the media types the Overseer takes, and the words after it. */
export interface AttachPicturesButtonProps {
  readonly mediaTypes: readonly string[];
  /** "PNG, JPEG, WebP or GIF · 1 of 4". */
  readonly hint:       string;
  readonly disabled:   boolean;
  readonly onFiles:    (files: readonly File[]) => void;
}

export function AttachPicturesButton({
  mediaTypes, hint, disabled, onFiles
}: AttachPicturesButtonProps) {
  return (
    <>
      <label className="board-picture-attach" data-disabled={disabled ? '' : undefined}>
        <input
          className="board-picture-attach-input"
          type="file"
          multiple
          accept={mediaTypes.join(',')}
          aria-label="Attach pictures"
          disabled={disabled}
          onChange={(event) => {
            onFiles([...event.target.files ?? []]);
            // The same file chosen again is a change too.
            event.target.value = '';
          }}
        />
        <svg className="board-picture-attach-glyph" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M9.5 4.5 5 9a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4L3 7a4.2 4.2 0 0 0 6 6l3.5-3.5" />
        </svg>
        Attach pictures
      </label>
      <span className="board-picture-attach-hint">{hint}</span>
    </>
  );
}
