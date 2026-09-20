# Firefox v1 Alert Behavior Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax for tracking.

Goal: Ship a Firefox-testable Class Alert v1.0 ZIP with stable identity, useful alert customization, and persistent one-alert-per-lesson behavior.

Architecture: Keep the existing plain JavaScript Firefox MV3 extension. Add one pure utility module for local-time calculations and occurrence keys; load it before the background script and expose it for Node tests. Keep browser UI logic in existing options and alert files. Store settings and handled occurrences in browser.storage.local.

Tech Stack: Firefox WebExtensions MV3, browser APIs, plain HTML/CSS/JavaScript, Node built-in test runner, npx web-ext.

Spec: docs/superpowers/specs/2026-09-20-firefox-v1-alert-behavior-design.md

## Global Constraints

- Firefox first; preserve Manifest Version 3.
- Keep version 1.0.
- Set stable Firefox ID to class-alert@afkllc.
- Never suppress a future occurrence because its URL matches a previous occurrence.
- Keep class name and Join button visible when users customize alert text.
- Default sound on, lead time at start, default title/message, and Dismiss visible.
- Accept only HTTP(S) class URLs.
- Keep user data local; add no network calls or tracking.
- Do not commit generated ZIP output.

## Review Focus

- Firefox restart or background reload must not duplicate a dated alert; test occurrence persistence and manual flow.
- Weekly class using same URL must alert next week; test date-sensitive occurrence keys.
- Lead time crossing midnight must use scheduled lesson date/day; test local-time calculation.
- Malformed or oversized imported alert settings must fall back safely; test settings normalization.
- Long custom title/message must not break layout; test limits and inspect rendered alert manually.

### Task 1: Add tested scheduling and occurrence helpers

Files:
- Create: schedule-utils.js
- Create: tests/schedule-utils.test.js
- Modify: manifest.json background script order

Interfaces:
- ClassAlertUtils.getScheduledSlot(now, leadMinutes) returns dateKey, dayKey, timeKey.
- ClassAlertUtils.createOccurrenceKey(slot, classData) returns a stable key containing date, slot, name, and URL.
- ClassAlertUtils.pruneHandledOccurrences(records, todayDateKey) returns bounded recent records.
- ClassAlertUtils.normalizeAlertSettings(settings, defaults) returns validated settings.

- [ ] Write failing Node tests for zero/five-minute lead time, midnight crossing, date-sensitive keys, same-URL different-class keys, pruning, invalid settings, and length limits.
- [ ] Run node --test tests/schedule-utils.test.js and confirm failure because module is absent.
- [ ] Implement pure utility module using local Date getters, allowed lead values 0/5/10, title limit 80, message limit 240, bounded records, module.exports for Node, and globalThis.ClassAlertUtils for Firefox.
- [ ] Run node --test tests/schedule-utils.test.js and verify all pass.
- [ ] Save increment with git add schedule-utils.js tests/schedule-utils.test.js manifest.json and git commit -m "test: add alert scheduling helpers".

### Task 2: Replace link skipping with persistent occurrence claiming

Files:
- Modify: background.js
- Modify: manifest.json

Interfaces:
- Consumes ClassAlertUtils from Task 1.
- Stores handledAlertOccurrences as an object mapping occurrence keys to ISO timestamps.
- Passes class name, URL, title, message, and Dismiss visibility to alert.html through encoded query parameters.

- [ ] Add focused claim eligibility tests: unhandled occurrence eligible, existing occurrence ineligible, next-week occurrence eligible, old records pruned.
- [ ] Run node --test tests/schedule-utils.test.js and confirm new assertions fail before integration.
- [ ] Replace lastTriggeredSlot-only suppression and all shouldSkipAlert, urlsLookLikeSameClass, and tab URL scanning. Calculate scheduled slot from now plus lead time, find class, build occurrence key, persist key before opening alert, and prune old records. Keep the in-memory guard as a cheap duplicate check.
- [ ] Set manifest ID to class-alert@afkllc. Remove tabs permission because background code no longer reads Tab.url; retain tab creation/update calls.
- [ ] Run node --check schedule-utils.js, node --check background.js, and node --test tests/schedule-utils.test.js.
- [ ] Save increment with git add background.js manifest.json schedule-utils.js tests/schedule-utils.test.js and git commit -m "feat: persist one alert per lesson occurrence".

### Task 3: Add effective Alert Options controls

Files:
- Modify: options.html
- Modify: options.js

Interfaces:
- Saves soundEnabled, alertLeadMinutes, alertTitle, alertMessage, and showDismissButton under alertSettings.
- Imports old configs safely by applying current defaults to missing fields.

- [ ] Add normalization tests for missing fields, invalid lead values, non-boolean toggles, whitespace-only text, and overlong text.
- [ ] Run node --test tests/schedule-utils.test.js and confirm new assertions fail until normalization matches the UI contract.
- [ ] Keep heading Alert Options. Remove Skip Open Links. Add accessible timing select with Start/5 minutes/10 minutes, title input, message textarea, Show Dismiss button toggle, and Sound toggle.
- [ ] Wire load/save/import/export. Normalize before storage and include all new settings in exported config. Preserve version-1 import compatibility.
- [ ] Run node --check options.js and node --test tests/schedule-utils.test.js.
- [ ] Save increment with git add options.html options.js schedule-utils.js tests/schedule-utils.test.js and git commit -m "feat: add useful alert options".

### Task 4: Make the alert page actionable and safe

Files:
- Modify: alert.html
- Modify: alert.js

Interfaces:
- Consumes encoded class name, URL, title, message, and showDismissButton query values.
- Uses textContent for user-controlled text.
- Join opens validated HTTP(S) URL. Dismiss closes alert without opening a URL.

- [ ] Add pure parser/normalizer tests or a direct manual checklist for query defaults, title/message fallback, Dismiss visibility, and unsafe URL rejection.
- [ ] Show custom title, fixed class name, custom message, Join Now, and optional Dismiss. Use safe fallback copy and native keyboard behavior.
- [ ] Stop sound on either action. Join opens the validated URL in a new active tab and closes alert. Dismiss closes alert.
- [ ] Run node --check alert.js and node --test tests/schedule-utils.test.js.
- [ ] Save increment with git add alert.html alert.js tests/schedule-utils.test.js and git commit -m "feat: add configurable alert actions".

### Task 5: Update Firefox-facing documentation and package

Files:
- Modify: README.md
- Modify: ADDON_LISTING.md
- Modify: RELEASE.md
- Modify: PRIVACY.md only if permission wording requires it

- [ ] Remove Skip Open Links claims. Explain one alert per dated lesson, recurring weekly alerts, settings, stable ID, and local-only storage.
- [ ] Run npx web-ext lint, all four node --check commands, and node --test tests/schedule-utils.test.js.
- [ ] Run npx web-ext build --overwrite-dest. Expect ZIP in web-ext-artifacts and keep it untracked.
- [ ] Inspect ZIP contents and manifest. Verify ID, version, permissions, assets, and no development-only files.
- [ ] Manually test default alert, sound off, all lead times, custom text, Dismiss shown/hidden, Join, same-day reload, next-week occurrence, same URL across classes, import/export, theme, and schedule editing in Firefox.
- [ ] Save documentation with git add README.md ADDON_LISTING.md RELEASE.md PRIVACY.md and git commit -m "docs: prepare Firefox v1 test release".

