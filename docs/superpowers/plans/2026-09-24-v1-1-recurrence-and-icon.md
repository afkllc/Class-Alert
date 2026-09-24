# Class Alert v1.1 Recurrence and Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Class Alert v1.1 with a cleaner icon, weekly multi-day and monthly recurrence, safe migration, individual pause/resume, exact event-driven alarms, conflict prevention, and actionable user errors.

**Architecture:** Keep recurrence, migration, validation, conflict detection, and next-occurrence calculation pure in `schedule-utils.js`, where Node tests can exercise them without Firefox. Store versioned `lessons` in local storage. Let `background.js` own Firefox alarm lifecycle: one named one-shot alarm per enabled lesson, rebuilt on startup and after schedule changes. Keep `options.js` focused on form rendering, storage transactions, import/export, and user-facing status messages.

**Tech Stack:** Firefox Manifest V3 WebExtensions APIs, vanilla HTML/CSS/JavaScript, Node built-in `node:test`, ImageMagick, `web-ext`.

**Spec:** `docs/superpowers/specs/2026-09-24-v1-1-recurrence-design.md`

## Global Constraints

- Manifest version must be `1.1`.
- Canonical schedule storage uses `configVersion: 2` and a `lessons` array.
- Weekday numbers preserve Sunday `0`, Monday `1`, through Saturday `6`.
- Weekly lessons require at least one selected day.
- Monthly lessons use day `1` through `31` and `overflow: "last-day"`.
- `enabled: false` lessons remain stored but have no active alarm.
- Timing, recurrence, link, and class name remain lesson-specific.
- Groups are deferred and must not be implemented in v1.1.
- A lesson occupies its scheduled start minute; duration overlap is not modeled.
- Same actual recurrence date and start time is rejected for two enabled lessons.
- Separate lessons are never silently merged or deduplicated.
- The extension must not use `setInterval` for schedule reliability.
- Firefox alarms are one-shot future wakeups; rebuild them on install and startup because alarms do not persist across browser sessions.
- A requested alert less than one minute in the future must skip only the immediate occurrence, schedule the next valid occurrence, and produce an explicit user-facing warning.
- The new source image is `icon_source.png`; it must not ship inside the release ZIP.
- No new dependency is required for runtime or tests.

## Review Focus

- A weekly lesson with multiple selected weekdays alerts on each selected day and not on unselected days.
- A monthly lesson on day 31 maps to the final day of shorter months without creating duplicate alerts.
- Two monthly lessons whose overflow dates converge are rejected with both lesson names and a corrective action.
- Editing, deleting, pausing, and resuming a lesson never leaves a stale alarm behind.
- Invalid migration preserves the original v1 schedule and exposes a visible repair message instead of silently dropping data.

---

### Task 1: Build pure recurrence, validation, migration, and conflict primitives

**Files:**
- Modify: `schedule-utils.js`
- Test: `tests/schedule-utils.test.js`

**Interfaces:**
- Produces `normalizeLesson(input, idFactory)` returning a validated lesson or throwing an error with a user-safe message.
- Produces `normalizeLessons(input, idFactory)` returning `{ lessons, errors }` without mutating input.
- Produces `migrateLegacySchedule(classSchedule, idFactory)` returning `{ lessons, errors, sourceBackup }`.
- Produces `isLessonOccurrenceOnDate(lesson, date)` returning a boolean.
- Produces `getNextLessonOccurrence(lesson, fromDate, leadMinutes)` returning `{ date, dateKey, scheduledTime, alertTime, alertDate }` or `null`.
- Produces `getNextSchedulableOccurrence(lesson, fromDate, leadMinutes, minimumLeadMs)` returning the same shape plus `skippedImmediateOccurrence`.
- Produces `lessonsConflict(candidate, existing)` returning `{ conflict: boolean, reason }`.
- Produces `findLessonConflict(candidate, lessons, excludeId)` returning `{ conflict: boolean, lesson, message }` or `null`.
- Produces `createLessonOccurrenceKey(lessonId, occurrenceDate, scheduledTime)` returning a stable string.

- [ ] **Step 1: Add failing recurrence tests.**

Extend `tests/schedule-utils.test.js` with tests for:

```js
test('weekly lesson matches every selected weekday', () => {
    const lesson = {
        id: 'lesson-1', enabled: true, name: 'Math', url: 'https://example.test/math',
        time: '09:00', recurrence: { type: 'weekly', days: [1, 3] }
    };
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 9, 21, 9, 0)), true);
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 9, 22, 9, 0)), false);
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 9, 23, 9, 0)), true);
});

test('monthly day 31 uses final day in February', () => {
    const lesson = {
        id: 'lesson-1', enabled: true, name: 'Math', url: 'https://example.test/math',
        time: '09:00', recurrence: { type: 'monthly', dayOfMonth: 31, overflow: 'last-day' }
    };
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 2, 28, 9, 0)), true);
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 2, 27, 9, 0)), false);
    assert.equal(utils.isLessonOccurrenceOnDate(lesson, localDate(2026, 4, 30, 9, 0)), true);
});

test('next occurrence uses local alert lead time and selected recurrence', () => {
    const lesson = {
        id: 'lesson-1', enabled: true, name: 'Math', url: 'https://example.test/math',
        time: '09:00', recurrence: { type: 'weekly', days: [1] }
    };
    const next = utils.getNextLessonOccurrence(lesson, localDate(2026, 9, 20, 10, 0), 5);
    assert.equal(next.scheduledTime, '2026-09-21T09:00:00');
    assert.equal(next.alertTime, '2026-09-21T08:55:00');
});
```

Also add tests for monthly leap-year behavior, no matching unrelated dates, disabled lessons returning no occurrence, midnight/week boundary behavior, a requested alert less than one minute away being skipped in favor of the next recurrence, and proof that every date helper leaves its input `Date` unchanged.

- [ ] **Step 2: Run the focused tests and verify failure.**

Run:

```powershell
node --test tests/schedule-utils.test.js
```

Expected: FAIL because the new recurrence functions do not exist.

- [ ] **Step 3: Implement normalized lesson validation.**

Add constants and functions to `schedule-utils.js`:

```js
const CONFIG_VERSION = 2;
const MIN_ALARM_LEAD_MS = 60 * 1000;
const VALID_RECURRENCE_TYPES = ['weekly', 'monthly'];

function normalizeLesson(input, idFactory = () => crypto.randomUUID()) {
    // Validate ID, enabled flag, trimmed name, HTTP(S) URL, HH:MM time,
    // and exactly one supported recurrence shape. Throw specific messages:
    // "Enter a class name.", "Use a valid HTTP or HTTPS meeting link.",
    // "Choose at least one weekday.", and "Choose a monthly day from 1 to 31."
}
```

Use the project’s current URL validation rules. Do not generate IDs from names or URLs because users may edit those fields. Use a deterministic injectable `idFactory` in tests.

- [ ] **Step 4: Implement recurrence date calculation.**

Implement `isLessonOccurrenceOnDate` using local `Date` values. For monthly recurrence, compare the requested day with `Math.min(dayOfMonth, daysInMonth)`. Implement `getNextLessonOccurrence` by cloning the input date before advancing local calendar dates; never call mutating setters on the caller's `Date` object. Search only the bounded recurrence window needed for the next match: at most 7 days for weekly rules and 31 days for monthly rules. Return `null` for disabled lessons. Implement `getNextSchedulableOccurrence` as a separate wrapper that skips a current occurrence whose alert time is before `now + minimumLeadMs` and selects the next recurrence. A valid recurring lesson must always yield a future schedulable occurrence.

Reject impossible or past alert targets only at the scheduling boundary; recurrence calculation itself must remain deterministic for tests.

- [ ] **Step 5: Implement conflict detection.**

Compare only enabled lessons with equal `time`. Define recurrence overlap precisely:

- Weekly/weekly: selected day arrays intersect.
- Monthly/monthly: evaluate representative month lengths 28, 29, 30, and 31; if both rules map to the same day for any length, they conflict.
- Weekly/monthly: return a conflict directly when both lessons have the same time and both recurrence rules are valid, because every valid monthly day occurs on every weekday across the Gregorian calendar. Do not scan 146,097 days during form input or save.

Return a short reason suitable for the UI, such as `Mondays at 17:00` or `a shared month-end date at 14:00`. Do not compare URL or class name; different lessons still conflict when their active occurrences overlap.

- [ ] **Step 6: Implement migration and import normalization.**

Implement `migrateLegacySchedule` to convert every valid v1 `classSchedule[day][time]` entry into an independent weekly lesson with `enabled: true`. Return all invalid entries in `errors`, preserve a JSON `sourceBackup`, and never mutate the source object. Implement v2 normalization as all-or-nothing: return a fully normalized list or errors; do not return a partially accepted replacement schedule.

- [ ] **Step 7: Implement alarm identity helpers.**

Add `createLessonOccurrenceKey` using lesson ID, occurrence date, and scheduled time. Keep the existing handled-occurrence helpers only where still needed for migration compatibility; remove name/URL from new occurrence identity so editing copy does not create a second identity for the same lesson.

- [ ] **Step 8: Run the full utility tests.**

Run:

```powershell
node --test tests/schedule-utils.test.js
```

Expected: PASS, including existing alert-setting tests and all new recurrence, migration, conflict, and alarm-boundary tests.

- [ ] **Step 9: Commit the pure domain slice.**

```powershell
git add schedule-utils.js tests/schedule-utils.test.js
git commit -m "feat: add v1.1 recurrence and lesson validation"
```

### Task 2: Replace legacy options storage with versioned lessons

**Files:**
- Modify: `options.js`
- Modify: `options.html`
- Test: `tests/schedule-utils.test.js` for any newly extracted pure config helpers

**Interfaces:**
- Consumes the Task 1 lesson normalization, migration, recurrence, and conflict functions.
- Stores `{ configVersion: 2, lessons, activeThemeMode, alertSettings }` in `browser.storage.local`.
- Emits `browser.runtime.sendMessage({ type: 'scheduleChanged' })` after successful schedule mutations.

- [ ] **Step 1: Add failing pure tests for v2 import/export validation.**

Test that v2 data preserves `enabled: false`, rejects malformed recurrence rules, rejects conflicts, and accepts valid weekly multi-day and monthly lessons. Test that v1 data migrates with `enabled: true`.

- [ ] **Step 2: Add v1-to-v2 upgrade handling.**

On options-page load, read storage. If `configVersion: 2` exists, normalize it. If legacy `classSchedule` exists, call `migrateLegacySchedule`.

If migration has no errors, write v2 data only after complete validation succeeds. If migration has errors, preserve the original `classSchedule`, save `migrationStatus` containing the exact errors and `sourceBackup`, and render a persistent banner. The banner must say what happened in user language, for example: `Your previous schedule was preserved, but 2 classes need attention. Export a backup before repairing them.`

- [ ] **Step 3: Replace the single-day form with recurrence controls.**

In `options.html`, replace the single day select with:

- A recurrence type select with `Weekly` and `Monthly`.
- Seven labeled weekday checkboxes for weekly recurrence.
- A monthly day select from `1` through `31`.
- A clear helper sentence: `For shorter months, this class uses the last day of the month.`
- An enabled checkbox labeled `Alert me for this class`.

Keep name, URL, time, alert settings, theme, and import/export controls. Hide inactive recurrence controls without removing their values until save normalization completes.

- [ ] **Step 4: Implement add and edit transactions.**

Create a normalized lesson with a stable ID for new entries. For edits, retain the existing ID and replace only that lesson. Validate conflicts against all other enabled lessons before storage. Reject a conflict with a message naming both lessons, the day/rule, the time, and the fix.

Use messages such as:

- `Choose at least one weekday.`
- `Choose a monthly day from 1 to 31.`
- `Saved. This class starts too soon for a reliable alert today. The next alert is scheduled for 2026-09-28 at 17:00.`
- `Cannot save “Math tutoring.” It conflicts with “Reading support” on Mondays at 17:00. Choose another time or remove that day.`

- [ ] **Step 5: Implement pause/resume and delete transactions.**

Add a row action that toggles `enabled`. Use labels `Pause` and `Resume`, with confirmation text that explains the consequence: `Pause this class? It will stay saved, but no alert will be scheduled.`

Delete must remove only the selected lesson. Clear-all must remove every lesson. Every successful mutation sends `scheduleChanged` after storage succeeds.

- [ ] **Step 6: Render saved lessons clearly.**

Display class name, meeting link, time, recurrence, and state. Examples:

- `Math tutoring · Mon, Wed · 17:00 · Active`
- `Essay review · Monthly on the 15th · 14:00 · Paused`

Keep Edit, Pause/Resume, and Delete actions keyboard-accessible. Show month-end warning text for monthly days 29–31 when another saved rule can converge.

- [ ] **Step 7: Update import/export.**

Export `configVersion: 2`, `lessons`, theme, and alert settings. Accept v1 and v2 files. Validate the entire import, reject conflicts before confirmation, and only replace current storage after the user confirms and validation succeeds. Preserve the current configuration on every failure.

Error messages must identify the file problem and remedy: `Import rejected: “Essay review” conflicts with “Writing clinic” at 14:00. Change one lesson’s time or recurrence, then export again.`

- [ ] **Step 8: Run syntax and utility tests.**

Run:

```powershell
node --check options.js
node --test tests/schedule-utils.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit the options and storage slice.**

```powershell
git add options.html options.js tests/schedule-utils.test.js
git commit -m "feat: add editable recurring lesson management"
```

### Task 3: Replace polling with event-driven exact alarm coordination

**Files:**
- Modify: `background.js`
- Modify: `options.js` for the schedule-change message
- Modify: `manifest.json` only if the final background declaration requires a Firefox-compatible correction
- Test: `tests/schedule-utils.test.js` for alarm planning helpers

**Interfaces:**
- Consumes v2 lessons and Task 1 `getNextSchedulableOccurrence`, `createLessonOccurrenceKey`, and validation helpers.
- Consumes `scheduleChanged` runtime messages from options.
- Owns alarm names equal to lesson IDs.
- Exposes no new user-facing API.

- [ ] **Step 1: Add failing tests for next-alarm planning.**

Test that active weekly and monthly lessons produce the correct next alert timestamp, disabled lessons produce no alarm plan, and a target under 60 seconds skips only the immediate occurrence. Test that a monthly 31st lesson schedules February 28 or February 29 correctly.

- [ ] **Step 2: Implement alarm plan helpers.**

Add pure `getNextAlarmPlan(lesson, now, leadMinutes)` using `getNextSchedulableOccurrence` and returning either:

```js
{
    alarmName: lesson.id,
    when: next.alertDate.getTime(),
    occurrenceKey: createLessonOccurrenceKey(lesson.id, next.dateKey, lesson.time),
    skippedImmediateOccurrence: next.skippedImmediateOccurrence
}
```

with `skippedImmediateOccurrence: true` when the current recurrence was too close, or `null` for disabled lessons. It must not throw for a valid recurring lesson because its current occurrence is too close or already past.

- [ ] **Step 3: Implement storage-driven alarm rebuild.**

Replace `keepExtensionAlive`, the one-second `setInterval`, and minute-slot polling with:

```js
async function rebuildLessonAlarms() { /* clear managed alarms, read storage, create one next alarm per enabled lesson */ }
async function clearLessonAlarm(lessonId) { return browser.alarms.clear(lessonId); }
```

Use a managed alarm-name prefix only if needed for reconciliation; if names equal lesson IDs, keep the prefix out of user-visible errors and use `browser.alarms.getAll()` to clear stale IDs that are not active lessons.

Call rebuild on `runtime.onInstalled`, `runtime.onStartup`, and `runtime.onMessage` for `scheduleChanged`. Register all listeners at top level.

- [ ] **Step 4: Implement alarm event handling.**

On `browser.alarms.onAlarm`, read the lesson by ID. If the lesson is missing or disabled, clear the alarm and stop. Otherwise, use the alarm’s scheduled timestamp to create the occurrence key, check handled occurrences, persist the key before opening the alert tab, and schedule the lesson’s next occurrence after processing.

If opening the alert tab fails, remove the handled occurrence and save a user-visible `lastAlarmError` record so the options page can show: `Class Alert could not open one alert. The lesson remains scheduled and will be retried at its next occurrence.`

- [ ] **Step 5: Add explicit delete/pause alarm clearing.**

The options page must send the updated schedule only after storage succeeds. The background listener must rebuild all alarms. In addition, delete and pause paths must call a direct `clearLessonAlarm(lessonId)` message or rely on a rebuild that explicitly calls `browser.alarms.clear(lessonId)` before removing the lesson. Test the clear call path with a mocked browser alarm API if a browser harness is available; otherwise cover the pure alarm plan and run manual Firefox verification.

- [ ] **Step 6: Add startup reconciliation.**

On startup, clear alarms whose names do not correspond to enabled lessons. Create alarms missing for enabled lessons. Do not open stale alerts for lessons whose scheduled time passed while Firefox was closed; schedule their next future occurrence and document that closed-browser limitation.

- [ ] **Step 7: Run checks.**

Run:

```powershell
node --check background.js
node --check options.js
node --check schedule-utils.js
node --test tests/schedule-utils.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit the alarm slice.**

```powershell
git add background.js options.js manifest.json tests/schedule-utils.test.js
git commit -m "feat: schedule recurring lessons with exact alarms"
```

### Task 4: Generate the v1.1 icon and update release metadata

**Files:**
- Add/keep: `icon_source.png` (user-provided source; do not modify)
- Modify: `icons/icon-16.png`
- Modify: `icons/icon-32.png`
- Modify: `icons/icon-48.png`
- Modify: `icons/icon-128.png`
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `RELEASE.md`
- Modify: `ADDON_LISTING.md` if version-specific feature copy needs updating

**Interfaces:**
- Manifest icon paths remain `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
- Release commands exclude `icon_source.png`, `docs/**`, `tests/**`, and `.superpowers/**`.

- [ ] **Step 1: Verify source artwork before generation.**

Confirm `icon_source.png` is 512×512 with transparency. Do not alter or delete the user-provided source. Keep the prior deletion of `icon-source.png` as the intentional source rename.

- [ ] **Step 2: Generate icon sizes.**

Run ImageMagick from the repository root:

```powershell
magick icon_source.png -background none -alpha on -resize 16x16 icons/icon-16.png
magick icon_source.png -background none -alpha on -resize 32x32 icons/icon-32.png
magick icon_source.png -background none -alpha on -resize 48x48 icons/icon-48.png
magick icon_source.png -background none -alpha on -resize 128x128 icons/icon-128.png
```

Inspect the generated files for correct dimensions, alpha channel, and no accidental opaque background.

- [ ] **Step 3: Update release metadata.**

Set `manifest.json` version to `1.1`. Update README and release checklist commands to exclude `icon_source.png`. Update the checklist’s expected ZIP version to `1.1`. Keep the user-facing feature copy focused on weekly multi-day and monthly lessons, individual pause/resume, reliable alerts, and local privacy.

- [ ] **Step 4: Run metadata checks.**

Run:

```powershell
node --check background.js
node --check options.js
node --check schedule-utils.js
npx web-ext lint
```

Expected: no syntax errors and a clean web-ext lint result.

- [ ] **Step 5: Commit the icon and metadata slice.**

```powershell
git add icon_source.png icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png manifest.json README.md RELEASE.md ADDON_LISTING.md
git commit -m "feat: prepare Class Alert v1.1 assets and metadata"
```

### Task 5: Build, inspect, and manually verify the release artifact

**Files:**
- Create: ignored build output under `web-ext-artifacts/`
- Modify: none unless verification finds a defect

- [ ] **Step 1: Run the complete automated suite.**

```powershell
node --test tests/schedule-utils.test.js
node --check background.js
node --check options.js
node --check alert.js
node --check schedule-utils.js
npx web-ext lint
```

Expected: all tests pass and lint succeeds.

- [ ] **Step 2: Build the production ZIP.**

```powershell
npx web-ext build --overwrite-dest --ignore-files "docs/**" "tests/**" ".superpowers/**" "icon_source.png"
```

Expected: one ZIP in `web-ext-artifacts/`, with no source artwork, tests, docs, or development files.

- [ ] **Step 3: Inspect ZIP contents and manifest.**

Use PowerShell to inspect the generated ZIP. Confirm:

- Manifest ID is `class-alert@afkllc`.
- Manifest version is `1.1`.
- Four generated icons are present.
- `icon_source.png`, `icon-source.png`, `tests/`, `docs/`, and `.superpowers/` are absent.
- No private keys or environment files are present.

- [ ] **Step 4: Manually test in Firefox.**

Install the ZIP in Firefox and verify:

- New icon displays in the toolbar and extension manager.
- Weekly lesson with Monday and Wednesday alerts on both days.
- Editing selected weekdays changes the same lesson instead of creating a duplicate.
- Monthly day 31 alerts on February’s final day.
- Two month-end-conflicting lessons cannot be saved together.
- Pausing clears its alert; resuming restores the next alert.
- Deleting removes the lesson and its alert.
- Import/export preserves recurrence and paused state.
- Existing v1 configuration migrates and remains visible.
- Invalid migration shows a persistent, understandable banner.
- Alert tab, chime, Join Now, Dismiss, lead time, and themes still work.

- [ ] **Step 5: Commit only verified fixes, if needed.**

If verification finds a defect, add a focused test first, fix the narrowest responsible code, rerun the relevant checks, and commit with a specific message such as:

Stage only the exact source and test files changed by the verified fix, then commit with a specific message such as `fix: explain monthly recurrence conflict`. Do not stage the user’s icon source or unrelated formatting changes.

Do not commit build ZIPs or unrelated formatting changes.

## Plan self-review

Spec coverage:

- Product scope and deferred groups: Tasks 2 and 4.
- Versioned lesson model: Tasks 1 and 2.
- Weekly and monthly recurrence: Task 1.
- Editing and pause/resume: Task 2.
- Exact alarms, startup rebuild, clear behavior, and closed-browser boundary: Task 3.
- Conflict prevention and actionable errors: Tasks 1 and 2.
- Safe migration and visible errors: Task 2.
- New icon and v1.1 packaging: Task 4.
- Automated and manual release verification: Task 5.

The plan contains no unresolved placeholders. All public function names used by later tasks are defined in Task 1. The five review-focus failure modes each have tests in Tasks 1–3 and manual coverage in Task 5.
