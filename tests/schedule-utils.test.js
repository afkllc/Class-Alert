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
