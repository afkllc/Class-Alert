// Empty first-run schedule. Users add their own classes through the options page.
const CLASS_SCHEDULE = {};
const DEFAULT_ALERT_SETTINGS = {
    soundEnabled: true,
    skipIfClassTabOpen: true
};

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

// Alarm keeps background instance running hot so the sub-second ticker never stalls
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "persistentWakeup") {
        checkSchedule(true);
    }
});

// Check every second while background context stays active. Alarm handler below
// remains fallback when Firefox suspends this context.
setInterval(() => {
    checkSchedule(false);
}, 1000);

function checkSchedule(forceCheck) {
    const now = new Date();
    if (!forceCheck && now.getSeconds() !== 0) return;

    const currentDay = now.getDay().toString();
    const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"
    const currentSlot = `${currentDay}:${currentTimeStr}`;

    if (lastTriggeredSlot === currentSlot) return;
    lastTriggeredSlot = currentSlot;

    browser.storage.local.get({ classSchedule: {}, alertSettings: DEFAULT_ALERT_SETTINGS }).then((result) => {
        const schedule = result.classSchedule;
        const currentClass = schedule[currentDay] && schedule[currentDay][currentTimeStr];

        if (!currentClass) return;
        const settings = { ...DEFAULT_ALERT_SETTINGS, ...result.alertSettings };
        shouldSkipAlert(currentClass.url, settings).then((skipAlert) => {
            if (!skipAlert) openAlertTab(currentClass.name, currentClass.url);
        });
    });
}

function shouldSkipAlert(classUrl, settings) {
    if (!settings.skipIfClassTabOpen || !isAllowedClassUrl(classUrl)) {
        return Promise.resolve(false);
    }

    return browser.tabs.query({}).then((tabs) => {
        const targetUrl = new URL(classUrl);
        return tabs.some((tab) => urlsLookLikeSameClass(tab.url, targetUrl));
    }).catch(() => false);
}

function urlsLookLikeSameClass(tabUrl, targetUrl) {
    if (!isAllowedClassUrl(tabUrl)) return false;

    const parsedTabUrl = new URL(tabUrl);
    if (parsedTabUrl.hostname !== targetUrl.hostname) return false;

    const tabPath = parsedTabUrl.pathname.replace(/\/$/, "");
    const targetPath = targetUrl.pathname.replace(/\/$/, "");
    return tabPath === targetPath || targetPath === "" || targetPath === "/";
}

function isAllowedClassUrl(value) {
    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function openAlertTab(className, classUrl) {
    // Open the alert without overwriting the current tab
    const targetAlertUrl = browser.runtime.getURL(`alert.html?name=${encodeURIComponent(className)}&url=${encodeURIComponent(classUrl)}`);
    browser.windows.getCurrent().then((currentWindow) => {
        browser.tabs.create({ url: targetAlertUrl, active: true, windowId: currentWindow.id }).then((createdTab) => {
            browser.tabs.update(createdTab.id, { active: true });
            browser.windows.update(createdTab.windowId, { focused: true });
        });
    });
}

// Direct Extension Toolbar Icon Click Fallback
browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
});
