# Окружения

Production перепроверен 01.11.2026; локальные/Netlify сведения ниже сохраняют дату прежней проверки. Проверять ресурс перед каждой операцией; в этом документе нет ключей и разрешения на изменение production. [Подробная сверка с GitHub](DEPLOYED_VERSION_20261101.md).

- **Production Vercel:** client-portal-dashboard-one.vercel.app → `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od`, READY, CLI. Все 149 загруженных исходных файлов совпадают с `a0c1af06b842e52e0b98d015adae15433fa2922d`. Метаданные Git SHA отсутствуют; compiled build provenance, env scopes и конкретный совместимый rollback отдельно не аттестованы.
- **Production Supabase:** xdpewqewdeiaoyotpawv, уже 11 миграций до 20261030113426; maintenance=false при предыдущем чтении. Старый переход 8→11 не повторять. [Каталог приложения/grants/triggers сверены](PRODUCTION_SCHEMA_CHECK_20261101.md): существенных расхождений в указанном объёме не обнаружено. Security advisor 01.11 подтвердил leaked-password protection disabled; настройка не менялась.
- **Vercel Preview:** адрес в [реестре](evidence/deployment-hosts.json), доступ через SSO. Это не доказательство app-level 503 или отдельной БД; Preview остаётся закрытым.
- **Netlify:** два проекта выключены, автосборки остановлены 26.10. [Подтверждение](evidence/NETLIFY_RETIREMENT_2026-10-26.md). Проверка шести адресов 29.10 завершилась сетевыми ошибками — актуальная доступность UNVERIFIED.
- **Development:** project client-portal-dashboard, API/DB 55321/55322. Исторический drift; не сбрасывать для тестов.
- **Test source:** `client-portal-tests-<checkout hash>`, API/DB/Mailpit 56321/56322/56324, одиннадцать миграций.
- **Restore:** `client-portal-restore-<checkout hash>`, порты 57321/57322/57324. Только synthetic restore; frontend production-test guard не допускает этот backend.
- **CI:** свои временные локальные базы на runner, без production secrets. Все восемь jobs прошли для дерева `58bf73782ce454b9008542bc5ee72f51737d295c` в [run 41316989028](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41316989028). Это проверка кандидата, а не hosted production acceptance.

Оба выделенных профиля после тестов остановлены с сохранением volumes. Прежние локальные базы сохранены. Docker работает; постоянное устранение прежнего сбоя socket не подтверждено. Другие проекты не используются и не сбрасываются.

Owner-файл, project ID, config, отсутствие hosted link, labels и фактические адреса проверяются до тестовых записей. Порт сам по себе не доказывает изоляцию. Локальные CLI API/admin defaults общие; у restore отдельные пользовательские signing keys. Это среды только для синтетики.

Браузеру доступны только URL и publishable key нужного backend. Recovery signing secret — только server runtime, отдельный для среды. Local env/keys/backups исключены из Git; CI публикует sanitized restore reports и пять кадров сценария с вымышленными локальными тестовыми данными.

Перед выпуском сверить активные/исторические deployment URLs, custom domains, интеграции и env scopes у провайдера, не печатая секреты. SSO/404/успешная сборка не подтверждают backend isolation. [Выпуск](RELEASE_ROLLBACK_RUNBOOK.md).
