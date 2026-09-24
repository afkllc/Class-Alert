const test = require('node:test');
const assert = require('node:assert/strict');
const utils = require('../schedule-utils.js');

function localDate(year, month, day, hour, minute) {
    return new Date(year, month - 1, day, hour, minute, 0, 0);
}

test('getScheduledSlot keeps lesson date and slot at zero lead time', () => {
    assert.deepEqual(
        utils.getScheduledSlot(localDate(2026, 9, 21, 9, 0), 0),
        { dateKey: '2026-09-21', dayKey: '1', timeKey: '09:00' }
    );
});

test('getScheduledSlot shifts alert time to lesson slot for five-minute lead', () => {
    assert.deepEqual(
        utils.getScheduledSlot(localDate(2026, 9, 21, 8, 55), 5),
        { dateKey: '2026-09-21', dayKey: '1', timeKey: '09:00' }
    );
});

test('getScheduledSlot uses next calendar date when lead time crosses midnight', () => {
    assert.deepEqual(
        utils.getScheduledSlot(localDate(2026, 9, 21, 23, 55), 10),
        { dateKey: '2026-09-22', dayKey: '2', timeKey: '00:05' }
    );
});

test('createOccurrenceKey separates same class on different dates', () => {
    const classData = { name: 'Math 101', url: 'https://example.test/class' };
    const first = utils.createOccurrenceKey(
        { dateKey: '2026-09-21', dayKey: '1', timeKey: '09:00' },
        classData
    );
    const second = utils.createOccurrenceKey(
        { dateKey: '2026-09-28', dayKey: '1', timeKey: '09:00' },
        classData
    );
    assert.notEqual(first, second);
});

test('createOccurrenceKey separates different classes sharing one URL', () => {
    const slot = { dateKey: '2026-09-21', dayKey: '1', timeKey: '09:00' };
    assert.notEqual(
        utils.createOccurrenceKey(slot, { name: 'Math 101', url: 'https://example.test/class' }),
        utils.createOccurrenceKey(slot, { name: 'Physics 101', url: 'https://example.test/class' })
    );
});

test('pruneHandledOccurrences keeps recent records and removes older dates', () => {
    const records = {
        '2026-09-20|1|09:00|Math 101|https://example.test/class': '2026-09-20T09:00:00.000Z',
        '2026-09-01|1|09:00|Math 101|https://example.test/class': '2026-09-01T09:00:00.000Z'
    };
    const pruned = utils.pruneHandledOccurrences(records, '2026-09-20');
    assert.deepEqual(Object.keys(pruned), [
        '2026-09-20|1|09:00|Math 101|https://example.test/class'
    ]);
});

test('normalizeAlertSettings applies safe defaults and valid values', () => {
    const defaults = utils.DEFAULT_ALERT_SETTINGS;
    assert.deepEqual(utils.normalizeAlertSettings({
        soundEnabled: false,
        alertLeadMinutes: 10,
        alertTitle: '  Starting soon  ',
        alertMessage: '  Join class  ',
        showDismissButton: false
    }, defaults), {
        soundEnabled: false,
        alertLeadMinutes: 10,
        alertTitle: 'Starting soon',
        alertMessage: 'Join class',
        showDismissButton: false
    });
});

test('normalizeAlertSettings rejects invalid timing and bounds custom text', () => {
    const settings = utils.normalizeAlertSettings({
        soundEnabled: 'yes',
        alertLeadMinutes: 7,
        alertTitle: 'x'.repeat(200),
        alertMessage: '   ',
        showDismissButton: 'no'
    }, utils.DEFAULT_ALERT_SETTINGS);
    assert.equal(settings.alertLeadMinutes, 0);
    assert.equal(settings.alertTitle.length, 80);
    assert.equal(settings.alertMessage, utils.DEFAULT_ALERT_SETTINGS.alertMessage);
    assert.equal(settings.soundEnabled, true);
    assert.equal(settings.showDismissButton, true);
});

test('hasHandledOccurrence rejects an occurrence already stored', () => {
    const key = '2026-09-21|1|09:00|Math 101|https://example.test/class';
    assert.equal(utils.hasHandledOccurrence({}, key), false);
    assert.equal(utils.hasHandledOccurrence({ [key]: '2026-09-21T09:00:00.000Z' }, key), true);
});

test('normalizeAlertPresentation keeps safe alert copy and Dismiss setting', () => {
    assert.deepEqual(utils.normalizeAlertPresentation({
        className: '  Math 101  ',
        classUrl: 'https://example.test/class',
        title: '  Starting soon  ',
        message: '  Join class  ',
        showDismissButton: 'false'
    }), {
        className: 'Math 101',
        classUrl: 'https://example.test/class',
        title: 'Starting soon',
        message: 'Join class',
        showDismissButton: false
    });
});

test('normalizeAlertPresentation shows Dismiss by default', () => {
    assert.equal(utils.normalizeAlertPresentation({}).showDismissButton, true);
});

test('getRuntimeMinuteKey stays stable within a minute and changes at the boundary', () => {
    assert.equal(
        utils.getRuntimeMinuteKey(localDate(2026, 9, 21, 10, 30)),
        utils.getRuntimeMinuteKey(localDate(2026, 9, 21, 10, 30, 59))
    );
    assert.notEqual(
        utils.getRuntimeMinuteKey(localDate(2026, 9, 21, 10, 30, 59)),
        utils.getRuntimeMinuteKey(localDate(2026, 9, 21, 10, 31))
    );
});

test('getAlertCandidateSlots includes current and five-minute catch-up slots', () => {
    const slots = utils.getAlertCandidateSlots(localDate(2026, 9, 21, 10, 30, 12), 0, 5);
    assert.deepEqual(slots.map((slot) => slot.timeKey), [
        '10:25', '10:26', '10:27', '10:28', '10:29', '10:30'
    ]);
});

test('getEffectiveAlertTitle explains early alerts when default title remains selected', () => {
    assert.equal(
        utils.getEffectiveAlertTitle({ alertTitle: 'Class starting now', alertLeadMinutes: 5 }),
        'Class starts in 5 minutes'
    );
    assert.equal(
        utils.getEffectiveAlertTitle({ alertTitle: 'Join algebra', alertLeadMinutes: 10 }),
        'Join algebra'
    );
});

function lesson(overrides = {}) {
    return {
        id: 'lesson-1',
        enabled: true,
        name: 'Math',
        url: 'https://example.test/math',
        time: '09:00',
        recurrence: { type: 'weekly', days: [1] },
        ...overrides
    };
}

test('weekly lesson matches every selected weekday', () => {
    const item = lesson({ recurrence: { type: 'weekly', days: [1, 3] } });
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 9, 21, 9, 0)), true);
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 9, 22, 9, 0)), false);
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 9, 23, 9, 0)), true);
});

test('monthly day 31 uses final day in shorter months', () => {
    const item = lesson({ recurrence: { type: 'monthly', dayOfMonth: 31, overflow: 'last-day' } });
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 2, 28, 9, 0)), true);
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 2, 27, 9, 0)), false);
    assert.equal(utils.isLessonOccurrenceOnDate(item, localDate(2026, 4, 30, 9, 0)), true);
});

test('next occurrence uses local alert lead time', () => {
    const item = lesson({ recurrence: { type: 'weekly', days: [1] }, time: '09:00' });
    const next = utils.getNextLessonOccurrence(item, localDate(2026, 9, 20, 10, 0), 5);
    assert.equal(next.scheduledTime, '2026-09-21T09:00:00');
    assert.equal(next.alertTime, '2026-09-21T08:55:00');
});

test('date calculations do not mutate the caller date', () => {
    const from = localDate(2026, 9, 20, 10, 0);
    const before = from.getTime();
    utils.getNextLessonOccurrence(lesson(), from, 0);
    assert.equal(from.getTime(), before);
});

test('disabled lessons have no occurrence', () => {
    assert.equal(utils.getNextLessonOccurrence(lesson({ enabled: false }), new Date(2026, 8, 20, 10, 0), 0), null);
});

test('near-term occurrence is skipped in favor of next recurrence', () => {
    const item = lesson({ time: '17:00' });
    const now = new Date(2026, 8, 21, 16, 59, 15);
    const next = utils.getNextSchedulableOccurrence(item, now, 0, 60 * 1000);
    assert.equal(next.skippedImmediateOccurrence, true);
    assert.equal(next.dateKey, '2026-09-28');
    assert.equal(next.alertTime, '2026-09-28T17:00:00');
});

test('weekly lessons conflict when selected weekdays and times overlap', () => {
    const conflict = utils.lessonsConflict(
        lesson({ id: 'new', time: '17:00', recurrence: { type: 'weekly', days: [1, 3] } }),
        lesson({ id: 'old', time: '17:00', recurrence: { type: 'weekly', days: [3, 5] } })
    );
    assert.equal(conflict.conflict, true);
});

test('monthly overflow lessons conflict without calendar-cycle scanning', () => {
    const conflict = utils.lessonsConflict(
        lesson({ id: 'new', time: '17:00', recurrence: { type: 'monthly', dayOfMonth: 30, overflow: 'last-day' } }),
        lesson({ id: 'old', time: '17:00', recurrence: { type: 'monthly', dayOfMonth: 31, overflow: 'last-day' } })
    );
    assert.equal(conflict.conflict, true);
});

test('weekly and monthly lessons at same time conflict directly', () => {
    const conflict = utils.lessonsConflict(
        lesson({ id: 'new', time: '17:00' }),
        lesson({ id: 'old', time: '17:00', recurrence: { type: 'monthly', dayOfMonth: 15, overflow: 'last-day' } })
    );
    assert.equal(conflict.conflict, true);
});

test('different times do not conflict', () => {
    const conflict = utils.lessonsConflict(
        lesson({ time: '17:00' }),
        lesson({ time: '17:01' })
    );
    assert.equal(conflict.conflict, false);
});

test('legacy schedule migrates to enabled weekly lessons', () => {
    const result = utils.migrateLegacySchedule({
        '1': { '09:00': { name: 'Math', url: 'https://example.test/math' } }
    }, (() => {
        let next = 0;
        return () => `lesson-${++next}`;
    })());
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.lessons[0], {
        id: 'lesson-1',
        enabled: true,
        name: 'Math',
        url: 'https://example.test/math',
        time: '09:00',
        recurrence: { type: 'weekly', days: [1] }
    });
});

test('invalid legacy schedule returns errors without dropping source data', () => {
    const legacy = { '1': { '09:00': { name: '', url: 'not-a-url' } } };
    const result = utils.migrateLegacySchedule(legacy, () => 'lesson-1');
    assert.equal(result.lessons.length, 0);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.sourceBackup, legacy);
});

test('v2 config normalization preserves paused lessons', () => {
    const result = utils.normalizeConfig({
        configVersion: 2,
        lessons: [lesson({ enabled: false })]
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.lessons[0].enabled, false);
});

test('v2 config normalization reports conflicts before replacement', () => {
    const result = utils.normalizeConfig({
        configVersion: 2,
        lessons: [
            lesson({ id: 'one', name: 'Math' }),
            lesson({ id: 'two', name: 'Reading' })
        ]
    });
    assert.equal(result.lessons.length, 0);
    assert.match(result.errors[0], /Math/);
    assert.match(result.errors[0], /Reading/);
});

test('v2 config normalization rejects malformed recurrence data', () => {
    const result = utils.normalizeConfig({
        configVersion: 2,
        lessons: [lesson({ recurrence: { type: 'monthly', dayOfMonth: 0 } })]
    });
    assert.equal(result.lessons.length, 0);
    assert.match(result.errors[0], /monthly day/);
});

test('alarm plan schedules one active lesson alarm', () => {
    const item = lesson({ id: 'lesson-42', time: '17:00' });
    const plan = utils.getNextAlarmPlan(item, new Date(2026, 8, 21, 12, 0, 0), 0);
    assert.equal(plan.alarmName, 'lesson-42');
    assert.equal(plan.when, new Date(2026, 8, 21, 17, 0, 0).getTime());
    assert.equal(plan.occurrenceKey, 'lesson-42|2026-09-21|17:00');
    assert.equal(plan.skippedImmediateOccurrence, false);
});

test('alarm plan skips a too-soon occurrence without throwing', () => {
    const item = lesson({ id: 'lesson-42', time: '17:00' });
    const plan = utils.getNextAlarmPlan(item, new Date(2026, 8, 21, 16, 59, 15), 0);
    assert.equal(plan.when, new Date(2026, 8, 28, 17, 0, 0).getTime());
    assert.equal(plan.skippedImmediateOccurrence, true);
});

test('disabled lesson has no alarm plan', () => {
    assert.equal(utils.getNextAlarmPlan(lesson({ enabled: false }), new Date(), 0), null);
});
