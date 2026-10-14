// Guards for fetching user-supplied URLs (recipe scraping).
// Without this, anyone could make the server request internal addresses
// (cloud metadata endpoints, the database host, localhost admin pages, etc.).
const dns = require('dns').promises;
const net = require('net');

const blocked = new net.BlockList();
// IPv4 private, loopback, link-local, CGNAT, multicast, reserved
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, 'ipv4'));
// IPv6 loopback, unspecified, unique-local, link-local, multicast, IPv4-mapped
[
  ['::1', 128],
  ['::', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, 'ipv6'));

function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blocked.check(address, 'ipv4');
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return true;
}

class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
    this.status = 400;
  }
}

// Throws UnsafeUrlError unless the URL is http(s) and resolves only to public addresses.
async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new UnsafeUrlError('That does not look like a valid web address.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UnsafeUrlError('Only http and https links are supported.');
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Links with embedded logins are not supported.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UnsafeUrlError('That address is not allowed.');
  }
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new UnsafeUrlError('Could not find that website.');
    }
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    throw new UnsafeUrlError('That address is not allowed.');
  }
  return url;
}

// Look like a normal browser: many recipe sites turn away requests that don't.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

// Fetch a public page as text, re-checking every redirect hop, with a timeout and size cap.
async function fetchPublicPage(rawUrl, { maxBytes = 3 * 1024 * 1024, timeoutMs = 15000, maxRedirects = 5 } = {}) {
  const fetchFn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch')).default;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    let res;
    try {
      res = await fetchFn(url.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: BROWSER_HEADERS,
      });
    } catch (e) {
      const err = new Error(
        e && (e.name === 'TimeoutError' || e.name === 'AbortError')
          ? `${url.hostname} took too long to respond. Try again, or use a screenshot with "From a photo".`
          : `Couldn't connect to ${url.hostname}. Check the link and try again.`
      );
      err.status = 422;
      throw err;
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), url).toString();
      continue;
    }
    if (!res.ok) {
      const blocked = [401, 402, 403, 429, 451, 503].includes(res.status);
      const err = new Error(
        blocked
          ? `${url.hostname} blocked the app from reading this page (error ${res.status}). ` +
            'Some recipe sites do this. Take a screenshot of the recipe and use "From a photo", ' +
            'or copy the recipe text and use "From pasted text".'
          : `Couldn't open that page (error ${res.status}). Check the link and try again.`
      );
      err.status = 422;
      throw err;
    }
    const length = Number(res.headers.get('content-length') || 0);
    if (length > maxBytes) throw new Error('Page is too large to read.');
    const text = await res.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  throw new Error('Too many redirects.');
}

module.exports = { assertPublicUrl, fetchPublicPage, BROWSER_HEADERS, isBlockedAddress, UnsafeUrlError };
