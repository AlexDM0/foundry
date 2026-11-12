# Spikes

Three questions the build needed answered on a real Mac before the frame, the notifications and the launcher were written. The spike code
was thrown away; this file keeps what was seen. Run on 2026-11-12, macOS 26.6, Google Chrome and Microsoft Edge as installed.

## 1. A `SameSite=Strict` session cookie inside a frame of another port: yes

Two Bun servers on `127.0.0.1`, each on its own port. A Chrome (and then Edge) app window opened the first server's page, which framed the
second server's page. Inside the frame the page posted to `/session`, which answered `Set-Cookie: …; HttpOnly; SameSite=Strict; Path=/`.

Seen on the second server, in both browsers:

- the session post was accepted and the cookie stored;
- the frame's next `fetch` carried the cookie;
- a navigation of the frame by itself carried it (`Sec-Fetch-Site: same-origin`);
- a navigation started by the parent page setting the frame's `src` carried it (`Sec-Fetch-Site: same-site`), since ports do not make
  two `127.0.0.1` origins cross-site.

W5.5 may build the frame as PLAN 8.3 says.

## 2. Notification permission in an app window with a kept profile: not yet run

This needs a person: the permission prompt must be answered and the notification clicked while another application is in front. The
spike script is ready and waits for the owner at the laptop. W5.6 waits for this result (PLAN 11 gives the fallback).

## 3. The window's end through `--remote-debugging-port=0`: yes

The same app windows were opened with `--remote-debugging-port=0` and a `--user-data-dir`. In both browsers the browser wrote the chosen
port to `<profile>/DevToolsActivePort` within a second, `GET /json/list` listed the page as a `page` target, and after the window closed
the list held no `page` target while the browser process kept running. This is Books Explorer's `launch.ts` method, and W6.1 may use it.
