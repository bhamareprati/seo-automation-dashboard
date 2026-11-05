const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const zlib = require('node:zlib');
const { isBlockedAddress, isBlockedHostname } = require('../lib/url');

const USER_AGENT = 'SEOAuditDashboard/1.0';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class SafeFetchError extends Error {
  /** @param {'SCHEME'|'PORT'|'BLOCKED'|'TIMEOUT'|'TOO_MANY_REDIRECTS'|'NETWORK'} reason */
  constructor(reason, detail) {
    super(`${reason}: ${detail}`);
    this.name = 'SafeFetchError';
    this.reason = reason;
  }
}

const STRICT_POLICY = {
  isBlockedAddress,
  isBlockedHostname,
  allowedPorts: [80, 443],
  dnsLookup: dns.lookup,
};

function checkUrl(url, policy) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('SCHEME', url.protocol);
  }
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!policy.allowedPorts.includes(port)) throw new SafeFetchError('PORT', String(port));
  if (policy.isBlockedHostname(url.hostname)) throw new SafeFetchError('BLOCKED', 'internal hostname');
}

/**
 * Checks addresses at the moment of connecting. The address that passes is the one used,
 * so a hostname can't pass this check and then switch to an internal address (DNS rebinding).
 */
function guardedLookup(policy) {
  return (hostname, options, callback) => {
    policy.dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses.length || addresses.some((a) => policy.isBlockedAddress(a.address))) {
        return callback(new SafeFetchError('BLOCKED', 'hostname points to a private address'));
      }
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function decoderFor(encoding) {
  if (encoding === 'gzip' || encoding === 'x-gzip') return zlib.createGunzip();
  if (encoding === 'deflate') return zlib.createInflate();
  if (encoding === 'br') return zlib.createBrotliDecompress();
  return null;
}

function requestOnce(url, { timeoutMs, maxBytes, policy }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;
    let req;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
      req?.destroy();
    };

    // Covers the whole request, including a server that sends its body very slowly.
    const timer = setTimeout(
      () => finish(reject, new SafeFetchError('TIMEOUT', `no complete response in ${timeoutMs} ms`)),
      timeoutMs,
    );

    req = client.request(
      url,
      {
        method: 'GET',
        agent: false,
        lookup: guardedLookup(policy),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, br',
        },
      },
      (res) => {
        const base = { status: res.statusCode, headers: res.headers };
        if (REDIRECT_STATUSES.has(res.statusCode) && res.headers.location) {
          res.resume();
          finish(resolve, { ...base, body: '', bytes: 0, truncated: false });
          return;
        }
        const decoder = decoderFor(res.headers['content-encoding']);
        const stream = decoder ? res.pipe(decoder) : res;
        const chunks = [];
        let bytes = 0;
        const done = (truncated) =>
          finish(resolve, { ...base, body: Buffer.concat(chunks).toString('utf8'), bytes, truncated });

        stream.on('data', (chunk) => {
          // Counted after decompression, so a small compressed bomb can't get past the limit.
          const room = maxBytes - bytes;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          bytes += Math.min(chunk.length, room);
          if (bytes >= maxBytes) done(true);
        });
        stream.on('end', () => done(false));
        stream.on('error', (err) => finish(reject, new SafeFetchError('NETWORK', err.code || err.message)));
        res.on('error', (err) => finish(reject, new SafeFetchError('NETWORK', err.code || err.message)));
      },
    );
    req.on('error', (err) => {
      if (err instanceof SafeFetchError) finish(reject, err);
      else finish(reject, new SafeFetchError('NETWORK', err.code || err.message));
    });
    req.end();
  });
}

/**
 * The only way the crawler reaches the internet. Sends no cookies or credentials.
 * Every redirect is checked again from scratch.
 * @param {string} target
 * @param {{ timeoutMs?: number, maxBytes?: number, maxRedirects?: number, policy?: object }} options
 * @returns {Promise<{ url: string, status: number, headers: object, body: string, bytes: number, truncated: boolean, redirects: number, ms: number }>}
 */
async function safeFetch(target, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BYTES, maxRedirects = MAX_REDIRECTS } = options;
  const policy = { ...STRICT_POLICY, ...options.policy };
  const startedAt = Date.now();
  let url = new URL(target);

  for (let redirects = 0; ; redirects += 1) {
    checkUrl(url, policy);
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) throw new SafeFetchError('TIMEOUT', `no complete response in ${timeoutMs} ms`);

    const response = await requestOnce(url, { timeoutMs: remaining, maxBytes, policy });
    const location = REDIRECT_STATUSES.has(response.status) ? response.headers.location : null;
    if (!location) {
      return { ...response, url: url.href, redirects, ms: Date.now() - startedAt };
    }
    if (redirects >= maxRedirects) throw new SafeFetchError('TOO_MANY_REDIRECTS', String(maxRedirects));
    url = new URL(location, url);
  }
}

module.exports = { safeFetch, SafeFetchError, USER_AGENT, MAX_BYTES, isIpLiteral: (h) => net.isIP(h) !== 0 };
