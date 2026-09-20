// Empty first-run schedule. Users add their own classes through the options page.
const CLASS_SCHEDULE = {};
const DEFAULT_ALERT_SETTINGS = ClassAlertUtils.DEFAULT_ALERT_SETTINGS;
const ALERT_CATCH_UP_MINUTES = 5;

let lastTriggeredSlot = "";

browser.runtime.onInstalled.addListener(() => {
    browser.storage.local.get({ classSchedule: null }).then((result) => {
        if (result.classSchedule === null) {
            return browser.storage.local.set({ classSchedule: CLASS_SCHEDULE });
        }
    }).then(() => {
        keepExtensionAlive();
    });
});

browser.runtime.onStartup.addListener(() => {
    keepExtensionAlive();
});

function keepExtensionAlive() {
    browser.alarms.create("persistentWakeup", { periodInMinutes: 1 });
}

browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "persistentWakeup") {
        checkSchedule();
    }
});

setInterval(() => {
    checkSchedule();
}, 1000);

function checkSchedule() {
    const now = new Date();
    const runtimeSlot = ClassAlertUtils.getRuntimeMinuteKey(now);
    if (lastTriggeredSlot === runtimeSlot) return;
    lastTriggeredSlot = runtimeSlot;

    browser.storage.local.get({
        classSchedule: {},
        alertSettings: DEFAULT_ALERT_SETTINGS,
        handledAlertOccurrences: {}
    }).then(async (result) => {
        const settings = ClassAlertUtils.normalizeAlertSettings(result.alertSettings, DEFAULT_ALERT_SETTINGS);
        const schedule = result.classSchedule;
        const handledOccurrences = ClassAlertUtils.pruneHandledOccurrences(
            result.handledAlertOccurrences,
            ClassAlertUtils.getScheduledSlot(now, 0).dateKey
        );

        for (const scheduledSlot of ClassAlertUtils.getAlertCandidateSlots(
            now,
            settings.alertLeadMinutes,
            ALERT_CATCH_UP_MINUTES
        )) {
            const currentClass = schedule[scheduledSlot.dayKey] && schedule[scheduledSlot.dayKey][scheduledSlot.timeKey];
            if (!currentClass) continue;

            const occurrenceKey = ClassAlertUtils.createOccurrenceKey(scheduledSlot, currentClass);
            if (ClassAlertUtils.hasHandledOccurrence(handledOccurrences, occurrenceKey)) continue;

            handledOccurrences[occurrenceKey] = new Date().toISOString();
            await browser.storage.local.set({ handledAlertOccurrences: handledOccurrences });

            try {
                const alertSettings = {
                    ...settings,
                    alertTitle: ClassAlertUtils.getEffectiveAlertTitle(settings)
                };
                await openAlertTab(currentClass.name, currentClass.url, alertSettings);
            } catch (error) {
                delete handledOccurrences[occurrenceKey];
                await browser.storage.local.set({ handledAlertOccurrences: handledOccurrences });
                console.error('Class Alert could not open alert tab:', error);
            }
        }
    }).catch((error) => {
        console.error('Class Alert schedule check failed:', error);
    });
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
