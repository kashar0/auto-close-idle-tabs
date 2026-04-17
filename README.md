# Auto-Close Idle Tabs

If you are someone who ends up with 40 open tabs and a slow browser, this extension was built for you. It watches your tabs in the background and quietly closes the ones you have not touched in a while. No popups, no interruptions, just a cleaner browser.

## What makes it different

Most tab closers treat all tabs the same. This one gives every tab its own countdown timer. You can see exactly when a tab is about to close, snooze it if you still need it, and bring it back from history if you close something by mistake.

## What it does

Each tab gets an individual idle timer that starts counting down from the moment you stop interacting with it. When the timer hits zero the tab closes automatically. If you want to keep a tab open a bit longer you can snooze it. Every closed tab is saved to a restore list so you never permanently lose anything.

## How to install

Download or clone this repo, open Chrome and go to chrome://extensions, turn on Developer Mode in the top right corner, click Load unpacked, and select this folder. The icon will appear in your toolbar right away.

## Permissions it uses

It needs access to your tabs so it can monitor and close them. It uses alarms to run the per-tab timers, and storage to remember your settings and the restore history. Nothing is sent anywhere.

## Built with

Manifest V3 and plain JavaScript using Chrome's tabs, alarms, and storage APIs.
