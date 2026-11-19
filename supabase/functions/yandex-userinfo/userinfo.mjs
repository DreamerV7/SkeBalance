const headers = { 'Cache-Control': 'no-store' };

export async function yandexUserInfo(request, clientId, fetchProfile = fetch) {
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
  }

  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return new Response(null, { status: 401, headers });
  if (!clientId) return new Response(null, { status: 503, headers });

  try {
    const response = await fetchProfile('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (response.status === 401 || response.status === 403) {
      return new Response(null, { status: 401, headers });
    }
    if (!response.ok) return new Response(null, { status: 502, headers });

    const profile = await response.json();
    if (profile?.client_id !== clientId || typeof profile.psuid !== 'string' || !profile.psuid.trim()) {
      return new Response(null, { status: 401, headers });
    }
    return Response.json({ sub: profile.psuid }, { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
}
