import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yandexUserInfo } from '../supabase/functions/yandex-userinfo/userinfo.mjs';

const endpoint = 'https://example.test/functions/v1/yandex-userinfo';
const authorized = new Request(endpoint, { headers: { Authorization: 'Bearer mock-token' } });
const clientId = 'soul-app';

test('Yandex UserInfo verifies the application and returns only its stable account identifier', async () => {
  const result = await yandexUserInfo(authorized, clientId, async (url, options) => {
    assert.equal(url, 'https://login.yandex.ru/info?format=json');
    assert.equal(options.headers.Authorization, 'OAuth mock-token');
    assert.equal(options.redirect, 'error');
    return Response.json({ client_id: clientId, psuid: 'opaque-id', default_email: 'user@example.test' });
  });
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { sub: 'opaque-id' });
});

test('Yandex UserInfo rejects invalid requests and failed or mismatched upstream profiles', async () => {
  assert.equal((await yandexUserInfo(new Request(endpoint, { method: 'POST' }), clientId)).status, 405);
  assert.equal((await yandexUserInfo(new Request(endpoint), clientId)).status, 401);
  assert.equal((await yandexUserInfo(authorized, null)).status, 503);
  const wrongClient = () => Response.json({ client_id: 'different-app', psuid: 'opaque-id' });
  const missingSubject = () => Response.json({ client_id: clientId });
  assert.equal((await yandexUserInfo(authorized, clientId, wrongClient)).status, 401);
  assert.equal((await yandexUserInfo(authorized, clientId, missingSubject)).status, 401);
  assert.equal((await yandexUserInfo(authorized, clientId, () => new Response(null, { status: 401 }))).status, 401);
  assert.equal((await yandexUserInfo(authorized, clientId, () => new Response(null, { status: 503 }))).status, 502);
});
