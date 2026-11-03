import { systemKey, type TeamAccount } from '../../src/lib/otp';

/** host of a login link, "www." dropped: "https://www.a.vn/login" and "a.vn" both give "a.vn" */
export function hostOf(link: string): string | null {
  const s = link.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : 'https://' + s).hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/** the page belongs to the account: same site, or one of its subdomains */
export function matches(a: TeamAccount, pageHost: string | null) {
  const h = hostOf(a.url);
  return !!h && !!pageHost && (pageHost === h || pageHost.endsWith('.' + h));
}

/** every word typed appears in the system, environment, username, link or note — case and accents ignored */
export function search(list: TeamAccount[], query: string) {
  const words = systemKey(query).split(' ').filter(Boolean);
  if (!words.length) return list;
  return list.filter((a) => {
    const hay = systemKey(`${a.system} ${a.env} ${a.username} ${a.url} ${a.note}`);
    return words.every((w) => hay.includes(w));
  });
}
