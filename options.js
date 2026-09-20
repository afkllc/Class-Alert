const saveBtn = document.getElementById('save');
const clearBtn = document.getElementById('clear-all');
const statusDiv = document.getElementById('status');
const listDiv = document.getElementById('schedule-list');
const themeWidget = document.getElementById('theme-widget-trigger');
const cancelBtn = document.getElementById('cancel-edit');
const exportBtn = document.getElementById('export-config');
const importBtn = document.getElementById('import-config');
const importFile = document.getElementById('import-file');
const soundEnabledInput = document.getElementById('sound-enabled');
const skipIfClassTabOpenInput = document.getElementById('skip-if-class-tab-open');

const dayNames = { "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "0": "Sunday" };
let statusTimeoutId = null;

// The Order cycle of our unified single-button toggle loop
const THEME_ROTATION = ['system', 'light', 'dark'];
const CONFIG_VERSION = 1;
const MAX_CONFIG_BYTES = 1024 * 1024;
const DEFAULT_ALERT_SETTINGS = {
    soundEnabled: true,
    skipIfClassTabOpen: true
};
let editingClass = null;

document.addEventListener('DOMContentLoaded', () => {
    displaySchedule();
    // Load and set the initial theme state
    browser.storage.local.get({ activeThemeMode: 'system' }).then((result) => {
        applyThemeEngine(result.activeThemeMode);
    });
    loadAlertSettings();
});

// SINGLE ICON CYCLE HANDLER (Tapping shifts modes sequentially)
themeWidget.addEventListener('click', cycleThemeMode);
themeWidget.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    cycleThemeMode();
});

function cycleThemeMode() {
    browser.storage.local.get({ activeThemeMode: 'system' }).then((result) => {
        const currentIndex = THEME_ROTATION.indexOf(result.activeThemeMode);
        const nextIndex = (currentIndex + 1) % THEME_ROTATION.length;
        const nextMode = THEME_ROTATION[nextIndex];

        browser.storage.local.set({ activeThemeMode: nextMode }).then(() => {
            applyThemeEngine(nextMode);
        });
    });
}

// Watch System Environment changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    browser.storage.local.get({ activeThemeMode: 'system' }).then((result) => {
        if (result.activeThemeMode === 'system') applyThemeEngine('system');
    });
});

function applyThemeEngine(mode) {
    const body = document.body;
    // Strip layout visibility states
    body.classList.remove('light-theme', 'mode-light', 'mode-dark', 'mode-system');

    // Set appropriate visual icon asset wrapper matching selected state
    body.classList.add(`mode-${mode}`);

    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (mode === 'light') {
        body.classList.add('light-theme');
    } else if (mode === 'system' && !systemPrefersDark) {
        body.classList.add('light-theme');
    }
}

// SAVE ACTIONS
saveBtn.addEventListener('click', () => {
    const day = document.getElementById('day').value;
    const time = document.getElementById('time').value;
    const name = document.getElementById('name').value;
    const url = document.getElementById('url').value;

    if (!time || !name || !url) {
        showStatus("Please fill out all fields.", "error");
        return;
    }

    if (!isAllowedClassUrl(url)) {
        showStatus("Use a valid HTTP or HTTPS URL.", "error");
        return;
    }

    browser.storage.local.get({ classSchedule: {} }).then((result) => {
        let schedule = result.classSchedule;

        if (editingClass
            && editingClass.day === day
            && editingClass.time === time) {
            schedule[day][time] = { name: name.trim(), url: url.trim() };
        } else {
            if (schedule[day] && schedule[day][time]) {
                showStatus("Another class already uses that day and time.", "error");
                return;
            }

            if (editingClass) {
                if (!schedule[editingClass.day] || !schedule[editingClass.day][editingClass.time]) {
                    showStatus("Class no longer exists. Reload and try again.", "error");
                    cancelEdit();
                    return;
                }
                delete schedule[editingClass.day][editingClass.time];
                if (Object.keys(schedule[editingClass.day]).length === 0) {
                    delete schedule[editingClass.day];
                }
            }

            if (!schedule[day]) schedule[day] = {};
            schedule[day][time] = { name: name.trim(), url: url.trim() };
        }

        browser.storage.local.set({ classSchedule: schedule }).then(() => {
            showStatus(editingClass ? "Class updated successfully!" : "Class saved successfully!", "success");
            displaySchedule();
            cancelEdit();
        });
    });
});

cancelBtn.addEventListener('click', cancelEdit);
exportBtn.addEventListener('click', exportConfig);
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', importConfig);
soundEnabledInput.addEventListener('change', saveAlertSettings);
skipIfClassTabOpenInput.addEventListener('change', saveAlertSettings);

clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear your entire schedule?")) {
        browser.storage.local.set({ classSchedule: {} }).then(() => {
            showStatus("Schedule cleared.", "success");
            displaySchedule();
        });
    }
});

function deleteClass(day, time) {
    browser.storage.local.get({ classSchedule: {} }).then((result) => {
        let schedule = result.classSchedule;
        if (schedule[day] && schedule[day][time]) {
            delete schedule[day][time];
            if (Object.keys(schedule[day]).length === 0) delete schedule[day];

            browser.storage.local.set({ classSchedule: schedule }).then(() => {
                showStatus("Class removed.", "success");
                displaySchedule();
            });
        }
    });
}

function displaySchedule() {
    browser.storage.local.get({ classSchedule: {} }).then((result) => {
        const schedule = result.classSchedule;
        listDiv.innerHTML = "";
        const sortedClasses = [];

        for (let day in schedule) {
            for (let time in schedule[day]) {
                sortedClasses.push({ day, time, name: schedule[day][time].name, url: schedule[day][time].url });
            }
        }

        sortedClasses.sort((a, b) => {
            const dayA = a.day === "0" ? 7 : parseInt(a.day);
            const dayB = b.day === "0" ? 7 : parseInt(b.day);
            if (dayA !== dayB) return dayA - dayB;
            return a.time.localeCompare(b.time);
        });

        if (sortedClasses.length === 0) {
            listDiv.innerHTML = "None configured yet.";
            return;
        }

        sortedClasses.forEach((item) => {
            const row = document.createElement('div');
            row.className = "schedule-row";

            const textSpan = document.createElement('span');
            textSpan.className = "schedule-text";

            const scheduleHeading = document.createElement('strong');
            scheduleHeading.textContent = `${dayNames[item.day]} @ ${item.time}`;

            const classLink = document.createElement('a');
            classLink.textContent = item.name;
            classLink.style.color = "inherit";
            classLink.style.textDecoration = "none";
            classLink.style.borderBottom = "1px dashed var(--primary-accent)";

            if (isAllowedClassUrl(item.url)) {
                classLink.href = item.url;
                classLink.target = "_blank";
                classLink.rel = "noopener noreferrer";
            } else {
                classLink.removeAttribute('href');
                classLink.style.cursor = "default";
            }

            textSpan.append(scheduleHeading, document.createTextNode(': '), classLink);

            const rowActions = document.createElement('div');
            rowActions.className = "row-actions";

            const editBtn = document.createElement('button');
            editBtn.className = "btn-edit";
            editBtn.innerText = "Edit";
            editBtn.addEventListener('click', () => beginEdit(item));

            const delBtn = document.createElement('button');
            delBtn.className = "btn-delete";
            delBtn.innerText = "Delete";
            delBtn.addEventListener('click', () => {
                if (confirm(`Remove ${item.name}?`)) deleteClass(item.day, item.time);
            });

            rowActions.append(editBtn, delBtn);
            row.append(textSpan, rowActions);
            listDiv.appendChild(row);
        });
    });
}

function beginEdit(item) {
    editingClass = { day: item.day, time: item.time };
    document.getElementById('day').value = item.day;
    document.getElementById('time').value = item.time;
    document.getElementById('name').value = item.name;
    document.getElementById('url').value = item.url;
    saveBtn.innerText = "Update Class";
    cancelBtn.hidden = false;
    document.getElementById('name').focus();
}

function cancelEdit() {
    editingClass = null;
    saveBtn.innerText = "Save Class";
    cancelBtn.hidden = true;
    document.getElementById('name').value = '';
    document.getElementById('url').value = '';
}

function isAllowedClassUrl(value) {
    try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch (error) {
        return false;
    }
}

function loadAlertSettings() {
    browser.storage.local.get({ alertSettings: DEFAULT_ALERT_SETTINGS }).then((result) => {
        const settings = { ...DEFAULT_ALERT_SETTINGS, ...result.alertSettings };
        soundEnabledInput.checked = settings.soundEnabled;
        skipIfClassTabOpenInput.checked = settings.skipIfClassTabOpen;
    });
}

function saveAlertSettings() {
    const alertSettings = {
        soundEnabled: soundEnabledInput.checked,
        skipIfClassTabOpen: skipIfClassTabOpenInput.checked
    };

    browser.storage.local.set({ alertSettings }).then(() => {
        showStatus("Alert settings saved.", "success");
    });
}

function createConfig(schedule, themeMode, alertSettings) {
    return {
        format: 'class-alert-config',
        version: CONFIG_VERSION,
        exportedAt: new Date().toISOString(),
        classSchedule: schedule,
        activeThemeMode: themeMode,
        alertSettings
    };
}

function exportConfig() {
    browser.storage.local.get({
        classSchedule: {},
        activeThemeMode: 'system',
        alertSettings: DEFAULT_ALERT_SETTINGS
    }).then((result) => {
        const alertSettings = validateAlertSettings(result.alertSettings);
        const configJson = JSON.stringify(createConfig(result.classSchedule, result.activeThemeMode, alertSettings), null, 2);
        const fileUrl = URL.createObjectURL(new Blob([configJson], { type: 'application/json' }));
        const downloadLink = document.createElement('a');
        const dateStamp = new Date().toISOString().slice(0, 10);

        downloadLink.href = fileUrl;
        downloadLink.download = `class-alert-config-${dateStamp}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        showStatus("Config exported.", "success");
    }).catch(() => showStatus("Could not export config.", "error"));
}

async function importConfig(event) {
    const file = event.target.files[0];
    importFile.value = '';
    if (!file) return;

    if (file.size > MAX_CONFIG_BYTES) {
        showStatus("Config file is too large.", "error");
        return;
    }

    try {
        const config = JSON.parse(await file.text());
        const validatedConfig = validateConfig(config);

        if (!confirm("Import this config and replace your current classes?")) return;

        await browser.storage.local.set({
            classSchedule: validatedConfig.classSchedule,
            activeThemeMode: validatedConfig.activeThemeMode,
            alertSettings: validatedConfig.alertSettings
        });
        applyThemeEngine(validatedConfig.activeThemeMode);
        loadAlertSettings();
        displaySchedule();
        showStatus("Config imported.", "success");
    } catch (error) {
        showStatus(error.message || "Invalid config file.", "error");
    }
}

function validateConfig(config) {
    if (!config || config.format !== 'class-alert-config' || config.version !== CONFIG_VERSION) {
        throw new Error("Unsupported config file.");
    }

    if (!config.classSchedule || typeof config.classSchedule !== 'object' || Array.isArray(config.classSchedule)) {
        throw new Error("Config has invalid class data.");
    }

    const classSchedule = {};
    for (const [day, classes] of Object.entries(config.classSchedule)) {
        if (!/^[0-6]$/.test(day) || !classes || typeof classes !== 'object' || Array.isArray(classes)) {
            throw new Error("Config has invalid day data.");
        }

        for (const [time, classData] of Object.entries(classes)) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
                || !classData || typeof classData.name !== 'string'
                || !classData.name.trim() || classData.name.length > 200
                || typeof classData.url !== 'string' || !isAllowedClassUrl(classData.url)) {
                throw new Error("Config has invalid class data.");
            }

            if (!classSchedule[day]) classSchedule[day] = {};
            classSchedule[day][time] = {
                name: classData.name.trim(),
                url: classData.url
            };
        }
    }

    const activeThemeMode = THEME_ROTATION.includes(config.activeThemeMode)
        ? config.activeThemeMode
        : 'system';

    return {
        classSchedule,
        activeThemeMode,
        alertSettings: validateAlertSettings(config.alertSettings)
    };
}

function validateAlertSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return { ...DEFAULT_ALERT_SETTINGS };
    }

    return {
        soundEnabled: typeof settings.soundEnabled === 'boolean'
            ? settings.soundEnabled
            : DEFAULT_ALERT_SETTINGS.soundEnabled,
        skipIfClassTabOpen: typeof settings.skipIfClassTabOpen === 'boolean'
            ? settings.skipIfClassTabOpen
            : DEFAULT_ALERT_SETTINGS.skipIfClassTabOpen
    };
}

function showStatus(text, type) {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);
    statusDiv.innerText = text;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    statusTimeoutId = setTimeout(() => { statusDiv.style.display = 'none'; }, 3000);
}

