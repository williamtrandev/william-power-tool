import { fillLogin, isLoginField } from './fill';
import type { ContentFill, FrameSignal, OpenReply } from './messages';

/**
 * Runs in every page (and frame). Opens the account menu under a login box when it gets focus, and fills on request.
 * The menu is an extension page in an iframe inside a closed shadow root: the page sees neither the account list
 * nor what is typed in it. Account data never passes through here except the values being filled.
 */

declare global {
  // eslint-disable-next-line no-var
  var __wptFill: typeof fillLogin | undefined;
}

const W = 340;
const MAX_H = 380;

interface Menu {
  anchor: HTMLInputElement;
  host: HTMLDivElement;
  frame: HTMLIFrameElement;
  h: number;
}

// the popup injects this file again before filling; set up once
if (!globalThis.__wptFill) {
  globalThis.__wptFill = (u, p, o) => fillLogin(u, p, o);
  init();
}

function init() {
  let menu: Menu | null = null;
  let opening: HTMLInputElement | null = null;
  // filling focuses the boxes it fills: don't reopen on that
  let quietUntil = 0;

  const place = () => {
    if (!menu) return;
    if (!menu.anchor.isConnected) return close();
    const r = menu.anchor.getBoundingClientRect();
    const width = Math.min(W, innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, innerWidth - width - 8));
    const below = innerHeight - r.bottom;
    const top = below >= menu.h + 12 || below >= r.top ? r.bottom + 4 : Math.max(8, r.top - menu.h - 4);
    Object.assign(menu.host.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${menu.h}px` });
  };

  const close = () => {
    menu?.host.remove();
    menu = null;
  };

  const open = async (el: HTMLInputElement) => {
    if (menu?.anchor === el || opening === el || Date.now() < quietUntil) return;
    opening = el;
    const r = (await chrome.runtime.sendMessage({ type: 'inline-open' }).catch(() => null)) as OpenReply | null;
    opening = null;
    if (!r?.token || document.activeElement !== el) return;
    close();

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;margin:0;padding:0;border:0;';
    const root = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('inline.html') + '#' + r.token;
    frame.allow = 'clipboard-write';
    frame.title = 'William Tool';
    frame.style.cssText = 'all:initial;display:block;width:100%;height:100%;border:0;border-radius:10px;box-shadow:0 12px 40px -8px rgb(0 0 0/.35),0 0 0 1px rgb(0 0 0/.08);background:transparent;color-scheme:normal;';
    root.append(frame);
    document.documentElement.append(host);
    menu = { anchor: el, host, frame, h: 200 };
    place();
  };

  // a login box got focus (click or Tab)
  addEventListener(
    'focusin',
    (e) => {
      const t = e.target;
      if (menu && t === menu.host) return;
      if (t instanceof HTMLInputElement && isLoginField(t)) open(t);
      else close();
    },
    true,
  );
  // clicked again after Esc closed it
  addEventListener(
    'mousedown',
    (e) => {
      const t = e.target;
      if (menu && (t === menu.host || t === menu.anchor)) return;
      close();
      if (t instanceof HTMLInputElement && document.activeElement === t && isLoginField(t)) open(t);
    },
    true,
  );
  addEventListener(
    'keydown',
    (e) => {
      if (!menu || e.target !== menu.anchor) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        menu.frame.focus();
        menu.frame.contentWindow?.postMessage({ wpt: 'focus' } satisfies FrameSignal, '*');
      }
    },
    true,
  );
  addEventListener('scroll', place, true);
  addEventListener('resize', place);

  // layout signals from the menu frame (nothing secret travels this way)
  addEventListener('message', (e: MessageEvent<FrameSignal>) => {
    if (!menu || e.source !== menu.frame.contentWindow) return;
    if (e.data?.wpt === 'size') {
      menu.h = Math.min(MAX_H, Math.max(60, Math.ceil(e.data.h)));
      place();
    } else if (e.data?.wpt === 'close') {
      menu.anchor.focus();
      quietUntil = Date.now() + 400;
      close();
    }
  });

  // the menu asked (through the background) to fill this frame
  chrome.runtime.onMessage.addListener((msg: ContentFill, _sender, reply) => {
    if (msg?.type !== 'fill') return;
    quietUntil = Date.now() + 1500;
    close();
    reply(fillLogin(msg.username, msg.password, msg.otp));
  });
}
