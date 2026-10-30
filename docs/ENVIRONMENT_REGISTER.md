# Окружения

Срез 29.10.2026. Проверять ресурс перед каждой операцией; в этом документе нет ключей и разрешения на изменение production.

- **Production Vercel:** client-portal-dashboard-one.vercel.app. API вернул 404; deployment SHA, env scopes и rollback target требуют подтверждения.
- **Production Supabase:** xdpewqewdeiaoyotpawv, восемь миграций до 20261010153002. Последний security advisor: leaked-password protection disabled; настройка не менялась.
- **Vercel Preview:** адрес в [реестре](evidence/deployment-hosts.json), доступ через SSO. Это не доказательство app-level 503 или отдельной БД; Preview остаётся закрытым.
- **Netlify:** два проекта выключены, автосборки остановлены 26.10. [Подтверждение](evidence/NETLIFY_RETIREMENT_2026-10-26.md). Проверка шести адресов 29.10 завершилась сетевыми ошибками — актуальная доступность UNVERIFIED.
- **Development:** project client-portal-dashboard, API/DB 55321/55322. Исторический drift; не сбрасывать для тестов.
- **Test source:** `client-portal-tests-<checkout hash>`, API/DB/Mailpit 56321/56322/56324, десять миграций.
- **Restore:** `client-portal-restore-<checkout hash>`, порты 57321/57322/57324. Только synthetic restore; frontend production-test guard не допускает этот backend.
- **CI:** свои временные локальные базы на runner, без production secrets. Workflow подготовлен, удалённая приёмка финального SHA ещё не выполнена.

Оба выделенных профиля после тестов остановлены с сохранением volumes. Прежние локальные базы сохранены. Docker работает; постоянное устранение прежнего сбоя socket не подтверждено. Другие проекты не используются и не сбрасываются.

Owner-файл, project ID, config, отсутствие hosted link, labels и фактические адреса проверяются до тестовых записей. Порт сам по себе не доказывает изоляцию. Локальные CLI API/admin defaults общие; у restore отдельные пользовательские signing keys. Это среды только для синтетики.

Браузеру доступны только URL и publishable key нужного backend. Recovery signing secret — только server runtime, отдельный для среды. Local env/keys/backups исключены из Git; CI публикует только sanitized restore report.

Перед выпуском сверить активные/исторические deployment URLs, custom domains, интеграции и env scopes у провайдера, не печатая секреты. SSO/404/успешная сборка не подтверждают backend isolation. [Выпуск](RELEASE_ROLLBACK_RUNBOOK.md).
