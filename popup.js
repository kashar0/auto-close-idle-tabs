// popup.js — Auto-Close Idle Tabs v3

document.addEventListener('DOMContentLoaded', async () => {

  // ── Element refs ────────────────────────────────────────────────────────────
  const inputEl     = document.getElementById('idleTime');
  const saveBtn     = document.getElementById('saveBtn');
  const toastEl     = document.getElementById('toast');
  const statusEl    = document.getElementById('liveStatus');
  const tabListEl   = document.getElementById('tabList');
  const tabCountEl  = document.getElementById('tabCount');
  const histListEl  = document.getElementById('historyList');
  const clearHistBtn = document.getElementById('clearHistBtn');
  const presets     = document.querySelectorAll('.preset-btn');
  const navBtns     = document.querySelectorAll('.nav-btn');
  const panels      = document.querySelectorAll('.panel');

  let currentIdleMinutes = 10;
  let tickInterval = null;

  // ── Nav ─────────────────────────────────────────────────────────────────────
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panelId = 'panel-' + btn.dataset.panel;
      document.getElementById(panelId).classList.add('active');
      if (btn.dataset.panel === 'tabs')    renderTabList();
      if (btn.dataset.panel === 'history') renderHistory();
    });
  });

  // ── Load saved setting ───────────────────────────────────────────────────────
  const stored = await chrome.storage.sync.get('idleMinutes');
  currentIdleMinutes = stored.idleMinutes || 10;
  inputEl.value = currentIdleMinutes;
  highlightPreset(currentIdleMinutes);
  updateStatusBadge(currentIdleMinutes);

  // ── Presets ──────────────────────────────────────────────────────────────────
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.time, 10);
      inputEl.value = val;
      highlightPreset(val);
    });
  });

  inputEl.addEventListener('input', () => {
    highlightPreset(parseInt(inputEl.value, 10));
  });

  // ── Save ─────────────────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const val = parseInt(inputEl.value, 10);
    if (isNaN(val) || val < 1) {
      showToast('Enter a number ≥ 1.', 'error');
      return;
    }
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;

    await chrome.storage.sync.set({ idleMinutes: val });
    chrome.runtime.sendMessage({ type: 'resetAlarm' });

    currentIdleMinutes = val;
    highlightPreset(val);
    updateStatusBadge(val);

    saveBtn.textContent = '✓ Saved';
    saveBtn.classList.add('saved');
    showToast('Timer updated.', 'success');

    setTimeout(() => {
      saveBtn.textContent = 'Save Settings';
      saveBtn.classList.remove('saved');
      saveBtn.disabled = false;
    }, 1800);

    renderTabList();
  });

  // ── Clear history ─────────────────────────────────────────────────────────────
  clearHistBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'clearHistory' });
    renderHistory();
  });

  // ── Tab list (with live countdown) ───────────────────────────────────────────

  async function getStatus() {
    try {
      return await chrome.runtime.sendMessage({ type: 'getStatus' });
    } catch (_) {
      return { inactiveSince: {}, snoozedUntil: {}, closedHistory: [], idleMinutes: currentIdleMinutes, now: Date.now() };
    }
  }

  async function renderTabList() {
    tabListEl.textContent = '';

    const status = await getStatus();
    const { inactiveSince, snoozedUntil, idleMinutes } = status;
    const now = status.now || Date.now();
    currentIdleMinutes = idleMinutes || currentIdleMinutes;
    const thresholdMs = currentIdleMinutes * 60 * 1000;

    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabCountEl.textContent = `${tabs.length} tab${tabs.length !== 1 ? 's' : ''}`;

    if (tabs.length === 0) {
      tabListEl.appendChild(emptyState('No tabs open.'));
      return;
    }

    for (const tab of tabs) {
      const item = document.createElement('div');
      item.className = 'tab-item';

      const fav = document.createElement('img');
      fav.className = 'tab-favicon';
      fav.src = tab.favIconUrl || '';
      fav.onerror = () => {
        fav.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="%2364748b"/></svg>';
      };

      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url || 'Untitled';
      title.title = tab.url || '';

      const badge = document.createElement('span');
      badge.className = 'tab-badge';

      if (tab.active) {
        badge.classList.add('active');
        badge.textContent = 'ACTIVE';
      } else if (tab.pinned) {
        badge.classList.add('pinned');
        badge.textContent = 'PINNED';
      } else if (tab.audible) {
        badge.classList.add('pinned');
        badge.textContent = 'AUDIO';
      } else {
        const snoozeEnd = snoozedUntil[String(tab.id)] || snoozedUntil[tab.id];
        if (snoozeEnd && now < snoozeEnd) {
          badge.classList.add('snooze');
          badge.textContent = 'SNOOZED';
          badge.dataset.snoozeEnd = snoozeEnd;
        } else {
          const stamp = inactiveSince[String(tab.id)] || inactiveSince[tab.id];
          if (stamp) {
            const remaining = thresholdMs - (now - stamp);
            badge.dataset.stamp = stamp;
            badge.dataset.threshold = thresholdMs;
            updateBadge(badge, remaining);
          } else {
            badge.classList.add('safe');
            badge.textContent = fmtTime(thresholdMs);
          }
        }
      }

      item.appendChild(fav);
      item.appendChild(title);

      // Snooze button (skip for active/pinned/audio)
      if (!tab.active && !tab.pinned && !tab.audible) {
        const snoozeBtn = document.createElement('button');
        snoozeBtn.className = 'snooze-btn';
        snoozeBtn.textContent = '+15m';
        snoozeBtn.title = 'Snooze this tab for 15 minutes';
        snoozeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await chrome.runtime.sendMessage({ type: 'snoozeTab', tabId: tab.id, minutes: 15 });
          badge.className = 'tab-badge snooze';
          badge.textContent = 'SNOOZED';
          showToast('Tab snoozed 15 min.', 'success');
        });
        item.appendChild(snoozeBtn);
      }

      item.appendChild(badge);
      tabListEl.appendChild(item);
    }

    // Start live ticker
    startTicker();
  }

  function updateBadge(badge, remaining) {
    if (remaining <= 0) {
      badge.className = 'tab-badge idle';
      badge.textContent = 'CLOSING';
    } else if (remaining < 60_000) {
      // Under 1 minute — show seconds
      const secs = Math.ceil(remaining / 1000);
      badge.className = 'tab-badge idle';
      badge.textContent = `${secs}s`;
    } else if (remaining < 300_000) {
      // Under 5 min — orange warning
      const mins = Math.ceil(remaining / 60_000);
      badge.className = 'tab-badge warn';
      badge.textContent = mins <= 1 ? '<1m' : `${mins}m`;
    } else {
      const mins = Math.ceil(remaining / 60_000);
      badge.className = 'tab-badge safe';
      badge.textContent = `${mins}m`;
    }
  }

  function startTicker() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(() => {
      const now = Date.now();
      document.querySelectorAll('.tab-badge[data-stamp]').forEach(badge => {
        const stamp     = parseInt(badge.dataset.stamp, 10);
        const threshold = parseInt(badge.dataset.threshold, 10);
        const remaining = threshold - (now - stamp);
        updateBadge(badge, remaining);
      });
    }, 1000);
  }

  // ── History ──────────────────────────────────────────────────────────────────

  async function renderHistory() {
    histListEl.textContent = '';
    const status = await getStatus();
    const history = status.closedHistory || [];

    if (history.length === 0) {
      histListEl.appendChild(emptyState('No tabs auto-closed yet.'));
      return;
    }

    for (const entry of history) {
      const item = document.createElement('div');
      item.className = 'hist-item';

      const fav = document.createElement('img');
      fav.className = 'hist-favicon';
      fav.src = entry.favicon || '';
      fav.onerror = () => {
        fav.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="%2364748b"/></svg>';
      };

      const info = document.createElement('div');
      info.className = 'hist-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'hist-title';
      titleEl.textContent = entry.title;
      titleEl.title = entry.url || '';

      const timeEl = document.createElement('div');
      timeEl.className = 'hist-time';
      timeEl.textContent = timeAgo(entry.closedAt);

      info.appendChild(titleEl);
      info.appendChild(timeEl);

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'restore-btn';
      restoreBtn.textContent = 'Restore';
      restoreBtn.title = entry.url || '';
      restoreBtn.addEventListener('click', async () => {
        if (!entry.url) return;
        await chrome.runtime.sendMessage({ type: 'restoreTab', url: entry.url });
        restoreBtn.textContent = '✓';
        restoreBtn.disabled = true;
      });

      item.appendChild(fav);
      item.appendChild(info);
      if (entry.url) item.appendChild(restoreBtn);
      histListEl.appendChild(item);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function fmtTime(ms) {
    if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
    return `${Math.ceil(ms / 60_000)}m`;
  }

  function timeAgo(epochMs) {
    const diff = Date.now() - epochMs;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
    return `${Math.round(diff / 86_400_000)}d ago`;
  }

  function emptyState(msg) {
    const d = document.createElement('div');
    d.className = 'empty-state';
    d.textContent = msg;
    return d;
  }

  function highlightPreset(val) {
    presets.forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.time, 10) === val);
    });
  }

  function updateStatusBadge(mins) {
    statusEl.textContent = `Idle timeout: ${mins} minute${mins !== 1 ? 's' : ''}`;
  }

  let toastTimer;
  function showToast(msg, type = '') {
    toastEl.textContent = msg;
    toastEl.className = `toast ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.textContent = '';
      toastEl.className = 'toast';
    }, 3000);
  }

  // Initial render
  await renderTabList();

  // Cleanup on popup close
  window.addEventListener('unload', () => {
    if (tickInterval) clearInterval(tickInterval);
  });
});
