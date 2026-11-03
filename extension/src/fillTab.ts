import type { FillResult } from './fill';

type Fill = (u: string, p: string | null, o: string | null) => FillResult;

/** fills every frame of the tab through the content script (injected first — pages opened before install lack it) */
export async function fillTab(tabId: number, username: string, password: string | null, otp: string | null): Promise<FillResult> {
  const run = async (allFrames: boolean) => {
    const target = { tabId, allFrames };
    await chrome.scripting.executeScript({ target, files: ['content.js'] });
    return chrome.scripting.executeScript({
      target,
      // runs in the content script's world, where it left the fill function
      func: (u: string, p: string | null, o: string | null) => (globalThis as { __wptFill?: Fill }).__wptFill?.(u, p, o) ?? null,
      args: [username, password, otp],
    });
  };
  // a frame that cannot be scripted (an error page, about:blank…) fails the whole call; the page itself is enough then
  const done = await run(true).catch(() => run(false));
  return done.reduce<FillResult>((s, f) => (f.result ? { user: s.user || f.result.user, pass: s.pass || f.result.pass, otp: s.otp || f.result.otp } : s), { user: false, pass: false, otp: false });
}
