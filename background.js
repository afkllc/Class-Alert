const DEFAULT_ALERT_SETTINGS = ClassAlertUtils.DEFAULT_ALERT_SETTINGS;
const CONFIG_VERSION = 2;

browser.runtime.onInstalled.addListener(() => {
    ensureScheduleStorage().then(rebuildLessonAlarms).catch((error) => {
        console.error('Class Alert could not prepare its schedule:', error);
    });
});

browser.runtime.onStartup.addListener(() => {
    rebuildLessonAlarms().catch((error) => {
        console.error('Class Alert could not rebuild its alarms:', error);
    });
});

browser.runtime.onMessage.addListener((message) => {
    if (!message || ![
        'scheduleChanged',
        'lessonDeleted',
        'lessonPaused',
        'lessonResumed',
        'clearAllLessons'
    ].includes(message.type)) return undefined;

    return rebuildLessonAlarms().catch((error) => {
        console.error('Class Alert could not update its alarms:', error);
    });
});

browser.alarms.onAlarm.addListener((alarm) => {
    handleLessonAlarm(alarm).catch((error) => {
        console.error('Class Alert could not handle its alarm:', error);
    });
});

async function ensureScheduleStorage() {
    const result = await browser.storage.local.get({ configVersion: null, lessons: null, classSchedule: null });
    if (result.configVersion === CONFIG_VERSION && Array.isArray(result.lessons)) return;

    if (result.classSchedule !== null) {
        const migrated = ClassAlertUtils.migrateLegacySchedule(result.classSchedule || {});
        const values = {
            configVersion: CONFIG_VERSION,
            lessons: migrated.lessons,
            legacyScheduleBackup: migrated.sourceBackup
        };
        if (migrated.errors.length) {
            values.migrationStatus = { errors: migrated.errors, createdAt: new Date().toISOString() };
        }
        await browser.storage.local.set(values);
        return;
    }

    await browser.storage.local.set({ configVersion: CONFIG_VERSION, lessons: [] });
}

async function readSchedule() {
    await ensureScheduleStorage();
    return browser.storage.local.get({
        configVersion: CONFIG_VERSION,
        lessons: [],
        alertSettings: DEFAULT_ALERT_SETTINGS,
        handledAlertOccurrences: {}
    });
}

async function rebuildLessonAlarms() {
    const result = await readSchedule();
    const lessons = Array.isArray(result.lessons) ? result.lessons : [];
    const enabledIds = new Set(lessons.filter((lesson) => lesson.enabled !== false).map((lesson) => lesson.id));
    const existingAlarms = await browser.alarms.getAll();

    await Promise.all(existingAlarms.map((alarm) => {
        if (alarm.name === 'persistentWakeup' || !enabledIds.has(alarm.name)) return browser.alarms.clear(alarm.name);
        return browser.alarms.clear(alarm.name);
    }));

    const settings = ClassAlertUtils.normalizeAlertSettings(result.alertSettings, DEFAULT_ALERT_SETTINGS);
    await Promise.all(lessons.filter((lesson) => lesson.enabled !== false).map((lesson) => scheduleLessonAlarm(lesson, settings)));
}

async function scheduleLessonAlarm(lesson, settings) {
    const plan = ClassAlertUtils.getNextAlarmPlan(lesson, new Date(), settings.alertLeadMinutes);
    if (!plan) return;

    await browser.alarms.create(plan.alarmName, { when: plan.when });
    const scheduledAlarm = await browser.alarms.get(plan.alarmName);
    if (!scheduledAlarm || scheduledAlarm.scheduledTime < Date.now()) {
        await browser.alarms.clear(plan.alarmName);
        throw new Error(`Firefox did not accept a future alert time for ${lesson.name}.`);
    }
}

async function handleLessonAlarm(alarm) {
    if (!alarm || alarm.name === 'persistentWakeup') return;

    const result = await readSchedule();
    const lesson = result.lessons.find((item) => item.id === alarm.name);
    if (!lesson || lesson.enabled === false) {
        await browser.alarms.clear(alarm.name);
        return;
    }

    const settings = ClassAlertUtils.normalizeAlertSettings(result.alertSettings, DEFAULT_ALERT_SETTINGS);
    const occurrence = ClassAlertUtils.getNextLessonOccurrence(
        lesson,
        new Date(alarm.scheduledTime - 1),
        settings.alertLeadMinutes
    );
    if (!occurrence) {
        await scheduleLessonAlarm(lesson, settings);
        return;
    }

    const occurrenceKey = ClassAlertUtils.createLessonOccurrenceKey(lesson.id, occurrence.dateKey, occurrence.scheduledTime);
    const handledOccurrences = ClassAlertUtils.pruneHandledOccurrences(
        result.handledAlertOccurrences,
        occurrence.dateKey
    );
    if (!ClassAlertUtils.hasHandledOccurrence(handledOccurrences, occurrenceKey)) {
        handledOccurrences[occurrenceKey] = new Date().toISOString();
        await browser.storage.local.set({ handledAlertOccurrences: handledOccurrences });
        try {
            await openAlertTab(lesson.name, lesson.url, {
                ...settings,
                alertTitle: ClassAlertUtils.getEffectiveAlertTitle(settings)
            });
        } catch (error) {
            delete handledOccurrences[occurrenceKey];
            await browser.storage.local.set({ handledAlertOccurrences: handledOccurrences });
            await browser.storage.local.set({ lastAlarmError: {
                message: 'Class Alert could not open one alert. The lesson remains scheduled and will be retried at its next occurrence.',
                lessonId: lesson.id,
                createdAt: new Date().toISOString()
            } });
            console.error('Class Alert could not open alert tab:', error);
        }
    }

    await scheduleLessonAlarm(lesson, settings);
}

function openAlertTab(className, classUrl, settings) {
    const alertParams = new URLSearchParams({
        name: className,
        url: classUrl,
        title: settings.alertTitle,
        message: settings.alertMessage,
        showDismissButton: String(settings.showDismissButton),
        soundEnabled: String(settings.soundEnabled)
    });
    const targetAlertUrl = browser.runtime.getURL('alert.html?' + alertParams.toString());

    return browser.windows.getCurrent().then((currentWindow) => {
        return browser.tabs.create({ url: targetAlertUrl, active: true, windowId: currentWindow.id });
    }).then((createdTab) => {
        browser.tabs.update(createdTab.id, { active: true }).catch(() => {});
        browser.windows.update(createdTab.windowId, { focused: true }).catch(() => {});
        return createdTab;
    });
}

browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
});
