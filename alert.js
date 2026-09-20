document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const presentation = ClassAlertUtils.normalizeAlertPresentation({
        className: urlParams.get('name'),
        classUrl: urlParams.get('url'),
        title: urlParams.get('title'),
        message: urlParams.get('message'),
        showDismissButton: urlParams.get('showDismissButton')
    });

    const titleElement = document.getElementById('display-alert-title');
    const classNameElement = document.getElementById('display-class-name');
    const messageElement = document.getElementById('display-alert-message');
    const joinButton = document.getElementById('btn-join-trigger');
    const dismissButton = document.getElementById('btn-dismiss-trigger');

    titleElement.textContent = presentation.title;
    classNameElement.textContent = presentation.className;
    messageElement.textContent = presentation.message;
    dismissButton.hidden = !presentation.showDismissButton;

    const audioAlarm = new Audio('chime.mp3');
    audioAlarm.loop = true;
    audioAlarm.volume = 1.0;

    if (urlParams.get('soundEnabled') !== 'false') {
        audioAlarm.play().catch(() => {});
    }

    let actionTaken = false;
    function stopAlert() {
        audioAlarm.pause();
        audioAlarm.removeAttribute('src');
    }

    function closeAlert() {
        stopAlert();
        window.close();
    }

    dismissButton.addEventListener('click', () => {
        if (actionTaken) return;
        actionTaken = true;
        closeAlert();
    });

    joinButton.addEventListener('click', () => {
        if (actionTaken) return;
        actionTaken = true;
        stopAlert();

        if (!isAllowedTargetUrl(presentation.classUrl)) {
            window.close();
            return;
        }

        browser.windows.getCurrent().then((currentWindow) => {
            return browser.tabs.create({
                url: presentation.classUrl,
                active: true,
                windowId: currentWindow.id
            });
        }).then((createdTab) => {
            browser.tabs.update(createdTab.id, { active: true });
            browser.windows.update(createdTab.windowId, { focused: true });
            window.close();
        }).catch(() => {
            window.close();
        });
    });

    joinButton.focus();
});

function isAllowedTargetUrl(value) {
    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch (error) {
        return false;
    }
}
