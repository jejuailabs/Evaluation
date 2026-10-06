import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { publicEntry } from '../server/entry';

const landing = readFileSync(new URL('../landing/index.html', import.meta.url), 'utf8');

test('메인 주소와 마케팅 쿼리는 랜딩을 열고 데모를 자동 시작하지 않음', async () => {
  for (const query of ['', '?utm_source=partner', '?mode=unknown']) {
    const response = publicEntry(new Request(`https://evaluation.example/${query}`), landing);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /text\/html/);
    const html = await response.text();
    assert.match(html, /문서를 넣으면,/);
    assert.match(html, /우리 조직의 가치/);
    assert.match(html, /href="\/app\?mode=demo#\/home"/);
    assert.match(html, /href="\/app\?mode=start#\/start"/);
    assert.ok(!html.includes('chatgpt.site'));
    assert.ok(!html.includes('ChatGPT 계정'));
  }
});

test('기존 데모·시작·조직 초대 URL은 같은 사이트 작업실로 연결', () => {
  for (const query of ['?mode=demo', '?mode=preview', '?mode=start', '?mode=app&org=org-one&auth_error=callback']) {
    const response = publicEntry(new Request(`https://evaluation.example/${query}`), landing);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `/app${query}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('랜딩의 사진·그래픽·스타일·체험 스크립트는 모두 배포 저장소에 포함', () => {
  const assets = [...landing.matchAll(/(?:src|href)="(\/landing\/[^"?#]+)"/g)].map(m => m[1]);
  const script = readFileSync(new URL('../public/landing/app.js', import.meta.url), 'utf8');
  assets.push(...[...script.matchAll(/src="(\/landing\/[^"?#]+)"/g)].map(m => m[1]));
  assert.ok(assets.length >= 10);
  for (const asset of assets) assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), asset);
});
