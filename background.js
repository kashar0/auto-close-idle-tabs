// Auto-Close Idle Tabs v3 — background.js (Service Worker)
// Fixed: alarm-based close, per-tab timers, snooze, undo-close history

const DEFAULT_IDLE_MINUTES = 10;
const ALARM_NAME = 'autoCloseIdleTabs';
const ALARM_PERIOD_MINUTES = 0.25; // tick every 15 s for accurate countdowns
const MAX_HISTORY = 10;

// ─── In-memory state (restored from storage on startup) ────────────────────
let inactiveSince = {};        // { [tabId]: epochMs }
let snoozedUntil  = {};        // { [tabId]: epochMs }
let activeTabByWindow = {};    // { [windowId]: tabId }
let closedHistory = [];        // [{ title, url, favicon, closedAt }]

// ─── Storage helpers ────────────────────────────────────────────────────────

async function saveState() {
  try {
    await chrome.storage.local.set({
      _inactiveSince: inactiveSince,
      _snoozedUntil:  snoozedUntil,
      _closedHistory: closedHistory,
    });
  } catch (_) {}
}

async function loadState() {
  try {
    const d = await chrome.storage.local.get([
      '_inactiveSince', '_snoozedUntil', '_closedHistory'
    ]);
    inactiveSince  = d._inactiveSince  || {};
    snoozedUntil   = d._snoozedUntil   || {};
    closedHistory  = d._closedHistory  || [];
  } catch (_) {
    inactiveSince  = {};
    snoozedUntil   = {};
    closedHistory  = [];
  }
}

// ─── Initialisation ──────────────────────────────────────────────────────────

async function init() {
  await loadState();
  await rebuildActiveMap();
  await ensureAlarm();
}

async function rebuildActiveMap() {
  const now  = Date.now();
  const tabs = await chrome.tabs.query({});

  activeTabByWindow = {};
  tabs.forEach(t => { if (t.active) activeTabByWindow[t.windowId] = t.id; });

  for (const tab of tabs) {
    if (tab.pinned || tab.audible) {
      // Protected tabs — clear any stale stamp
      delete inactiveSince[tab.id];
      continue;
    }
    if (tab.active) {
      delete inactiveSince[tab.id];
    } else if (!inactiveSince[tab.id]) {
      inactiveSince[tab.id] = now;
    }
  }
  await saveState();
}

async function ensureAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get('idleMinutes');
  if (!existing.idleMinutes) {
    await chrome.storage.sync.set({ idleMinutes: DEFAULT_IDLE_MINUTES });
  }
  await init();
});

chrome.runtime.onStartup.addListener(init);

// ─── Alarm — close idle tabs ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const { idleMinutes } = await chrome.storage.sync.get('idleMinutes');
  const thresholdMs = (idleMinutes || DEFAULT_IDLE_MINUTES) * 60 * 1000;
  const now = Date.now();

  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch (_) { return; }

  for (const tab of tabs) {
    // Never close active, pinned, or audible tabs
    if (tab.active || tab.pinned || tab.audible) {
      delete inactiveSince[tab.id];
      continue;
    }

    // Check snooze
    if (snoozedUntil[tab.id] && now < snoozedUntil[tab.id]) continue;
    if (snoozedUntil[tab.id] && now >= snoozedUntil[tab.id]) {
      delete snoozedUntil[tab.id];
      // Restart idle clock from now
      inactiveSince[tab.id] = now;
      continue;
    }

    if (!inactiveSince[tab.id]) {
      inactiveSince[tab.id] = now;
      continue;
    }

    const idleMs = now - inactiveSince[tab.id];

    if (idleMs >= thresholdMs) {
      // Record in history before closing
      const entry = {
        title:     tab.title    || tab.url || 'Untitled',
        url:       tab.url      || '',
        favicon:   tab.favIconUrl || '',
        closedAt:  now,
      };
      closedHistory.unshift(entry);
      if (closedHistory.length > MAX_HISTORY) closedHistory.pop();

      try {
        await chrome.tabs.remove(tab.id);
      } catch (_) {}
      delete inactiveSince[tab.id];
    }
  }

  await saveState();
});

// ─── Tab events ───────────────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const now = Date.now();
  const prev = activeTabByWindow[windowId];
  if (prev != null && prev !== tabId) {
    inactiveSince[prev] = now;
  }
  delete inactiveSince[tabId];
  activeTabByWindow[windowId] = tabId;
  await saveState();
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.pinned || tab.audible) {
    delete inactiveSince[tab.id];
  } else if (tab.active) {
    delete inactiveSince[tab.id];
    activeTabByWindow[tab.windowId] = tab.id;
  } else {
    inactiveSince[tab.id] = Date.now();
  }
  await saveState();
});

chrome.tabs.onRemoved.addListener(async (tabId, { windowId }) => {
  delete inactiveSince[tabId];
  delete snoozedUntil[tabId];
  if (activeTabByWindow[windowId] === tabId) delete activeTabByWindow[windowId];
  await saveState();
});

// Tab updated — re-check pinned / audible status
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.pinned !== undefined || changeInfo.audible !== undefined) {
    if (tab.pinned || tab.audible) {
      delete inactiveSince[tabId];
      await saveState();
    }
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  await rebuildActiveMap();
});

// ─── Messages ────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'resetAlarm') {
      await ensureAlarm();
      sendResponse({ ok: true });
    }

    if (msg.type === 'getStatus') {
      const { idleMinutes } = await chrome.storage.sync.get('idleMinutes');
      sendResponse({
        inactiveSince:  { ...inactiveSince },
        snoozedUntil:   { ...snoozedUntil },
        closedHistory:  [...closedHistory],
        idleMinutes:    idleMinutes || DEFAULT_IDLE_MINUTES,
        now:            Date.now(),
      });
    }

    if (msg.type === 'snoozeTab') {
      const { tabId, minutes } = msg;
      snoozedUntil[tabId] = Date.now() + (minutes * 60 * 1000);
      delete inactiveSince[tabId];
      await saveState();
      sendResponse({ ok: true });
    }

    if (msg.type === 'restoreTab') {
      const { url } = msg;
      if (url) {
        try {
          await chrome.tabs.create({ url, active: false });
        } catch (_) {}
      }
      sendResponse({ ok: true });
    }

    if (msg.type === 'clearHistory') {
      closedHistory = [];
      await saveState();
      sendResponse({ ok: true });
    }
  })();
  return true;
});
