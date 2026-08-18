import { describe, expect, it } from 'vitest';

const PAGE_URL = 'https://syurli.github.io/Willform/';
const EXPECTED_MAIN_SHA = '883fb33f2878285b72e39f296020e1138e4bca4d';

describe('temporary final R3 Pages deployment probe', () => {
  it('serves the exact cleaned main commit in the deployed Workbench bundle', async () => {
    const nonce = Date.now();
    const htmlResponse = await fetch(`${PAGE_URL}?verify=${nonce}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    expect(htmlResponse.ok).toBe(true);
    const html = await htmlResponse.text();
    const match = html.match(/<script[^>]+src=["']([^"']*assets\/index-[^"']+\.js)["']/i);
    expect(match?.[1]).toBeTruthy();

    const assetUrl = new URL(match![1]!, PAGE_URL);
    assetUrl.searchParams.set('verify', String(nonce));
    const jsResponse = await fetch(assetUrl, {
      headers: { 'cache-control': 'no-cache' },
    });
    expect(jsResponse.ok).toBe(true);
    const js = await jsResponse.text();
    expect(js).toContain(EXPECTED_MAIN_SHA);
  }, 20_000);
});
