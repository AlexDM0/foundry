/** A full-width line under the top bar in the error tone: what Gaia cannot reach, and one action at its end. A status unless the caller says alert. */
import type { ReactNode } from 'react';

export interface BannerProps {
  readonly text:    ReactNode;
  readonly action?: ReactNode;
  readonly role?:   'status' | 'alert';
}

export function Banner({ text, action, role = 'status' }: BannerProps) {
  return (
    <div className="gaia-banner" data-tone="error" role={role}>
      <span className="gaia-banner-text">{text}</span>
      {action === undefined ? null : <span className="gaia-banner-action">{action}</span>}
    </div>
  );
}
