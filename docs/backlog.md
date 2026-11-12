# Backlog

What is agreed and not started, with the reason it waits.

- **The theme switch writes `settings.theme`.** SCREENS "The shell": the switch applies a choice at once and keeps it for the next first
  paint, and Gaia's settings answer with it. Sending it through the page's command sender waits for the `settings-set` command (W3.4).
- **The page server routes the frame session.** `routes/FrameSessionRoute.ts` answers `POST /api/forges/<trackerId>/frame-session`
  (W3.5); `PageServer.ts` puts it behind the session guard and the CSP with the fleet store's readings, the registry and the forge
  client. It waits for `PageServer.ts` (W3.2), which was not on the integration branch when the route was built.
