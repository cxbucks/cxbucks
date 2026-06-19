# Automatic CX-Bucks

A Chrome extension that automates chat engagement on [Kick.com](https://kick.com). Monitor multiple streamers, auto-open tabs when they go live, and participate in chat with parrot mode.

<p align="center">
  <img src="https://github.com/user-attachments/assets/f9b9bd57-b986-45e6-ae68-ffdbbdb8325f" alt="image">
</p>

---

## Features

### 📺 Streamer Monitoring
Register usernames and the extension automatically checks their live status every minute. Monitor multiple streamers simultaneously and see online/offline status in real time from the popup.

### 🔴 Auto-open tabs when going live
When a monitored streamer goes live, a new tab is automatically opened in the background. The tab only opens once per stream start — not repeatedly while they're live.

### 🔁 Re-open closed tabs
If you manually close a live streamer's tab, it will automatically reopen within a minute. Useful for streams you want to passively monitor.

### 🦜 Parrot Mode
Repeats a chat message every 60 seconds (100% chance — fires every cycle as long as the streamer is live). Pulls from a rolling pool of recent clean messages and filters out bot messages, commands (`!` / `$` / `/`), W-spam, and UI artifacts.

---

## Installation

This extension is not published on the Chrome Web Store. Install it manually as an unpacked extension:

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** in the top-right
4. Click **Load unpacked** and select the extension folder
5. The Automatic CX-Bucks icon will appear in your toolbar

---

## Usage

1. Click the extension icon to open the popup
2. In the **Streamers** tab, add the usernames you want to monitor
3. In the **Settings** tab, toggle features on or off
4. Open any Kick channel page — chat automation activates automatically

Parrot mode automatically stops when a streamer goes offline and restarts when they come back live.

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| 🔴 Auto-open tabs when going live | ✅ On | Opens a tab when a monitored streamer goes live |
| 🔁 Re-open closed tabs | ✅ On | Re-opens a live streamer's tab if you close it |
| 🦜 Parrot Mode | ✅ On | Repeats a chat message every 60 seconds (100% chance) |

Settings are saved to Chrome local storage and persist across sessions.

---

## Required Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save streamer list and settings |
| `tabs` | Open and manage tabs for monitored streams |
| `alarms` | Poll streamer status every minute in the background |
| `scripting` | Inject content scripts into Kick pages |
| `https://kick.com/*` | Read chat and send messages on Kick pages |

---

## Notes

- The extension only works on `kick.com` pages
- Chat automation only runs while a streamer is online — all timers stop when they go offline
- Parrot mode waits until at least 15 messages have been pooled after page load before posting
- No chat data is stored externally or transmitted outside the extension
