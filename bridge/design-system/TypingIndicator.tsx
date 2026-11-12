/**
 * Three blinking dots and the line of what an agent does now, such as "Sorting the scripts into build and merge…". The region is polite
 * live, so a new line is read once; the dots are one image named by `accessibleName`. Under reduced motion the dots stand still.
 */
export interface TypingIndicatorProps {
  readonly text:           string;
  readonly accessibleName: string;
}

export function TypingIndicator({ text, accessibleName }: TypingIndicatorProps) {
  return (
    <div className="bridge-typing" aria-live="polite">
      <span className="bridge-typing-dots" role="img" aria-label={accessibleName}>
        <span className="bridge-typing-dot" />
        <span className="bridge-typing-dot" />
        <span className="bridge-typing-dot" />
      </span>
      <span className="bridge-typing-text">{text}</span>
    </div>
  );
}
