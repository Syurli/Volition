import { describe, expect, it } from 'vitest';

const PAGE_URL = 'https://syurli.github.io/Willform/';
const EXPECTED_MAIN_SHA = 'b368c044554a6ba989624cb642c3d05ac2687ddf';

async function deployedBundleContainsExpectedSha(): Promise<boolean> {
  const nonce = Date.now();
  const htmlResponse = await fetch(`${PAGE_URL}?verify=${nonce}`, { headers: { 'cache-control': 'no-cache' } });
  if (!htmlResponse.ok) return false;
  const html = await htmlResponse.text();
  const match = html.match(/<script[^>]+src=["']([^"']*assets\/index-[^"']+\.js)["']/i);
  if (!match?.[1]) return false;
  const assetUrl = new URL(match[1], PAGE_URL);
  assetUrl.searchParams.set('verify', String(nonce));
  const jsResponse = await fetch(assetUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!jsResponse.ok) return false;
  return (await jsResponse.text()).includes(EXPECTED_MAIN_SHA);
}

describe('temporary Recovery R4 Pages deployment probe', () => {
  it('serves the exact merged main commit in the deployed Workbench bundle', async () => {
    let matched = false;
    for (let attempt = 0; attempt < 12 && !matched; attempt += 1) {
      matched = await deployedBundleContainsExpectedSha();
      if (!matched) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    expect(matched).toBe(true);
  }, 45_000);
});
