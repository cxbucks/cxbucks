// Content Script - Automatic CX-Bucks
// Runs on kick.com pages to handle chat automation

(function () {
  'use strict';

  let settings = {};
  let chatObserver = null;
  let parrotPool = [];       // rolling buffer of clean message strings for parrot mode
  const PARROT_POOL_SIZE = 200;
  const PARROT_MIN_POOL  = 15;

  const BOT_USERNAMES = new Set([
    'kickbot', 'botrix', 'streamelements', 'nightbot', 'moobot',
    'fossabot', 'wizebot', 'ohbot', 'deepbot', 'phantombot',
    'commanderroot', 'electricallongboard', 'soundalerts', 'kofistreambot',
    'streamlabs', 'continuity', 'owncast', 'sery_bot', 'stormstreamer', 'pepperpal'
  ]);

  let initialized = false;

  // ── Live status ──
  let streamerIsLive = true; // optimistic; background corrects within ~1 min

  function getCurrentUsername() {
    const match = location.pathname.match(/^\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  loadSettings().then(() => {
    waitForChat();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SETTINGS_UPDATED') {
      settings = message.settings;
      applySettings();
    }

    if (message.type === 'STREAMER_STATUS_UPDATE') {
      const username = getCurrentUsername();
      if (username && message.username.toLowerCase() === username) {
        const wasLive = streamerIsLive;
        streamerIsLive = message.isLive;
        if (!streamerIsLive && wasLive) {
          console.log('[CXBucks] Streamer went offline. Pausing timers.');
          stopParrotTimer();
        } else if (streamerIsLive && !wasLive) {
          console.log('[CXBucks] Streamer is online. Resuming timers.');
          applySettings();
        }
      }
    }
  });

  function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['settings'], (data) => {
        settings = data.settings || {};
        resolve();
      });
    });
  }

  function waitForChat() {
    const interval = setInterval(() => {
      const chatContainer = getChatContainer();
      if (chatContainer && !initialized) {
        initialized = true;
        clearInterval(interval);
        console.log('[CXBucks] Chat detected, initializing features.');
        applySettings();
        observeChat(chatContainer);
      }
    }, 2000);
  }

  function getChatContainer() {
    return (
      document.querySelector('[data-testid="chat-messages"]') ||
      document.querySelector('.chat-messages-wrapper') ||
      document.querySelector('#chatroom-messages') ||
      document.querySelector('.chat-message-list') ||
      document.querySelector('[class*="chat-messages"]') ||
      document.querySelector('[class*="chatroom"]')
    );
  }

  function getChatInput() {
    return (
      document.querySelector('[data-testid="chat-input"]') ||
      document.querySelector('.chat-input') ||
      document.querySelector('[placeholder*="Send a message"]') ||
      document.querySelector('[contenteditable="true"][class*="chat"]') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }

  function applySettings() {
    if (settings.parrot) {
      startParrotTimer();
    } else {
      stopParrotTimer();
    }
  }

  // ─── PARROT TIMER ─────────────────────────────────────────────────────────
  // Fires every 60 seconds; settings.parrot acts as a 100% chance gate.

  let parrotInterval = null;

  function startParrotTimer() {
    if (parrotInterval) return;
    parrotInterval = setInterval(() => {
      if (settings.parrot && streamerIsLive) {
        fireParrot();
      }
    }, 60000);
  }

  function stopParrotTimer() {
    if (parrotInterval) {
      clearInterval(parrotInterval);
      parrotInterval = null;
    }
  }

  function fireParrot() {
    if (parrotPool.length < PARROT_MIN_POOL) return;
    const safePool = parrotPool.length > 10 ? parrotPool.slice(0, -5) : parrotPool;
    const pick = safePool[Math.floor(Math.random() * safePool.length)];
    if (!pick) return;
    sendChatMessage(pick);
    console.log(`[CXBucks] Parrot sent: ${pick}`);
  }

  // ─── CHAT OBSERVER ────────────────────────────────────────────────────────

  function observeChat(container) {
    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const msgText = extractMessageText(node);
          if (!msgText) continue;
          const sender = extractSenderName(node);
          handleNewMessage(msgText, sender, node);
        }
      }
    });

    chatObserver.observe(container, { childList: true, subtree: true });
    console.log('[CXBucks] Chat observation started.');
  }

  function cleanMessageText(text) {
    return text
      // strip leading timestamp e.g. "3:45 AM" or "11:02PM"
      .replace(/^\d{1,2}:\d{2}\s*[AP]M\s*/i, '')
      // strip bare AM/PM at start
      .replace(/^[AP]M\s+/i, '')
      // strip "Global" badge label
      .replace(/^global\s+/i, '')
      // strip anything up to and including the last ":" on the first line
      // handles "username:", "@username:", "1-Month Subscriber (username):", etc.
      .replace(/^[^\n]{0,100}:\s*/, '')
      .trim();
  }

  function isSystemMessage(text) {
    return /subscriber|subscribed|follow|redeemed|level|replying to/i.test(text) ||
           text.includes('@') ||
           // patterns like "1-Month", "3-Month", gift subs, etc.
           /\d+-month|gifted|gift sub|raid/i.test(text);
  }

  function extractMessageText(node) {
    const contentEl = (
      node.querySelector('[data-testid="chat-message-content"]') ||
      node.querySelector('[class*="message-content"]') ||
      node.querySelector('[class*="chat-entry-content"]') ||
      node.querySelector('[class*="message-text"]')
    );

    const source = contentEl || node;
    const clone = source.cloneNode(true);

    // Remove reply quote blocks (the quoted original message shown above a reply)
    clone.querySelectorAll(
      '[class*="reply"], [data-testid*="reply"], ' +
      '[class*="quoted"], [class*="quote"], [class*="original-message"]'
    ).forEach(el => el.remove());

    // Remove timestamp/username/badge elements (only needed on full-node fallback,
    // but harmless to run on contentEl clones too)
    clone.querySelectorAll(
      'time, [class*="timestamp"], [class*="time"], [data-testid*="time"]'
    ).forEach(el => el.remove());
    clone.querySelectorAll(
      '[class*="username"], [class*="sender"], [class*="author"], ' +
      '[class*="badge"], [class*="chat-entry-username"], ' +
      '[data-testid*="username"], [data-testid*="sender"]'
    ).forEach(el => el.remove());

    // Replace each emote img with " emoteName " so words don't run together
    clone.querySelectorAll('img').forEach(img => {
      const name = img.alt?.trim() || '';
      img.replaceWith(document.createTextNode(name ? ` ${name} ` : ' '));
    });

    // Collapse runs of whitespace to a single space
    const text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return cleanMessageText(text);
  }

  function extractSenderName(node) {
    const senderEl = (
      node.querySelector('[data-testid="chat-entry-username"]') ||
      node.querySelector('[class*="username"]') ||
      node.querySelector('[class*="sender"]') ||
      node.querySelector('[class*="author"]')
    );
    return senderEl?.textContent?.trim().toLowerCase().replace(/^@/, '') || '';
  }

  // ─── MESSAGE HANDLING ────────────────────────────────────────────────────

  function handleNewMessage(text, sender, node) {
    const isWSpam = /^w+$/i.test(text.trim());
    const isCommand = text.startsWith('$') || text.startsWith('!') || text.startsWith('/');
    const isBot = sender && BOT_USERNAMES.has(sender);
    const isTimestampArtifact = /[AP]MLevel/i.test(text);
    const isUIArtifact = /^(global|am|pm)$/i.test(text.trim());
    const isUILeakage = isSystemMessage(text);
    // reject if text is just a username (no spaces, looks like a handle)
    const isBareName = /^@?[\w\-\.]{1,30}$/.test(text.trim()) && !/\s/.test(text.trim());
    if (!isWSpam && !isCommand && !isBot && !isTimestampArtifact && !isUIArtifact && !isUILeakage && !isBareName && text.length >= 3 && text.length <= 200) {
      parrotPool.push(text);
      if (parrotPool.length > PARROT_POOL_SIZE) parrotPool.shift();
    }
  }

  // ─── SEND CHAT MESSAGE ───────────────────────────────────────────────────

  function sendChatMessage(text) {
    const input = getChatInput();
    if (!input) {
      console.warn('[CXBucks] Chat input not found.');
      return;
    }

    input.focus();

    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = '';
      document.execCommand('insertText', false, text);
    } else {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set || Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    setTimeout(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
      }));
      input.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
      }));

      const sendBtn = (
        document.querySelector('[data-testid="chat-send-button"]') ||
        document.querySelector('button[type="submit"][class*="chat"]') ||
        document.querySelector('[class*="send-button"]') ||
        document.querySelector('[aria-label*="send" i]')
      );
      if (sendBtn) sendBtn.click();
    }, 100);
  }

  // Re-initialize on SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      initialized = false;
      parrotPool = [];
      stopParrotTimer();
      if (settings.parrot) startParrotTimer();
      if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
      setTimeout(waitForChat, 2000);
    }
  }).observe(document, { subtree: true, childList: true });

})();
