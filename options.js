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
const alertLeadMinutesInput = document.getElementById('alert-lead-minutes');
const alertTitleInput = document.getElementById('alert-title');
const alertMessageInput = document.getElementById('alert-message');
const showDismissButtonInput = document.getElementById('show-dismiss-button');
const recurrenceTypeInput = document.getElementById('recurrence-type');
const weeklyDaysGroup = document.getElementById('weekly-days-group');
const monthlyDayGroup = document.getElementById('monthly-day-group');
const monthlyDayInput = document.getElementById('monthly-day');
const lessonEnabledInput = document.getElementById('lesson-enabled');
const lessonEnabledRow = document.getElementById('lesson-enabled-row');
const lessonEnabledLabel = document.getElementById('lesson-enabled-label');
const lessonEnabledHelp = document.getElementById('lesson-enabled-help');
const migrationBanner = document.getElementById('migration-banner');

const dayNames = { "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday", "5": "Friday", "6": "Saturday", "0": "Sunday" };
const THEME_ROTATION = ['system', 'light', 'dark'];
const CONFIG_VERSION = 2;
const MAX_CONFIG_BYTES = 1024 * 1024;
const DEFAULT_ALERT_SETTINGS = ClassAlertUtils.DEFAULT_ALERT_SETTINGS;
let statusTimeoutId = null;
let editingLessonId = null;
let currentLessons = [];

for (let day = 1; day <= 31; day += 1) {
    const option = document.createElement('option');
    option.value = String(day);
    option.textContent = String(day);
    monthlyDayInput.appendChild(option);
}

document.addEventListener('DOMContentLoaded', async () => {
    resetForm();
    await loadSchedule();
    await loadTheme();
    await loadAlertSettings();
});

themeWidget.addEventListener('click', cycleThemeMode);
themeWidget.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    cycleThemeMode();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    browser.storage.local.get({ activeThemeMode: 'system' }).then((result) => {
        if (result.activeThemeMode === 'system') applyThemeEngine('system');
    });
});

function applyThemeEngine(mode) {
    const safeMode = THEME_ROTATION.includes(mode) ? mode : 'system';
    const body = document.body;
    body.classList.remove('light-theme', 'mode-light', 'mode-dark', 'mode-system');
    body.classList.add(`mode-${safeMode}`);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (safeMode === 'light' || (safeMode === 'system' && !systemPrefersDark)) body.classList.add('light-theme');
}

async function loadTheme() {
    const result = await browser.storage.local.get({ activeThemeMode: 'system' });
    applyThemeEngine(result.activeThemeMode);
}

function cycleThemeMode() {
    browser.storage.local.get({ activeThemeMode: 'system' }).then((result) => {
        const index = THEME_ROTATION.indexOf(result.activeThemeMode);
        const nextMode = THEME_ROTATION[(index + 1) % THEME_ROTATION.length];
        return browser.storage.local.set({ activeThemeMode: nextMode }).then(() => applyThemeEngine(nextMode));
    }).catch(() => showStatus('Could not change theme.', 'error'));
}

async function loadSchedule() {
    const result = await browser.storage.local.get({ configVersion: null, lessons: null, classSchedule: null, migrationStatus: null });
    if (result.configVersion === CONFIG_VERSION && Array.isArray(result.lessons)) {
        const normalized = ClassAlertUtils.normalizeConfig({ configVersion: CONFIG_VERSION, lessons: result.lessons });
        currentLessons = normalized.errors.length ? [] : normalized.lessons;
        if (normalized.errors.length) showMigrationMessage(normalized.errors);
    } else {
        const migrated = ClassAlertUtils.migrateLegacySchedule(result.classSchedule || {});
        currentLessons = migrated.lessons;
        if (migrated.errors.length) {
            await browser.storage.local.set({
                configVersion: CONFIG_VERSION,
                lessons: migrated.lessons,
                legacyScheduleBackup: migrated.sourceBackup,
                migrationStatus: { errors: migrated.errors, createdAt: new Date().toISOString() }
            });
            showMigrationMessage(migrated.errors);
        } else {
            await browser.storage.local.set({ configVersion: CONFIG_VERSION, lessons: migrated.lessons });
        }
    }
    if (result.migrationStatus && result.migrationStatus.errors) showMigrationMessage(result.migrationStatus.errors);
    displaySchedule();
}

function showMigrationMessage(errors) {
    migrationBanner.innerHTML = '';
    const message = document.createElement('span');
    message.textContent = `Your previous schedule was preserved, but ${errors.length} class${errors.length === 1 ? '' : 'es'} need attention. ${errors.join(' ')}`;
    const backupButton = document.createElement('button');
    backupButton.className = 'btn-secondary';
    backupButton.type = 'button';
    backupButton.textContent = 'Export Preserved Backup';
    backupButton.addEventListener('click', exportPreservedBackup);
    migrationBanner.append(message, backupButton);
    migrationBanner.style.display = 'block';
}

async function exportPreservedBackup() {
    const result = await browser.storage.local.get({ legacyScheduleBackup: null });
    if (!result.legacyScheduleBackup) {
        showStatus('No preserved backup is available.', 'error');
        return;
    }
    const fileUrl = URL.createObjectURL(new Blob([JSON.stringify(result.legacyScheduleBackup, null, 2)], { type: 'application/json' }));
    const downloadLink = document.createElement('a');
    downloadLink.href = fileUrl;
    downloadLink.download = `class-alert-legacy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    showStatus('Preserved backup exported.', 'success');
}

async function saveLessons(lessons) {
    await browser.storage.local.set({ configVersion: CONFIG_VERSION, lessons });
    currentLessons = lessons;
    await notifyScheduleChanged();
    displaySchedule();
}

function notifyScheduleChanged(message = { type: 'scheduleChanged' }) {
    return browser.runtime.sendMessage(message).catch(() => {});
}

saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('name').value.trim();
    const url = document.getElementById('url').value.trim();
    const time = document.getElementById('time').value;
    try {
        const lesson = ClassAlertUtils.normalizeLesson({
            id: editingLessonId || undefined,
            enabled: lessonEnabledInput.checked,
            name,
            url,
            time,
            recurrence: getFormRecurrence()
        });
        const conflict = ClassAlertUtils.findLessonConflict(lesson, currentLessons, editingLessonId);
        if (conflict && lesson.enabled) {
            showStatus(`Cannot save “${lesson.name}.” It conflicts with “${conflict.lesson.name}” at ${lesson.time}. Choose another time or recurrence.`, 'error');
            return;
        }
        const nextLessons = editingLessonId
            ? currentLessons.map((item) => item.id === editingLessonId ? lesson : item)
            : [...currentLessons, lesson];
        const nextOccurrence = ClassAlertUtils.getNextSchedulableOccurrence(lesson, new Date(), 0);
        await saveLessons(nextLessons);
        if (nextOccurrence && nextOccurrence.skippedImmediateOccurrence) {
            showStatus(`Saved. This class starts too soon for a reliable alert today. The next alert is scheduled for ${formatDateTime(nextOccurrence.alertDate)}.`, 'warning');
        } else {
            showStatus(editingLessonId ? 'Class updated successfully.' : 'Class saved successfully.', 'success');
        }
        resetForm();
    } catch (error) {
        showStatus(error.message || 'Could not save this class.', 'error');
    }
});

cancelBtn.addEventListener('click', resetForm);
exportBtn.addEventListener('click', exportConfig);
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', importConfig);
recurrenceTypeInput.addEventListener('change', updateRecurrenceVisibility);
lessonEnabledInput.addEventListener('change', updateLessonEnabledCopy);
soundEnabledInput.addEventListener('change', saveAlertSettings);
alertLeadMinutesInput.addEventListener('change', saveAlertSettings);
alertTitleInput.addEventListener('change', saveAlertSettings);
alertMessageInput.addEventListener('change', saveAlertSettings);
showDismissButtonInput.addEventListener('change', saveAlertSettings);

clearBtn.addEventListener('click', async () => {
    if (!confirm('Clear every saved class? This removes the schedule but does not change alert settings.')) return;
    await browser.storage.local.set({ configVersion: CONFIG_VERSION, lessons: [] });
    currentLessons = [];
    await notifyScheduleChanged({ type: 'clearAllLessons' });
    displaySchedule();
    showStatus('Schedule cleared.', 'success');
});

function getFormRecurrence() {
    if (recurrenceTypeInput.value === 'monthly') return { type: 'monthly', dayOfMonth: Number(monthlyDayInput.value), overflow: 'last-day' };
    return { type: 'weekly', days: [...document.querySelectorAll('#weekly-days-group input:checked')].map((input) => Number(input.value)) };
}

function updateRecurrenceVisibility() {
    const monthly = recurrenceTypeInput.value === 'monthly';
    weeklyDaysGroup.hidden = monthly;
    monthlyDayGroup.hidden = !monthly;
}

function updateLessonEnabledCopy() {
    const enabled = lessonEnabledInput.checked;
    lessonEnabledRow.classList.toggle('is-enabled', enabled);
    lessonEnabledRow.classList.toggle('is-paused', !enabled);
    lessonEnabledLabel.textContent = enabled ? 'Reminders enabled' : 'Reminders paused';
    lessonEnabledHelp.textContent = enabled
        ? 'This lesson will send alerts on its schedule.'
        : 'No alerts will be sent until you resume reminders. The lesson stays saved.';
}

function resetForm() {
    editingLessonId = null;
    saveBtn.innerText = 'Save Class';
    cancelBtn.hidden = true;
    document.getElementById('name').value = '';
    document.getElementById('url').value = '';
    document.getElementById('time').value = '';
    recurrenceTypeInput.value = 'weekly';
    document.querySelectorAll('#weekly-days-group input').forEach((input) => { input.checked = input.value === '1'; });
    monthlyDayInput.value = '1';
    lessonEnabledInput.checked = true;
    updateLessonEnabledCopy();
    updateRecurrenceVisibility();
}

function beginEdit(lesson) {
    editingLessonId = lesson.id;
    saveBtn.innerText = 'Update Class';
    cancelBtn.hidden = false;
    document.getElementById('name').value = lesson.name;
    document.getElementById('url').value = lesson.url;
    document.getElementById('time').value = lesson.time;
    lessonEnabledInput.checked = lesson.enabled !== false;
    updateLessonEnabledCopy();
    recurrenceTypeInput.value = lesson.recurrence.type;
    document.querySelectorAll('#weekly-days-group input').forEach((input) => {
        input.checked = lesson.recurrence.type === 'weekly' && lesson.recurrence.days.includes(Number(input.value));
    });
    if (lesson.recurrence.type === 'monthly') monthlyDayInput.value = String(lesson.recurrence.dayOfMonth);
    updateRecurrenceVisibility();
    document.getElementById('name').focus();
}

async function toggleLesson(lesson) {
    if (lesson.enabled && !confirm(`Pause reminders for ${lesson.name}? The lesson will stay saved, but no alerts will be sent until you resume reminders.`)) return;
    const nextLesson = { ...lesson, enabled: !lesson.enabled };
    if (nextLesson.enabled) {
        const conflict = ClassAlertUtils.findLessonConflict(nextLesson, currentLessons, lesson.id);
        if (conflict) {
            showStatus(`Cannot resume “${lesson.name}.” It conflicts with “${conflict.lesson.name}” at ${lesson.time}. Choose another time or recurrence.`, 'error');
            return;
        }
    }
    await saveLessons(currentLessons.map((item) => item.id === lesson.id ? nextLesson : item));
    await notifyScheduleChanged({ type: nextLesson.enabled ? 'lessonResumed' : 'lessonPaused', lessonId: lesson.id });
    showStatus(nextLesson.enabled ? 'Reminders resumed.' : 'Reminders paused.', 'success');
}

async function deleteLesson(lesson) {
    if (!confirm(`Delete ${lesson.name}? This cannot be undone.`)) return;
    currentLessons = currentLessons.filter((item) => item.id !== lesson.id);
    await browser.storage.local.set({ configVersion: CONFIG_VERSION, lessons: currentLessons });
    await notifyScheduleChanged({ type: 'lessonDeleted', lessonId: lesson.id });
    displaySchedule();
    showStatus('Class deleted.', 'success');
}

function displaySchedule() {
    listDiv.innerHTML = '';
    if (!currentLessons.length) {
        listDiv.textContent = 'None configured yet.';
        return;
    }
    [...currentLessons].sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name)).forEach((lesson) => {
        const row = document.createElement('div');
        row.className = `schedule-row${lesson.enabled ? '' : ' is-paused'}`;
        const textSpan = document.createElement('span');
        textSpan.className = 'schedule-text';
        const heading = document.createElement('strong');
        heading.textContent = lesson.name;
        const meta = document.createElement('span');
        meta.className = 'schedule-meta';
        meta.textContent = `${formatRecurrence(lesson)} · ${lesson.enabled ? 'Reminders on' : 'Reminders paused'}`;
        textSpan.append(heading, meta);
        const rowActions = document.createElement('div');
        rowActions.className = 'row-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => beginEdit(lesson));
        const toggleBtn = document.createElement('button');
        toggleBtn.className = lesson.enabled ? 'btn-pause' : 'btn-resume';
        toggleBtn.textContent = lesson.enabled ? 'Pause reminders' : 'Resume reminders';
        toggleBtn.setAttribute('aria-label', `${lesson.enabled ? 'Pause' : 'Resume'} reminders for ${lesson.name}`);
        toggleBtn.addEventListener('click', () => toggleLesson(lesson));
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteLesson(lesson));
        rowActions.append(editBtn, toggleBtn, deleteBtn);
        row.append(textSpan, rowActions);
        listDiv.appendChild(row);
    });
}

function formatRecurrence(lesson) {
    if (lesson.recurrence.type === 'monthly') return `Monthly on the ${lesson.recurrence.dayOfMonth}${ordinalSuffix(lesson.recurrence.dayOfMonth)} at ${lesson.time}`;
    const days = lesson.recurrence.days.map((day) => dayNames[String(day)].slice(0, 3)).join(', ');
    return `${days} at ${lesson.time}`;
}

function ordinalSuffix(number) {
    if (number % 100 >= 11 && number % 100 <= 13) return 'th';
    return ({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] || 'th';
}

function formatDateTime(date) {
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadAlertSettings() {
    const result = await browser.storage.local.get({ alertSettings: DEFAULT_ALERT_SETTINGS });
    const settings = ClassAlertUtils.normalizeAlertSettings(result.alertSettings, DEFAULT_ALERT_SETTINGS);
    soundEnabledInput.checked = settings.soundEnabled;
    alertLeadMinutesInput.value = String(settings.alertLeadMinutes);
    alertTitleInput.value = settings.alertTitle;
    alertMessageInput.value = settings.alertMessage;
    showDismissButtonInput.checked = settings.showDismissButton;
}

async function saveAlertSettings() {
    const alertSettings = ClassAlertUtils.normalizeAlertSettings({
        soundEnabled: soundEnabledInput.checked,
        alertLeadMinutes: Number(alertLeadMinutesInput.value),
        alertTitle: alertTitleInput.value,
        alertMessage: alertMessageInput.value,
        showDismissButton: showDismissButtonInput.checked
    }, DEFAULT_ALERT_SETTINGS);
    await browser.storage.local.set({ alertSettings });
    await notifyScheduleChanged();
    showStatus('Alert settings saved.', 'success');
}

function createConfig(lessons, themeMode, alertSettings) {
    return { format: 'class-alert-config', configVersion: CONFIG_VERSION, version: CONFIG_VERSION, exportedAt: new Date().toISOString(), lessons, activeThemeMode: themeMode, alertSettings };
}

async function exportConfig() {
    try {
        const result = await browser.storage.local.get({ activeThemeMode: 'system', alertSettings: DEFAULT_ALERT_SETTINGS });
        const configJson = JSON.stringify(createConfig(currentLessons, result.activeThemeMode, ClassAlertUtils.normalizeAlertSettings(result.alertSettings)), null, 2);
        const fileUrl = URL.createObjectURL(new Blob([configJson], { type: 'application/json' }));
        const downloadLink = document.createElement('a');
        downloadLink.href = fileUrl;
        downloadLink.download = `class-alert-config-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        showStatus('Config exported.', 'success');
    } catch (error) {
        showStatus('Could not export config.', 'error');
    }
}

async function importConfig(event) {
    const file = event.target.files[0];
    importFile.value = '';
    if (!file) return;
    if (file.size > MAX_CONFIG_BYTES) {
        showStatus('Import rejected: file is larger than 1 MB.', 'error');
        return;
    }
    try {
        const config = JSON.parse(await file.text());
        let normalized;
        if (config.configVersion === CONFIG_VERSION) {
            normalized = ClassAlertUtils.normalizeConfig(config);
        } else if (config.version === 1 && config.classSchedule) {
            const migrated = ClassAlertUtils.migrateLegacySchedule(config.classSchedule);
            normalized = { lessons: migrated.lessons, errors: migrated.errors };
        } else {
            throw new Error('Import rejected: unsupported configuration version. Export a new Class Alert configuration.');
        }
        if (normalized.errors.length) throw new Error(`Import rejected: ${normalized.errors.join(' ')}`);
        if (!confirm('Import this config and replace your current classes?')) return;
        await browser.storage.local.set({
            configVersion: CONFIG_VERSION,
            lessons: normalized.lessons,
            activeThemeMode: THEME_ROTATION.includes(config.activeThemeMode) ? config.activeThemeMode : 'system',
            alertSettings: ClassAlertUtils.normalizeAlertSettings(config.alertSettings, DEFAULT_ALERT_SETTINGS),
            migrationStatus: null
        });
        currentLessons = normalized.lessons;
        applyThemeEngine(config.activeThemeMode);
        await notifyScheduleChanged();
        await loadAlertSettings();
        displaySchedule();
        showStatus('Config imported.', 'success');
    } catch (error) {
        showStatus(error.message || 'Import rejected: invalid configuration.', 'error');
    }
}

function showStatus(text, type) {
    if (statusTimeoutId) clearTimeout(statusTimeoutId);
    statusDiv.innerText = text;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    statusTimeoutId = setTimeout(() => { statusDiv.style.display = 'none'; }, type === 'warning' ? 7000 : 4000);
}
