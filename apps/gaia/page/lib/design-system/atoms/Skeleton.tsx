/**
 * Grey lines in the place of text that is still on its way, a busy status named by what it waits for; the lines themselves are hidden from
 * the accessibility tree.
 */
export interface SkeletonProps {
  readonly lines:          number;
  readonly accessibleName: string;
}

export function Skeleton({ lines, accessibleName }: SkeletonProps) {
  return (
    <div className="design-system-skeleton" role="status" aria-label={accessibleName} aria-busy="true">
      {/* A line has no identity beyond its place. */}
      {Array.from({ length: lines }, (_line, i) => <span key={i} className="design-system-skeleton-line" aria-hidden="true" />)}
    </div>
  );
}
