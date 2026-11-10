/**
 * A banner card in the warn or the error colours: an optional bold lead, the text, and an optional action at the line's end. It is an
 * alert or a status only when the caller says so, and an `li` where the caller lists several.
 */
import type { ReactNode } from 'react';

export interface BannerProps {
  readonly tone:     'warn' | 'error';
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
      {action === undefined ? null : <span className="bridge-banner-action">{action}</span>}
    </>
  );
  if (element === 'li') return <li className="bridge-banner" data-tone={tone} role={role}>{content}</li>;
  return <div className="bridge-banner" data-tone={tone} role={role}>{content}</div>;
}
