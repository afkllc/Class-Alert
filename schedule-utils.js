(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.ClassAlertUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    const DEFAULT_ALERT_SETTINGS = {
        soundEnabled: true,
        alertLeadMinutes: 0,
        alertTitle: 'Class starting now',
        alertMessage: 'Your scheduled class is ready to join.',
        showDismissButton: true
    };
    const ALLOWED_LEAD_MINUTES = [0, 5, 10];
    const MAX_TITLE_LENGTH = 80;
    const MAX_MESSAGE_LENGTH = 240;
    const MAX_HANDLED_AGE_DAYS = 14;

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function dateKeyFromDate(date) {
        return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function getScheduledSlot(now, leadMinutes) {
        const scheduledTime = new Date(now.getTime() + (Number(leadMinutes) || 0) * 60 * 1000);
        return {
            dateKey: dateKeyFromDate(scheduledTime),
            dayKey: String(scheduledTime.getDay()),
            timeKey: pad(scheduledTime.getHours()) + ':' + pad(scheduledTime.getMinutes())
        };
    }

    function getRuntimeMinuteKey(date) {
        return dateKeyFromDate(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function getAlertCandidateSlots(now, leadMinutes, catchUpMinutes) {
        const slots = [];
        for (let offset = Number(catchUpMinutes) || 0; offset >= 0; offset -= 1) {
            const candidateTime = new Date(now.getTime() - offset * 60 * 1000);
            slots.push(getScheduledSlot(candidateTime, leadMinutes));
        }
        return slots;
    }

    function createOccurrenceKey(slot, classData) {
        return [
            slot.dateKey,
            slot.dayKey,
            slot.timeKey,
            String(classData.name).trim(),
            String(classData.url).trim()
        ].join('|');
    }

    function hasHandledOccurrence(records, occurrenceKey) {
        return Boolean(records && Object.prototype.hasOwnProperty.call(records, occurrenceKey));
    }

    function pruneHandledOccurrences(records, todayDateKey) {
        const today = new Date(todayDateKey + 'T00:00:00');
        const cutoff = new Date(today.getTime() - MAX_HANDLED_AGE_DAYS * 24 * 60 * 60 * 1000);
        const pruned = {};

        for (const [key, timestamp] of Object.entries(records || {})) {
            const recordDate = new Date(key.slice(0, 10) + 'T00:00:00');
            if (!Number.isNaN(recordDate.getTime()) && recordDate >= cutoff) {
                pruned[key] = timestamp;
            }
        }
        return pruned;
    }

    function boundedText(value, fallback, maxLength) {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed ? trimmed.slice(0, maxLength) : fallback;
    }

    function normalizeAlertSettings(settings, defaults = DEFAULT_ALERT_SETTINGS) {
        const source = settings && typeof settings === 'object' && !Array.isArray(settings)
            ? settings
            : {};
        const safeDefaults = { ...DEFAULT_ALERT_SETTINGS, ...defaults };
        return {
            soundEnabled: typeof source.soundEnabled === 'boolean'
                ? source.soundEnabled
                : safeDefaults.soundEnabled,
            alertLeadMinutes: ALLOWED_LEAD_MINUTES.includes(Number(source.alertLeadMinutes))
                ? Number(source.alertLeadMinutes)
                : safeDefaults.alertLeadMinutes,
            alertTitle: boundedText(source.alertTitle, safeDefaults.alertTitle, MAX_TITLE_LENGTH),
            alertMessage: boundedText(source.alertMessage, safeDefaults.alertMessage, MAX_MESSAGE_LENGTH),
            showDismissButton: typeof source.showDismissButton === 'boolean'
                ? source.showDismissButton
                : safeDefaults.showDismissButton
        };
    }

    function normalizeAlertPresentation(data) {
        const source = data && typeof data === 'object' ? data : {};
        return {
            className: boundedText(source.className, 'Scheduled Class', 200),
            classUrl: typeof source.classUrl === 'string' ? source.classUrl : '',
            title: boundedText(source.title, DEFAULT_ALERT_SETTINGS.alertTitle, MAX_TITLE_LENGTH),
            message: boundedText(source.message, DEFAULT_ALERT_SETTINGS.alertMessage, MAX_MESSAGE_LENGTH),
            showDismissButton: source.showDismissButton === undefined
                ? true
                : source.showDismissButton === true || source.showDismissButton === 'true'
        };
    }

    function getEffectiveAlertTitle(settings) {
        const leadMinutes = Number(settings.alertLeadMinutes) || 0;
        if (settings.alertTitle === DEFAULT_ALERT_SETTINGS.alertTitle && leadMinutes > 0) {
            return 'Class starts in ' + leadMinutes + ' minutes';
        }
        return settings.alertTitle;
    }

    return {
        DEFAULT_ALERT_SETTINGS,
        ALLOWED_LEAD_MINUTES,
        MAX_TITLE_LENGTH,
        MAX_MESSAGE_LENGTH,
        getRuntimeMinuteKey,
        getAlertCandidateSlots,
        getScheduledSlot,
        createOccurrenceKey,
        hasHandledOccurrence,
        pruneHandledOccurrences,
        normalizeAlertSettings,
        normalizeAlertPresentation,
        getEffectiveAlertTitle
    };
});
