/**
 * The page's one reach into the browser's Notification API: what User allowed, asking from a click of User's, and raising one notification.
 * Every other module of the page takes a notifier built here, so a spec hands its own and no spec raises a real notification.
 */

export type NotificationAllowance = 'default' | 'granted' | 'denied' | 'unsupported';

export interface BrowserNotifications {
  readonly allowance:    () => NotificationAllowance;
  /** Asks the browser, from a click of User's; resolves to what User chose. */
  readonly askAllowance: () => Promise<NotificationAllowance>;
  /** Raises one notification while User allowed them; does nothing otherwise. */
  readonly notify:       (title: string, body: string) => void;
}

function notificationsAreSupported(): boolean {
  return typeof Notification !== 'undefined';
}

function browserNotifications(): BrowserNotifications {
  return {
    allowance:    () => (notificationsAreSupported() ? Notification.permission : 'unsupported'),
    askAllowance: async () => (notificationsAreSupported() ? Notification.requestPermission() : 'unsupported'),
    notify:       (title, body) => {
      if (notificationsAreSupported() && Notification.permission === 'granted') new Notification(title, { body });
    },
  };
}

export const NotificationBoundary = Object.freeze({ browserNotifications });
