/**
 * A display state's badge, the static page's pill: tinted, edged and inked by the [data-state] row in `tokens.css`. The tickets table asks
 * for the ticket-status palette, the static table's quieter badge colours.
 */
export interface StateBadgeProps {
  readonly state:    string;
  readonly label:    string;
  readonly palette?: 'state' | 'ticket-status';
  readonly title?:   string;
}

export function StateBadge({
  state, label, palette = 'state', title
}: StateBadgeProps) {
  return (
    <span className="bridge-state-badge" data-state={state} data-palette={palette === 'ticket-status' ? palette : undefined} title={title}>
      {label}
    </span>
  );
}
