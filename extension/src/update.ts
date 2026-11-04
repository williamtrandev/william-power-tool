// New builds: every deploy publishes extension-version.json next to the zip. The background compares it with this
// build, marks the toolbar icon when they differ, and reloads itself once the files on disk have been replaced —
// so updating is: download, unzip over the old folder, done (no trip to chrome://extensions).

export interface BuildInfo {
  build: string;
  version: string;
}
/** chrome.storage.local: the newer build waiting to be installed, if any */
export const UPDATE_KEY = 'wpt-update';
const CARRY = 'wpt-carry';
/** the disk build last reloaded into — if the code still differs after that, the copy was partial: don't loop */
const RELOADED = 'wpt-reloaded-for';
const DISK_ALARM = 'wpt-disk';
const CHECK_ALARM = 'wpt-check';

export const zipUrl = () => `${__APP_URL__}/william-tool-extension.zip`;

/** asks the web app for the latest build; returns it when it is not this one */
export async function checkForUpdate(): Promise<BuildInfo | null> {
  if (!__APP_URL__) return null;
  const latest = (await fetch(`${__APP_URL__}/extension-version.json`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as BuildInfo | null;
  // offline / web down: keep what we knew
  if (!latest?.build) return ((await chrome.storage.local.get(UPDATE_KEY))[UPDATE_KEY] as BuildInfo | undefined) ?? null;
  const newer = latest.build !== __BUILD__ ? latest : null;
  if (newer) {
    await chrome.storage.local.set({ [UPDATE_KEY]: newer });
    chrome.alarms.create(DISK_ALARM, { periodInMinutes: 0.5 });
  } else {
    await chrome.storage.local.remove(UPDATE_KEY);
    chrome.alarms.clear(DISK_ALARM);
  }
  await chrome.action.setBadgeText({ text: newer ? '1' : '' });
  if (newer) await chrome.action.setBadgeBackgroundColor({ color: '#ea580c' });
  await chrome.action.setTitle({ title: newer ? 'William Tool – có bản mới' : 'William Tool – Điền tài khoản' });
  return newer;
}

/** the build of the files on disk, which may already be newer than the code running */
async function diskBuild() {
  const r = await fetch(chrome.runtime.getURL('build.json'), { cache: 'no-store' }).catch(() => null);
  return ((await r?.json().catch(() => null)) as BuildInfo | null)?.build;
}

/** reloads into the new files if they were replaced; the sign-in survives the reload */
export async function reloadIfReplaced() {
  const disk = await diskBuild();
  if (!disk || disk === __BUILD__) return false;
  if ((await chrome.storage.local.get(RELOADED))[RELOADED] === disk) return false;
  await chrome.storage.local.set({ [RELOADED]: disk });
  // a reload empties chrome.storage.session (where the session lives): park it for a moment
  await chrome.storage.local.set({ [CARRY]: { at: Date.now(), items: await chrome.storage.session.get(null) } });
  await chrome.storage.local.remove(UPDATE_KEY);
  chrome.runtime.reload();
  return true;
}

/** after a self-reload: put the parked session back */
async function restoreSession() {
  const c = (await chrome.storage.local.get(CARRY))[CARRY] as { at: number; items: Record<string, unknown> } | undefined;
  if (!c) return;
  await chrome.storage.local.remove(CARRY);
  if (Date.now() - c.at < 60_000) await chrome.storage.session.set(c.items);
}

export function setUpUpdates() {
  restoreSession();
  chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === CHECK_ALARM) checkForUpdate();
    if (a.name === DISK_ALARM) reloadIfReplaced();
  });
  chrome.runtime.onStartup.addListener(() => checkForUpdate());
  chrome.runtime.onInstalled.addListener(() => checkForUpdate());
}
