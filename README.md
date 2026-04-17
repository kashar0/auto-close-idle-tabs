# Auto-Close Idle Tabs

If you are someone who ends up with 40 open tabs and a slow browser, this extension was built for you. It watches your tabs in the background and quietly closes the ones you have not touched in a while. No popups, no interruptions, just a cleaner browser.

## What makes it different

Most tab closers treat all tabs the same and apply one global timer. This one gives every tab its own independent countdown timer. You can see exactly when each tab is about to close, snooze individual tabs when you need more time, and bring anything back from the restore history if you change your mind.

## Features

Every tab shows a live countdown badge in the popup. When a tab has more than 5 minutes left the badge is green. Under 5 minutes it turns orange as a warning. Under 1 minute it shows the exact seconds counting down and turns red. When a tab is about to be closed the badge reads CLOSING.

Active tabs, pinned tabs, and tabs playing audio are completely protected and will never be automatically closed regardless of how long they have been open.

The snooze button adds 15 minutes to any tab's timer instantly. This is useful when you know you will get back to something but not right now.

The restore history keeps a log of the last 10 auto-closed tabs with their title, URL, favicon, and how long ago they were closed. You can reopen any of them with a single click.

There are preset timer buttons for common intervals (5 minutes, 10 minutes, 30 minutes, 1 hour) and a manual input if you want something specific. Settings sync across your Chrome profile automatically.

## How to install

Download or clone this repo, open Chrome and go to chrome://extensions, turn on Developer Mode in the top right corner, click Load unpacked, and select this folder.

## How it works technically

The background service worker runs a polling alarm every 15 seconds to keep the countdown timers accurate. Tab activity is tracked through Chrome's tab events so the inactive timestamp is always up to date. When a tab's idle time exceeds your configured threshold the extension records it to history and calls chrome.tabs.remove. State is persisted to chrome.storage.local so your history and snooze data survives browser restarts.

## Permissions

The extension needs the tabs permission to monitor and close tabs, alarms to run the 15-second polling tick, and storage to save your settings and restore history. No data leaves your machine.
