/**
 * A display state's badge, a pill tinted, edged and inked by the [data-state] row in `tokens.css`. The tickets table asks for the
 * ticket-status palette, its quieter badge colours; `ready` is the link-coloured badge of a ticket nothing holds back.
 */
import type { DisplayState } from '../../src/lib/tracker-model/@types/Task.ts';

export type BadgeState = DisplayState | 'ready';

export interface StateBadgeProps {
  readonly state:    BadgeState;
  readonly label:    string;
  readonly palette?: 'state' | 'ticket-status';
  /** Compact is a row's badge: shorter, and only as wide as its word. */
  readonly size?:    'standard' | 'compact';
  readonly title?:   string;
}

export function StateBadge({
  state, label, palette = 'state', size = 'standard', title
}: StateBadgeProps) {
  return (
    <span
      className="bridge-state-badge"
      data-state={state === 'ready' ? undefined : state}
      data-ready={state === 'ready' ? '' : undefined}
      data-palette={palette === 'ticket-status' ? palette : undefined}
      data-size={size === 'compact' ? size : undefined}
      title={title}
    >
      {label}
    </span>
  );
}
