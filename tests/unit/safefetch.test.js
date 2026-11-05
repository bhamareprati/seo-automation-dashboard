import http from 'node:http';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { safeFetch } = require('../../src/crawlers/safeFetch.js');
const { isBlockedAddress, isBlockedHostname, normalizeWebsiteUrl } = require('../../src/lib/url.js');

const reason = (promise) => promise.then(() => 'no error', (err) => err.reason);

let server;
let port;
let requests;
// Lets the tests reach the local test server, while everything else about the checks stays real.
const testPolicy = () => ({
  allowedPorts: [port, 80, 443],
  isBlockedHostname: (host) => host === 'blocked.test' || host === '169.254.169.254',
  isBlockedAddress: () => false,
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    requests.push(req);
    if (req.url === '/ok') return res.end('<html>hello</html>');
    if (req.url === '/gzip') {
      res.setHeader('content-encoding', 'gzip');
      return res.end(zlib.gzipSync('<html>compressed</html>'));
    }
    if (req.url === '/huge') {
      const chunk = Buffer.alloc(64 * 1024, 'a');
      let sent = 0;
      const write = () => {
        while (sent < 400) {
          sent += 1;
          if (!res.write(chunk)) return res.once('drain', write);
        }
        return res.end();
      };
      return write();
    }
    if (req.url === '/bomb') {
      res.setHeader('content-encoding', 'gzip');
      return res.end(zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, 'a')));
    }
    if (req.url === '/slow') return setTimeout(() => res.end('late'), 3000);
    if (req.url === '/to-ok') {
      res.statusCode = 302;
      res.setHeader('location', '/ok');
      return res.end();
    }
    if (req.url === '/to-metadata') {
      res.statusCode = 302;
      res.setHeader('location', 'http://169.254.169.254/latest/meta-data/');
      return res.end();
    }
    if (req.url === '/to-file') {
      res.statusCode = 302;
      res.setHeader('location', 'file:///etc/passwd');
      return res.end();
    }
    if (req.url === '/loop') {
      res.statusCode = 302;
      res.setHeader('location', '/loop');
      return res.end();
    }
    res.statusCode = 404;
    return res.end('nope');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  requests = [];
});

afterAll(() => server.close());

const local = (path) => `http://127.0.0.1:${port}${path}`;

describe('safeFetch', () => {
  it('safeFetch rejects private addresses', async () => {
    const literals = [
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://172.16.0.1/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[::ffff:10.0.0.1]/',
      'http://localhost/',
      'http://printer.local/',
    ];
    for (const url of literals) {
      expect(await reason(safeFetch(url)), url).toBe('BLOCKED');
    }
  });

  it('safeFetch rejects a public hostname that resolves to a private address', async () => {
    const dnsLookup = (host, options, callback) => callback(null, [{ address: '10.0.0.5', family: 4 }]);
    expect(await reason(safeFetch('http://sneaky.example/', { policy: { dnsLookup } }))).toBe('BLOCKED');

    const mixed = (host, options, callback) =>
      callback(null, [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    expect(await reason(safeFetch('http://sneaky.example/', { policy: { dnsLookup: mixed } }))).toBe('BLOCKED');
  });

  it('safeFetch rejects other schemes and ports', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/']) {
      expect(await reason(safeFetch(url)), url).toBe('SCHEME');
    }
    for (const url of ['http://example.com:22/', 'https://example.com:8443/', 'http://example.com:6379/']) {
      expect(await reason(safeFetch(url)), url).toBe('PORT');
    }
  });

  it('safeFetch re-validates redirects', async () => {
    const policy = testPolicy();
    const good = await safeFetch(local('/to-ok'), { policy });
    expect(good.status).toBe(200);
    expect(good.body).toBe('<html>hello</html>');
    expect(good.redirects).toBe(1);
    expect(good.url).toBe(local('/ok'));

    expect(await reason(safeFetch(local('/to-metadata'), { policy }))).toBe('BLOCKED');
    expect(await reason(safeFetch(local('/to-file'), { policy }))).toBe('SCHEME');
    expect(await reason(safeFetch(local('/loop'), { policy }))).toBe('TOO_MANY_REDIRECTS');
  });

  it('safeFetch stops at the size limit', async () => {
    const res = await safeFetch(local('/huge'), { policy: testPolicy(), maxBytes: 100 * 1024 });
    expect(res.truncated).toBe(true);
    expect(res.bytes).toBe(100 * 1024);
    expect(Buffer.byteLength(res.body)).toBe(100 * 1024);
  });

  it('safeFetch counts a compressed body after decompressing it', async () => {
    const res = await safeFetch(local('/bomb'), { policy: testPolicy(), maxBytes: 1024 * 1024 });
    expect(res.truncated).toBe(true);
    expect(res.bytes).toBe(1024 * 1024);
  });

  it('safeFetch enforces the timeout', async () => {
    const t0 = Date.now();
    expect(await reason(safeFetch(local('/slow'), { policy: testPolicy(), timeoutMs: 200 }))).toBe('TIMEOUT');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('safeFetch reads compressed pages and reports the status', async () => {
    const policy = testPolicy();
    expect((await safeFetch(local('/gzip'), { policy })).body).toBe('<html>compressed</html>');
    expect((await safeFetch(local('/missing'), { policy })).status).toBe(404);
  });

  it('safeFetch sends no cookies or credentials', async () => {
    requests = [];
    await safeFetch(local('/ok'), { policy: testPolicy() });
    const { headers } = requests[0];
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers['user-agent']).toBe('SEOAuditDashboard/1.0');
  });
});

describe('address rules', () => {
  it('sorts public and private addresses', () => {
    for (const address of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.31.0.1', '192.168.0.1', '::1', 'fe80::1', '::ffff:192.168.0.1']) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });

  it('recognises internal hostnames', () => {
    for (const host of ['localhost', 'LOCALHOST', 'db.internal', 'nas.local', 'x.localhost', '127.0.0.1', '[::1]']) {
      expect(isBlockedHostname(host), host).toBe(true);
    }
    expect(isBlockedHostname('example.com')).toBe(false);
  });

  it('client URL is normalised', () => {
    expect(normalizeWebsiteUrl('  https://Example.COM/  ')).toBe('https://example.com');
    expect(normalizeWebsiteUrl('http://example.com/clinic/')).toBe('http://example.com/clinic');
    expect(normalizeWebsiteUrl('https://example.com/?utm=1#top')).toBe('https://example.com');
  });

  it('private address is rejected when adding a client', () => {
    for (const url of ['http://169.254.169.254/', 'http://localhost/', 'http://10.0.0.1']) {
      expect(() => normalizeWebsiteUrl(url), url).toThrow(/private network/);
    }
    for (const url of ['example.com', 'ftp://example.com', 'https://user:pw@example.com', '']) {
      expect(() => normalizeWebsiteUrl(url), url).toThrow(/full website address/);
    }
  });
});
