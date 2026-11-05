const net = require('node:net');
const { ValidationError } = require('./errors');
const { message } = require('./messages');

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // includes cloud metadata services
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, 'ipv6'));

/** True for loopback, private, link-local and other addresses a public crawler must never reach. */
function isBlockedAddress(address) {
  const bare = String(address).replace(/^\[|\]$/g, '');
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isBlockedAddress(mapped[1]);
  const family = net.isIP(bare);
  if (family === 4) return blocked.check(bare, 'ipv4');
  if (family === 6) return blocked.check(bare, 'ipv6');
  return true; // Not an IP address at all: refuse rather than guess.
}

/** True when a hostname is obviously internal, before any DNS lookup. */
function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  return net.isIP(host) !== 0 && isBlockedAddress(host);
}

/**
 * Cleans a website address from a form, for storing and comparing.
 * @param {string} input
 * @returns {string} for example https://example.com
 */
function normalizeWebsiteUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new ValidationError(message('M-URL-INVALID'));
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ValidationError(message('M-URL-INVALID'));
  if (url.username || url.password) throw new ValidationError(message('M-URL-INVALID'));
  if (isBlockedHostname(url.hostname)) throw new ValidationError(message('M-URL-BLOCKED'));
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host.toLowerCase()}${path}`;
}

module.exports = { isBlockedAddress, isBlockedHostname, normalizeWebsiteUrl };
