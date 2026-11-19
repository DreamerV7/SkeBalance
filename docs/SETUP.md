# Подключение СкеБаланса к Supabase и Netlify

Ни один секрет не нужно присылать в чат или помещать в исходный код.

## 1 Настроить базу

Для первого запуска можно открыть SQL Editor созданного Supabase-проекта, вставить supabase/migrations/202611120001_saved_calculations.sql и выполнить один раз. Скрипт создаёт прикладную таблицу, функцию проверки и политики доступа. Учётными записями управляет Supabase Auth.

Альтернатива — GitHub Actions, описанные в разделе 4. Нужно выбрать один механизм миграций. Не выполнять первую миграцию вручную и затем повторно через CLI: это требует отдельного согласования истории уже применённых миграций.

## 2 Настроить вход

В Authentication → Providers / Sign In settings включить Email + Password. Подтверждение email оставить включённым. Для произвольных адресов настроить собственный SMTP: встроенная отправка Supabase ограничена тестовыми адресами команды проекта. Проверить регистрацию и восстановление на своём тестовом аккаунте.

В Authentication → URL Configuration задать Site URL — окончательный HTTPS-адрес Netlify. В Redirect URLs добавить тот же адрес с завершающим / и при необходимости http://127.0.0.1:4173/ для локальной разработки.

Приложение поддерживает подтверждение email и смену пароля после перехода по ссылке восстановления. Отключение проверки почты не выполняется кодом или миграцией.

### Вход через Яндекс ID

1. В Supabase откройте **Authentication → Sign In / Providers → New Provider → Manual configuration** и скопируйте **Callback URL**. Создайте [приложение Яндекс ID для авторизации пользователей](https://yandex.ru/dev/id/doc/ru/register-auth) для платформы «Веб-сервисы». Вставьте Callback URL из Supabase в поле **Redirect URI**. Оставьте только базовые права, которые требуются для создания приложения. Soul использует идентификатор пользователя и не запрашивает адрес почты, телефон или портрет.
2. Разверните функцию `yandex-userinfo` в том же проекте Supabase. Откройте терминал в корне репозитория. Подставьте идентификатор приложения Яндекса и идентификатор проекта Supabase.

   ```powershell
   supabase secrets set YANDEX_CLIENT_ID=YOUR_YANDEX_CLIENT_ID --project-ref YOUR_PROJECT_REF
   supabase functions deploy yandex-userinfo --project-ref YOUR_PROJECT_REF
   ```

   Функция принимает токен Яндекса, проверяет его через Яндекс ID и сверяет `client_id` с настройкой проекта. Параметр `verify_jwt = false` в `supabase/config.toml` позволяет передать функции токен Яндекса вместо JWT Supabase. В ответе функции только `sub`, стабильный идентификатор пользователя для этого приложения.
3. Включите в Supabase [пользовательский провайдер OAuth2](https://supabase.com/docs/guides/auth/custom-oauth-providers) с такими настройками.

   | Поле | Значение |
   | --- | --- |
   | Identifier | `custom:yandex` |
   | Name | `Яндекс ID` |
   | Client ID, Client Secret | Со страницы приложения Яндекс OAuth |
   | Authorization URL | `https://oauth.yandex.ru/authorize` |
   | Token URL | `https://oauth.yandex.ru/token` |
   | UserInfo URL | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/yandex-userinfo` |
   | Allow sign-in without email | Включено |
   | PKCE | Включено |

   Поле **Scopes** оставьте пустым, чтобы Яндекс использовал базовые права, выбранные при регистрации приложения. Client Secret вводится только в Supabase.
4. В **Authentication → URL Configuration → Redirect URLs** добавьте `https://skebalance.netlify.app/?auth=yandex`. Для локальной проверки добавьте `http://127.0.0.1:4173/?auth=yandex`.
5. После настройки добавьте публичную переменную `YANDEX_LOGIN_ENABLED=true` в **GitHub Actions Repository variables** для способа A или в окружение сборки Netlify для способа B. Для локальной проверки в PowerShell задайте `$env:YANDEX_LOGIN_ENABLED = 'true'` рядом с двумя публичными настройками Supabase и выполните `npm run build`. Пересоберите сайт, чтобы появилась кнопка.
6. Проверьте вход и отмену входа на экране Яндекса. После успешного входа сохраните учебный расчёт, выйдите и войдите снова через тот же Яндекс ID. Сохранённый расчёт должен появиться в «Моих расчётах». Аккаунты с email и Яндекс ID создаются отдельно. Для доступа к ранее сохранённым расчётам выбирайте тот же способ входа.

## 3 Выбрать способ публикации

### A Ключи в GitHub Secrets

В репозитории открыть Settings → Secrets and variables → Actions → New repository secret.

| Имя | Значение |
| --- | --- |
| SUPABASE_URL | Project URL из Connect созданного проекта |
| SUPABASE_PUBLISHABLE_KEY | Publishable key из Connect / Settings → API Keys, начинается с sb_publishable_ |
| NETLIFY_SITE_ID | Project ID проекта Netlify из Project configuration → General → Project details |
| NETLIFY_AUTH_TOKEN | Personal access token аккаунта Netlify с доступом к проекту |

Если проекта Netlify ещё нет, создать его ручной загрузкой папки dist через Netlify Drop. Это начальная версия без регистрации, дающая Project ID. Затем публикацию выполняет Actions. Для этого маршрута не подключать встроенную автоматическую сборку Netlify из Git: она может перезаписать конфигурацию, собранную Actions.

После добавления четырёх значений: Actions → Publish to Netlify → Run workflow. Сборка включает в сайт только два публичных параметра Supabase. Управляющий токен Netlify остаётся в окружении runner. Публикация ожидает готовности и выводит адрес без токенов.

Для автоматической публикации после каждого push в `main` добавьте Repository variable `AUTO_DEPLOY_NETLIFY=true`. Для отдельной публикации запустите workflow вручную или добавьте `[deploy-netlify]` в сообщение последнего коммита, который отправляете в `main`. Проверки запускаются автоматически без секретов.

### B Прямое подключение GitHub в Netlify

Netlify → Add new project → Import an existing project → GitHub → DreamerV7/SkeBalance.

| Настройка | Значение |
| --- | --- |
| Base directory | Пусто, корень репозитория |
| Build command | npm run build |
| Publish directory | dist |
| Node.js | 22 |

В окружении **Netlify** задать SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY с доступом на этапе сборки, затем повторить deploy. Это публичные параметры браузерного приложения.

GitHub Actions Secrets не передаются встроенной сборке Netlify автоматически. Если ключи хранятся только в GitHub, использовать вариант A. При варианте B не включать AUTO_DEPLOY_NETLIFY и не запускать Actions Publish to Netlify: публикацией после push управляет Netlify.

## 4 Миграции через GitHub Secrets

Для этого способа не выполнять SQL из раздела 1 вручную. Добавить ещё три GitHub Actions Secrets:

| Имя | Значение |
| --- | --- |
| SUPABASE_PROJECT_REF | Идентификатор проекта: часть адреса перед .supabase.co, не URL |
| SUPABASE_ACCESS_TOKEN | Токен управления: настройки аккаунта Supabase → Access Tokens |
| SUPABASE_DB_PASSWORD | Пароль БД, заданный при создании проекта |

Actions → Apply Supabase migrations → Run workflow. Workflow проверяет код и политики локально, связывается с выбранным проектом и применяет ещё не применённые миграции. Он запускается только вручную. Эти три секрета не передаются в браузерную сборку.

Вместо Actions можно использовать Supabase Settings → Integrations → GitHub, Working directory = . . Для первой версии не включать платные preview branches. Для одной базы выбрать один механизм миграций.

## 5 Проверить облачное подключение

1. Создать тестовый аккаунт A, подтвердить email и войти.
2. Открыть учебный пример и сохранить расчёт.
3. Обновить страницу и открыть сохранение. Проверить пересчёт покупки.
4. Выйти. Список сохранений и открытый расчёт должны очиститься.
5. Создать аккаунт B. Убедиться, что сохранение A не видно.
6. Проверить письмо восстановления и смену пароля.
7. Удалить тестовые сохранения.

Локальные проверки не заменяют эти действия в настроенном Supabase-проекте. В этой сессии облачная БД и письма ещё не проверены: параметры подключения не предоставлены.

## Что не коммитить

Пароли, secret/service_role keys, SUPABASE_ACCESS_TOKEN, NETLIFY_AUTH_TOKEN, .env, реальные выписки и личные тестовые данные. dist/config.js генерируется сборкой и исключён из Git. Publishable key будет виден посетителям готового сайта, даже если хранится в GitHub Secrets. Защитой данных служат Auth и RLS.
