# Firefox v1 Alert Behavior Design

## Goal

Prepare Class Alert v1.0 for Firefox testing with dependable one-time lesson alerts, useful alert customization, and a stable Firefox add-on ID.

## User outcome

At each scheduled lesson, the user receives one alert. The user can join or dismiss it. The same recurring class alerts again at its next scheduled occurrence, even when it uses the same meeting URL.

## Scope

- Set Firefox add-on ID to `class-alert@afkllc`.
- Keep Manifest Version 3 and version `1.0`.
- Remove `Skip Open Links` behavior and its tab-URL inspection.
- Persist alert occurrence state in `browser.storage.local`.
- Add alert timing: at start, 5 minutes before, or 10 minutes before.
- Add configurable alert title and message with safe length limits and defaults.
- Add configurable Dismiss button visibility; enabled by default.
- Keep `Join Now` and `Dismiss` actions clear and keyboard accessible.
- Mark an occurrence handled when alert opens, joins, or dismisses. This prevents duplicate alerts after background restart.
- Scope occurrence identity to calendar date, scheduled day/time, and class identity. Never suppress a future occurrence because its URL matches.
- Keep theme, schedule, import, and export behavior intact.
- Update listing and release documentation to describe actual Firefox behavior and permissions.
- Build a downloadable test ZIP. Do not sign or publish it.

## Defaults

```text
soundEnabled: true
alertLeadMinutes: 0
alertTitle: "Class starting now"
alertMessage: "Your scheduled class is ready to join."
showDismissButton: true
```

Alert title and message are optional user text. The class name remains visible and the Join button remains fixed. Text is trimmed and bounded to prevent unusable alert layouts.

## Behavior

The scheduler calculates the current alert slot from the class start time minus the configured lead time. It creates a stable occurrence key using local date, scheduled day, scheduled start time, class name, and URL. Before opening an alert, it checks stored handled occurrences. If key exists, it does nothing. If not, it stores the key before opening the alert.

Stored occurrence records are pruned during schedule checks. Keep only recent records needed to prevent duplicate alerts, avoiding unbounded local storage growth.

Opening an alert counts as handled. This matches the product promise of one alert per occurrence, including when the user closes the tab manually. Join and Dismiss also close the alert. Dismiss is available only when enabled in Alert Options.

## Firefox constraints

The extension needs `tabs` permission only when reading tab URLs. Removing Skip Open Links permits removing that permission, while tab creation/update remains part of the alert flow. The stable ID remains unchanged after this test build so Firefox and AMO can identify later updates as the same add-on.

## Acceptance criteria

- Firefox lint accepts the manifest and package.
- A class produces one alert at configured lead time.
- Restart/reload does not produce a second alert for the same dated occurrence.
- Next week’s same class produces a new alert.
- Same URL used by different classes does not suppress either class.
- Join opens the saved HTTP(S) URL and closes alert.
- Dismiss closes alert when enabled.
- Dismiss is absent when disabled.
- Sound toggle still works.
- Custom title/message appear in alert and remain readable with maximum-length input.
- Existing schedule, theme, import, and export flows continue working.
- Build output is a Firefox test ZIP in `web-ext-artifacts/`.

