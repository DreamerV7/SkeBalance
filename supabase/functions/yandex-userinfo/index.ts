import { yandexUserInfo } from './userinfo.mjs';

const clientId = Deno.env.get('YANDEX_CLIENT_ID');
Deno.serve(request => yandexUserInfo(request, clientId));
