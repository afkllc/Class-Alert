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
- Safe migration from the v1.0 schedule format.

v1.1 does not include:

- Every-N-weeks recurrence.
- Nth-weekday monthly rules.
- Custom date exceptions.
- Calendar integrations, cloud sync, or accounts.
- Features unrelated to class alerts.

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

The alarm engine evaluates each lesson against the current local calendar date and time.

- Weekly lessons match when the current weekday appears in `recurrence.days`.
- Monthly lessons match when the current day equals `dayOfMonth`, or when the current date is the final day of a shorter month and `dayOfMonth` exceeds the month length.
- Existing lead-time behavior remains unchanged.
- Existing sound, alert title, alert message, Join Now, and Dismiss behavior remains unchanged.
- Multiple lessons scheduled for the same minute each produce their own occurrence.
- An occurrence key includes lesson ID, calendar date, and scheduled time, preventing duplicate alerts for one lesson occurrence.
- Existing alarm catch-up and handled-occurrence pruning remain supported.

All date calculations use the browser's existing local-time behavior. Time-zone management is outside v1.1 scope.

## Migration and import/export

On upgrade, detect the v1.0 `classSchedule` map and convert every existing day/time/class entry into a v2 weekly lesson. Preserve name, URL, weekday, and time. Existing entries remain separate; migration must not guess that two old entries should be merged.

Save migrated data only after validation succeeds. Preserve the original configuration until the new configuration is safely stored. Invalid entries must be reported rather than silently discarded.

Export v2 configuration with `configVersion: 2`. Import accepts v2 configuration and automatically migrates valid v1 configuration. Malformed recurrence rules, invalid URLs, invalid times, and invalid day values must produce a clear error without partially replacing the current schedule.

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

Before release, run JavaScript syntax checks, the complete Node test suite, `web-ext lint`, and a production ZIP build. Inspect the ZIP to confirm the manifest ID, version `1.1`, generated icons, excluded source artwork, and absence of development files. Manually test adding, editing, weekly multi-day alerts, monthly alerts, month-end behavior, import, export, and icon display in Firefox.

## Success criteria

The tutoring-company demo can show a user creating and editing weekly multi-day and monthly lessons, receiving the expected alert once per occurrence, and understanding the recurrence rule without explanation. Existing v1 schedules and backups continue to work. The interface remains centered on class alerts and does not introduce unrelated product complexity.
