# Class Alert v1.1 Recurrence and Icon Design

## Objective

Prepare Class Alert v1.1 for feedback from a tutoring company. The release must demonstrate useful lesson recurrence while preserving the product's core promise: save class schedules, receive reliable alerts, and join on time.

## Product boundary

v1.1 includes:

- A cleaner icon source and regenerated extension icons.
- Weekly lessons with one or more selected weekdays.
- Monthly lessons by calendar day.
- Last-day-of-month behavior for dates missing from shorter months.
- Editing every schedule field after creation.
- Pausing and resuming individual lessons without deleting them.
- Safe migration from the v1.0 schedule format.

v1.1 does not include:

- Every-N-weeks recurrence.
- Nth-weekday monthly rules.
- Custom date exceptions.
- Calendar integrations, cloud sync, or accounts.
- Features unrelated to class alerts.
- Collections or groups of lessons.

## User model

A saved lesson has one name, meeting URL, time, and recurrence rule. A weekly lesson can select several weekdays; one time applies to every selected weekday. Users create separate lessons when the times differ.

The form exposes a clear recurrence choice:

- Weekly: select at least one weekday.
- Monthly: select a day from 1 through 31. If that day does not exist in a month, use the month's final day.

Saved rows display the recurrence in plain language, for example `Math tutoring · Mon, Wed · 17:00` or `Essay review · Monthly on the 15th · 14:00`.

Edit mode loads and saves the class name, meeting URL, time, recurrence type, selected weekly weekdays, or monthly day. Saving an edit replaces the existing lesson and does not create a duplicate.

## Data model

Replace the weekday/time map as the canonical v1.1 model with a versioned list of lessons:

```js
{
  configVersion: 2,
  lessons: [
    {
      id: "stable-id",
      enabled: true,
      name: "Math tutoring",
      url: "https://example.test/class",
      time: "17:00",
      recurrence: {
        type: "weekly",
        days: [1, 3]
      }
    },
    {
      id: "stable-id-2",
      enabled: true,
      name: "Essay review",
      url: "https://example.test/class",
      time: "14:00",
      recurrence: {
        type: "monthly",
        dayOfMonth: 15,
        overflow: "last-day"
      }
    }
  ]
}
```

Weekday numbers preserve the existing convention: Sunday `0`, Monday `1`, through Saturday `6`. Weekly day arrays contain unique valid weekday numbers. Monthly day values are integers from `1` through `31`. Lesson IDs are stable within the stored configuration and are used to identify edits and alert occurrences.

Existing alert settings and theme settings remain top-level configuration values. The schedule migration must not alter them.

## Alert behavior

The alarm engine schedules one exact, one-shot `browser.alarms` alarm for the next occurrence of each enabled lesson. Alarm names use the stable lesson ID. The engine does not depend on `setInterval` or a background page remaining awake.

Firefox alarms are a wake-up mechanism, not a guarantee of millisecond-level delivery. The implementation must treat a requested alert less than one minute in the future as too close for a reliable schedule and show: `This class starts too soon for a reliable alert. Choose a time at least one minute from now.` The current Mozilla documentation does not establish a Firefox-specific one-minute clamp, so the implementation must verify accepted scheduling with `browser.alarms.get()` and handle rejection or adjustment explicitly.

The engine must:

- Rebuild alarms on install and browser startup because alarms do not persist across browser sessions.
- Rebuild alarms after add, edit, import, clear, pause, and resume operations.
- Clear the old lesson alarm before applying an edited time or recurrence.
- Call `browser.alarms.clear(lessonId)` when a lesson is deleted or paused.
- Recalculate and schedule the next occurrence after an alarm fires.
- Use the alarm's scheduled timestamp plus lesson ID to create an occurrence identity.
- Reconcile stored lessons and active alarms so stale alarms do not remain after failed updates.
- Keep alarms event-driven and remove the existing one-second polling loop.

If Firefox is fully closed, the extension cannot open an alert during that period. This limitation must be stated in release documentation.

- Weekly lessons match when the current weekday appears in `recurrence.days`.
- Monthly lessons match when the current day equals `dayOfMonth`, or when the current date is the final day of a shorter month and `dayOfMonth` exceeds the month length.
- Disabled lessons do not create or retain active alarms.
- Existing lead-time behavior remains unchanged.
- Existing sound, alert title, alert message, Join Now, and Dismiss behavior remains unchanged.
- Multiple lessons scheduled for the same minute each produce their own occurrence.
- An occurrence key includes lesson ID, calendar date, and scheduled time, preventing duplicate alerts for one lesson occurrence.
- Separate lessons remain separate alerts, even if month-end overflow maps them to the same date and time.

All date calculations use the browser's existing local-time behavior. Time-zone management is outside v1.1 scope.

## Conflict prevention

v1.1 models a lesson's occupied time as its scheduled start minute. It does not claim to detect duration-based overlap because lessons have no duration field.

Before saving or importing an enabled lesson, compare it with every other enabled lesson:

- Weekly lessons conflict when selected weekdays intersect and start times match.
- Monthly lessons conflict when their rules can produce the same calendar date and start time, including month-end overflow.
- Weekly and monthly lessons conflict when their recurrence rules can produce the same calendar date and start time.
- Different start times are allowed because duration is not modeled.
- Paused lessons do not reserve active alert slots. Resuming a lesson runs conflict validation again.

Reject conflicts. Error messages must name both lessons, the conflicting time, and the corrective action. Example: `Cannot save “Math tutoring.” It conflicts with “Reading support” on Mondays at 17:00. Choose another time or remove that day.`

For month-end collisions, use: `Cannot save “Essay review.” It can share a month-end alert with “Writing clinic” at 14:00. Choose another time or monthly day.`

## Migration and import/export

On upgrade, detect the v1.0 `classSchedule` map and convert every existing day/time/class entry into a v2 weekly lesson with `enabled: true`. Preserve name, URL, weekday, and time. Existing entries remain separate; migration must not guess that two old entries should be merged.

Validate the entire old schedule before replacing it. Save migrated data only after validation succeeds. Preserve the original configuration and a backup copy until the new configuration is safely stored. If migration finds invalid entries, keep the original v1 data available, store a persistent migration status with exact entry errors, and do not present migration as successful. The options page must show a persistent, plain-language banner when it opens, with a backup/export action and repair guidance. Console logging alone is not sufficient.

Export v2 configuration with `configVersion: 2`. Import accepts v2 configuration and automatically migrates valid v1 configuration. Import preserves `enabled: false` for paused lessons. Malformed recurrence rules, invalid URLs, invalid times, invalid day values, and conflicts must produce a clear error without partially replacing the current schedule.

## Icon and packaging

Use the new root `icon_source.png` as the source artwork. Preserve transparency and generate the existing manifest sizes: 16, 32, 48, and 128 pixels. Keep manifest paths stable where possible so Firefox receives the regenerated assets without unrelated changes.

The source artwork must be excluded from the release ZIP. Update development and release commands that currently exclude `icon-source.png` so they exclude `icon_source.png`. Set the manifest version to `1.1`.

## Testing and release acceptance

Add tests for:

- Weekly recurrence with one selected weekday.
- Weekly recurrence with multiple selected weekdays.
- Monthly recurrence on an existing calendar day.
- Monthly recurrence on the final day of February in leap and non-leap years.
- Monthly recurrence using the final day for day 29, 30, or 31 when required.
- No monthly alert on unrelated dates.
- Unique occurrence keys for separate lessons and separate dates.
- Migration from the v1.0 schedule map.
- Valid v2 import/export and rejection of malformed input.
- Editing recurrence without duplicate lessons.
- Pausing clears the lesson alarm and resuming rebuilds it.
- Deleting clears the lesson alarm.
- Alarm scheduling rejects or clearly reports a target less than one minute away.
- Weekly, monthly, and cross-type recurrence conflicts are rejected with actionable messages.
- Invalid migration preserves original data and exposes a visible migration status.

Before release, run JavaScript syntax checks, the complete Node test suite, `web-ext lint`, and a production ZIP build. Inspect the ZIP to confirm the manifest ID, version `1.1`, generated icons, excluded source artwork, and absence of development files. Manually test adding, editing, weekly multi-day alerts, monthly alerts, month-end behavior, import, export, and icon display in Firefox.

## Success criteria

The tutoring-company demo can show a user creating and editing weekly multi-day and monthly lessons, receiving the expected alert once per occurrence, and understanding the recurrence rule without explanation. Existing v1 schedules and backups continue to work. The interface remains centered on class alerts and does not introduce unrelated product complexity.

## Deferred group feature

Do not implement groups in v1.1. Revisit after tutoring-company feedback. If validated, a later version may add optional groups containing a name and enabled/paused state. Group pause would clear member alarms and group resume would revalidate conflicts before rebuilding them. Timing, recurrence, links, and alert copy remain lesson-specific. Deleting a group would remove membership only, never lessons.

## Platform references

- Mozilla alarms API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms
- Mozilla background scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts
