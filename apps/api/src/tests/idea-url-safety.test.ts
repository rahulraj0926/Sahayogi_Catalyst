/* Which website addresses a competitor may have, and that the checker never reaches a private one. No network is used. Run: npx ts-node --transpile-only src/tests/idea-url-safety.test.ts */
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { normaliseLink, normaliseWebsite } from '../ideas/innovation';
import { SafeUrlChecker, inspectUrl, isPublicAddress, safeLookup, titleOf } from '../ideas/url-checker';
import { done, ok } from './helpers';

async function main() {
  await ok('public IPv4 addresses are accepted', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '203.0.114.1']) assert.equal(isPublicAddress(ip), true, ip);
  });

  await ok('private, loopback, link-local, shared, reserved and multicast IPv4 addresses are refused', () => {
    for (const ip of ['0.0.0.0', '10.0.0.1', '10.255.255.255', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.255.255',
      '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', '300.1.1.1', '1.2.3']) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  await ok('IPv6: only global unicast is public; loopback, unique-local, link-local, multicast, documentation and special blocks are refused', () => {
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
    assert.equal(isPublicAddress('2a00:1450:4001:81b::200e'), true);
    for (const ip of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1', '2001:db8::1', '2001::1', '2001:2::1', '2001:10::1', '3fff::1', '100::1', 'not-an-ip', 'fe80::1%eth0']) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
  });

  await ok('IPv4 hidden inside IPv6 (mapped, 6to4, NAT64) is judged by the IPv4 inside', () => {
    assert.equal(isPublicAddress('::ffff:8.8.8.8'), true);
    assert.equal(isPublicAddress('::ffff:127.0.0.1'), false);
    assert.equal(isPublicAddress('::ffff:7f00:1'), false);
    assert.equal(isPublicAddress('::ffff:10.1.2.3'), false);
    assert.equal(isPublicAddress('::ffff:169.254.169.254'), false);
    assert.equal(isPublicAddress('2002:0808:0808::1'), true);
    assert.equal(isPublicAddress('2002:7f00:0001::1'), false);
    assert.equal(isPublicAddress('64:ff9b::808:808'), true);
    assert.equal(isPublicAddress('64:ff9b::a00:1'), false);
    assert.equal(isPublicAddress('[::1]'), false);
  });

  await ok('an address a person types is judged the same way: scheme, credentials, port, inside names and IP numbers', () => {
    const unsafe = ['ftp://acme.com', 'file:///etc/passwd', 'gopher://acme.com', 'https://user:pw@acme.com', 'https://acme.com:8443', 'http://acme.com:8080/x', 'https://localhost', 'https://LOCALHOST/x',
      'https://app.localhost', 'https://printer.local', 'https://db.internal', 'https://wiki.corp', 'https://intranet', 'https://router.lan', 'http://127.0.0.1', 'http://10.0.0.5/admin', 'http://169.254.169.254/latest/meta-data',
      'http://[::1]/', 'http://192.168.0.1', 'http://2130706433', 'http://0x7f.1'];
    for (const u of unsafe) {
      const r = inspectUrl(u);
      assert.equal(r.ok, false, u);
      if (!r.ok) assert.equal(r.reason, 'unsafe', u);
    }
    for (const u of ['https://acme.com', 'http://acme.com/pricing', 'https://www.acme.co.in/a?b=c', 'https://sub.domain.example.org']) assert.equal(inspectUrl(u).ok, true, u);
    const bad = inspectUrl('http://8.8.8.8');
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, 'bad', 'a public IP number is not a business website name');
  });

  await ok('normalising: scheme added, host lowercased, fragment dropped; junk is refused', () => {
    assert.deepEqual(normaliseWebsite('  Acme.COM/pricing#plans '), { ok: true, url: 'https://acme.com/pricing', host: 'acme.com' });
    assert.deepEqual(normaliseWebsite('http://www.Acme.com'), { ok: true, url: 'http://www.acme.com/', host: 'www.acme.com' });
    for (const junk of ['', '   ', 'hello world', 'javascript:alert(1)', 'mailto:a@b.com', 'https://', 'not a url at all']) assert.equal(normaliseWebsite(junk).ok, false, junk);
  });

  await ok('a demo link must be a plain http or https address, and is never opened by the server', () => {
    assert.equal(normaliseLink('youtu.be/abc'), 'https://youtu.be/abc');
    assert.equal(normaliseLink('https://acme.com/demo#x'), 'https://acme.com/demo');
    assert.equal(normaliseLink(''), null);
    assert.equal(normaliseLink(null), null);
    assert.equal(normaliseLink(undefined), undefined);
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com/a', 'https://u:p@acme.com', 'localhost', 'not a url']) assert.equal(normaliseLink(bad), undefined, bad);
  });

  await ok('titles are read from the page: entities decoded, spaces tidied, 200 characters at most', () => {
    assert.equal(titleOf('<html><head><TITLE lang="en">\n  Acme &amp; Sons &#8211; Billing &quot;made&quot; easy &#x2019;s  \n</TITLE></head>'), 'Acme & Sons – Billing "made" easy ’s');
    assert.equal(titleOf('<title></title>'), null);
    assert.equal(titleOf('<p>no title here</p>'), null);
    assert.equal(titleOf(`<title>${'x'.repeat(500)}</title>`)?.length, 200);
    assert.equal(titleOf('<title>Broken &#99999999999; entity</title>'), 'Broken entity');
  });

  await ok('the lookup used when connecting refuses a name that points at this machine (so a changed DNS answer cannot slip through)', async () => {
    const err: NodeJS.ErrnoException = await new Promise((resolve) => safeLookup('localhost', {}, (e: unknown) => resolve(e as NodeJS.ErrnoException)));
    assert.equal(err?.code, 'UNSAFE_ADDRESS');
    const all: NodeJS.ErrnoException = await new Promise((resolve) => safeLookup('localhost', { all: true }, (e: unknown) => resolve(e as NodeJS.ErrnoException)));
    assert.equal(all?.code, 'UNSAFE_ADDRESS');
  });

  await ok('the real checker never contacts a private address: a local server sees no request', async () => {
    let hits = 0;
    const server = http.createServer((_, res) => { hits++; res.end('<title>secret</title>'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const checker = new SafeUrlChecker();
    try {
      for (const target of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://[::1]:${port}/`, 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'file:///etc/passwd', 'https://user:pw@acme.com', 'https://acme.com:8443/']) {
        const r = await checker.check(target);
        assert.deepEqual(r, { ok: false, reason: 'unsafe' }, target);
      }
    } finally { server.close(); }
    assert.equal(hits, 0);
  });

  done();
}
main().catch((e) => { console.error(e); process.exit(1); });
