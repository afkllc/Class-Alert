document.addEventListener('DOMContentLoaded', () => {
    // 1. EXTRACT DATA PARAMETERS FROM TRANSITION URL STRING
    const urlParams = new URLSearchParams(window.location.search);
    const className = urlParams.get('name') || "Scheduled Class";
    const classTargetUrl = urlParams.get('url');

    const titleElement = document.getElementById('display-class-name');
    const joinButton = document.getElementById('btn-join-trigger');

    titleElement.innerText = className;

    const DEFAULT_ALERT_SETTINGS = {
        soundEnabled: true,
        skipIfClassTabOpen: true
    };

    // 2. ENCAPSULATED PERSISTENT AUDIO LIFECYCLE ENGINE
    const audioAlarm = new Audio("chime.mp3");
    audioAlarm.loop = true; // Continuous loop play out
    audioAlarm.volume = 1.0;

    // Fire sound loop instantly. Unblocked safely since the screen is a foreground document.
    browser.storage.local.get({ alertSettings: DEFAULT_ALERT_SETTINGS }).then((result) => {
        const settings = { ...DEFAULT_ALERT_SETTINGS, ...result.alertSettings };
        if (!settings.soundEnabled) return;

        audioAlarm.play().catch(err => {
            console.log("Audio waiting for safety verification signal click:", err);
        });
    });

    // 3. ACTION EVENT INTERCEPT ROUTER
    joinButton.addEventListener('click', () => {
        // Halt sound loop immediately upon acknowledgment 
        audioAlarm.pause();
        audioAlarm.src = ""; // Clears audio cache allocation streams

        if (isAllowedTargetUrl(classTargetUrl)) {
            // Open the class without overwriting the alert tab
            browser.windows.getCurrent().then((currentWindow) => {
                return browser.tabs.create({ url: classTargetUrl, active: true, windowId: currentWindow.id });
            }).then((createdTab) => {
                browser.tabs.update(createdTab.id, { active: true });
                browser.windows.update(createdTab.windowId, { focused: true });
                window.close();
            });
        } else {
            // Fail safe fallback routing strategy
            window.close();
        }
    });
});

function isAllowedTargetUrl(value) {
    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch (error) {
        return false;
    }
}
