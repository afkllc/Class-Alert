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
    const MIN_ALARM_LEAD_MS = 60 * 1000;

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
            const dateMatch = key.match(/(?:^|\|)(\d{4}-\d{2}-\d{2})(?:\||$)/);
            const recordDate = new Date((dateMatch ? dateMatch[1] : key.slice(0, 10)) + 'T00:00:00');
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

    function isAllowedClassUrl(value) {
        try {
            const parsedUrl = new URL(value);
            return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    function createLessonId() {
        if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
            return globalThis.crypto.randomUUID();
        }
        return 'lesson-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    function normalizeLesson(input, idFactory = createLessonId) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new Error('Class entry is invalid.');
        }

        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 200) throw new Error('Enter a class name up to 200 characters.');

        const url = typeof input.url === 'string' ? input.url.trim() : '';
        if (!isAllowedClassUrl(url)) throw new Error('Use a valid HTTP or HTTPS meeting link.');

        const time = typeof input.time === 'string' ? input.time : '';
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            throw new Error('Choose a valid class time.');
        }

        const sourceRecurrence = input.recurrence;
        if (!sourceRecurrence || typeof sourceRecurrence !== 'object') {
            throw new Error('Choose how often this class repeats.');
        }

        let recurrence;
        if (sourceRecurrence.type === 'weekly') {
            const days = Array.isArray(sourceRecurrence.days)
                ? [...new Set(sourceRecurrence.days.map(Number))].sort((a, b) => a - b)
                : [];
            if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
                throw new Error('Choose at least one weekday.');
            }
            recurrence = { type: 'weekly', days };
        } else if (sourceRecurrence.type === 'monthly') {
            const dayOfMonth = Number(sourceRecurrence.dayOfMonth);
            if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
                throw new Error('Choose a monthly day from 1 to 31.');
            }
            recurrence = { type: 'monthly', dayOfMonth, overflow: 'last-day' };
        } else {
            throw new Error('Choose Weekly or Monthly repetition.');
        }

        const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : idFactory();
        return {
            id,
            enabled: input.enabled !== false,
            name,
            url,
            time,
            recurrence
        };
    }

    function normalizeLessons(input, idFactory = createLessonId) {
        if (!Array.isArray(input)) {
            return { lessons: [], errors: ['Schedule data must be a list of lessons.'] };
        }

        const lessons = [];
        const errors = [];
        input.forEach((item, index) => {
            try {
                lessons.push(normalizeLesson(item, idFactory));
            } catch (error) {
                errors.push(`Lesson ${index + 1}: ${error.message}`);
            }
        });
        return { lessons, errors };
    }

    function normalizeConfig(config, idFactory = createLessonId) {
        if (!config || config.configVersion !== 2) {
            return { lessons: [], errors: ['This configuration file is not supported. Export a new Class Alert configuration.'] };
        }

        const normalized = normalizeLessons(config.lessons, idFactory);
        if (normalized.errors.length) return normalized;

        const errors = [];
        for (let index = 0; index < normalized.lessons.length; index += 1) {
            for (let otherIndex = index + 1; otherIndex < normalized.lessons.length; otherIndex += 1) {
                const first = normalized.lessons[index];
                const second = normalized.lessons[otherIndex];
                const conflict = lessonsConflict(first, second);
                if (conflict.conflict) {
                    errors.push(`“${first.name}” conflicts with “${second.name}” at ${first.time}. Choose another time or recurrence.`);
                }
            }
        }
        return errors.length ? { lessons: [], errors } : { lessons: normalized.lessons, errors: [] };
    }

    function cloneJson(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function migrateLegacySchedule(classSchedule, idFactory = createLessonId) {
        const sourceBackup = cloneJson(classSchedule || {});
        const lessons = [];
        const errors = [];

        if (!classSchedule || typeof classSchedule !== 'object' || Array.isArray(classSchedule)) {
            return { lessons, errors: ['Your previous schedule is not in a readable format.'], sourceBackup };
        }

        for (const [day, classes] of Object.entries(classSchedule)) {
            if (!/^[0-6]$/.test(day) || !classes || typeof classes !== 'object' || Array.isArray(classes)) {
                errors.push(`Day ${day} has invalid class data.`);
                continue;
            }
            for (const [time, classData] of Object.entries(classes)) {
                try {
                    lessons.push(normalizeLesson({
                        id: idFactory(),
                        enabled: true,
                        name: classData && classData.name,
                        url: classData && classData.url,
                        time,
                        recurrence: { type: 'weekly', days: [Number(day)] }
                    }, idFactory));
                } catch (error) {
                    errors.push(`${day} ${time}: ${error.message}`);
                }
            }
        }

        return { lessons, errors, sourceBackup };
    }

    function daysInMonth(year, monthIndex) {
        return new Date(year, monthIndex + 1, 0).getDate();
    }

    function dateKeyFromLocalDate(date) {
        return dateKeyFromDate(date);
    }

    function localTimestamp(date) {
        return dateKeyFromDate(date) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':00';
    }

    function buildScheduledDate(date, time) {
        const [hours, minutes] = time.split(':').map(Number);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
    }

    function isLessonOccurrenceOnDate(lesson, date) {
        if (!lesson || lesson.enabled === false || !lesson.recurrence) return false;
        if (lesson.recurrence.type === 'weekly') {
            return lesson.recurrence.days.includes(date.getDay());
        }
        if (lesson.recurrence.type === 'monthly') {
            const lastDay = daysInMonth(date.getFullYear(), date.getMonth());
            return date.getDate() === Math.min(lesson.recurrence.dayOfMonth, lastDay);
        }
        return false;
    }

    function getNextLessonOccurrence(lesson, fromDate, leadMinutes) {
        if (!lesson || lesson.enabled === false) return null;
        const start = new Date(fromDate.getTime());
        const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0);
        const maxDays = lesson.recurrence.type === 'weekly' ? 7 : 31;

        for (let offset = 0; offset <= maxDays; offset += 1) {
            const candidateDate = new Date(cursor.getTime());
            candidateDate.setDate(cursor.getDate() + offset);
            if (!isLessonOccurrenceOnDate(lesson, candidateDate)) continue;

            const scheduledDate = buildScheduledDate(candidateDate, lesson.time);
            if (scheduledDate <= start) continue;
            const alertDate = new Date(scheduledDate.getTime() - (Number(leadMinutes) || 0) * 60 * 1000);
            return {
                date: new Date(candidateDate.getTime()),
                dateKey: dateKeyFromLocalDate(candidateDate),
                scheduledTime: localTimestamp(scheduledDate),
                alertTime: localTimestamp(alertDate),
                alertDate
            };
        }
        return null;
    }

    function getNextSchedulableOccurrence(lesson, fromDate, leadMinutes, minimumLeadMs = MIN_ALARM_LEAD_MS) {
        if (!lesson || lesson.enabled === false) return null;
        let cursor = new Date(fromDate.getTime());
        let skippedImmediateOccurrence = false;

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const next = getNextLessonOccurrence(lesson, cursor, leadMinutes);
            if (!next) return null;
            if (next.alertDate.getTime() >= fromDate.getTime() + minimumLeadMs) {
                return { ...next, skippedImmediateOccurrence };
            }
            skippedImmediateOccurrence = true;
            cursor = new Date(next.date.getTime() + 24 * 60 * 60 * 1000);
        }
        return null;
    }

    function lessonsConflict(candidate, existing) {
        if (!candidate || !existing || candidate.enabled === false || existing.enabled === false) {
            return { conflict: false, reason: '' };
        }
        if (candidate.time !== existing.time) return { conflict: false, reason: '' };

        const candidateType = candidate.recurrence.type;
        const existingType = existing.recurrence.type;
        if (candidateType === 'weekly' && existingType === 'weekly') {
            const overlaps = candidate.recurrence.days.some((day) => existing.recurrence.days.includes(day));
            return { conflict: overlaps, reason: overlaps ? 'shared weekday' : '' };
        }
        if (candidateType === 'monthly' && existingType === 'monthly') {
            const lengths = [28, 29, 30, 31];
            const overlaps = lengths.some((length) => (
                Math.min(candidate.recurrence.dayOfMonth, length)
                === Math.min(existing.recurrence.dayOfMonth, length)
            ));
            return { conflict: overlaps, reason: overlaps ? 'shared monthly date' : '' };
        }
        return { conflict: true, reason: 'weekly and monthly dates can overlap' };
    }

    function findLessonConflict(candidate, lessons, excludeId) {
        for (const existing of lessons || []) {
            if (existing.id === excludeId) continue;
            const result = lessonsConflict(candidate, existing);
            if (result.conflict) {
                return { conflict: true, lesson: existing, message: result.reason };
            }
        }
        return null;
    }

    function createLessonOccurrenceKey(lessonId, occurrenceDate, scheduledTime) {
        const dateKey = occurrenceDate instanceof Date
            ? dateKeyFromDate(occurrenceDate)
            : String(occurrenceDate).slice(0, 10);
        return [String(lessonId), dateKey, String(scheduledTime).slice(11, 16)].join('|');
    }

    function getNextAlarmPlan(lesson, now, leadMinutes) {
        const next = getNextSchedulableOccurrence(lesson, now, leadMinutes, MIN_ALARM_LEAD_MS);
        if (!next) return null;
        return {
            alarmName: lesson.id,
            when: next.alertDate.getTime(),
            occurrenceKey: createLessonOccurrenceKey(lesson.id, next.dateKey, next.scheduledTime),
            skippedImmediateOccurrence: Boolean(next.skippedImmediateOccurrence)
        };
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
        getEffectiveAlertTitle,
        MIN_ALARM_LEAD_MS,
        isAllowedClassUrl,
        normalizeLesson,
        normalizeLessons,
        normalizeConfig,
        migrateLegacySchedule,
        isLessonOccurrenceOnDate,
        getNextLessonOccurrence,
        getNextSchedulableOccurrence,
        lessonsConflict,
        findLessonConflict,
        createLessonOccurrenceKey,
        getNextAlarmPlan
    };
});
