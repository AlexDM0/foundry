/**
 * A banner card: warn (held, in the orange tint), error (in the failure colours) or quiet (a snapshot or stale view, on the wash). It holds
 * an optional bold lead, the text, and an optional action at the line's end. It is an alert or a status only when the caller says so,
 * and an `li` where the caller lists several.
 */
import type { ReactNode } from 'react';

export interface BannerProps {
  readonly tone:     'warn' | 'error' | 'quiet';
  readonly lead?:    string;
  readonly text:     ReactNode;
  readonly action?:  ReactNode;
  readonly role?:    'alert' | 'status';
  readonly element?: 'div' | 'li';
}

export function Banner({
  tone, lead, text, action, role, element = 'div'
}: BannerProps) {
  const content = (
    <>
      {lead === undefined ? null : <strong>{lead}</strong>}
      <span>{text}</span>
      {action === undefined ? null : <span className="design-system-banner-action">{action}</span>}
    </>
  );
  if (element === 'li') return <li className="design-system-banner" data-tone={tone} role={role}>{content}</li>;
  return <div className="design-system-banner" data-tone={tone} role={role}>{content}</div>;
}
