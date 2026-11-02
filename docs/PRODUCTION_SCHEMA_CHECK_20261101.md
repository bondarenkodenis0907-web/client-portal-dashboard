# Сверка production — 1 ноября 2026

**Существенных расхождений в проверенном каталоге приложения не обнаружено.** Read-only сверка с 11 миграциями baseline `a0c1af06b842e52e0b98d015adae15433fa2922d`; не поведенческая приёмка production.

PR #26 завершён: восемь jobs [CI 41318071588](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41318071588) прошли; merge в кандидата — `512aeb455417e166528a4d622e937a202fcc4659`. Main не менялся.

| Объём | Результат |
| --- | --- |
| Таблицы | 4 public + private.maintenance_state; RLS включён на всех 5 |
| Столбцы | 33: набор, типы, nullable/default/identity соответствуют миграциям |
| Ограничения | 26, все validated; PK/FK/delete actions, operation-key unique, version/transient input, статусы, приоритеты и лимиты проверены |
| Индексы | 9, определения соответствуют миграциям; indisvalid/indisready=true |
| RLS | 9 PERMISSIVE policies только authenticated: 3 profile, 4 request, 1 staff, 1 history; ownership/staff/operation_key условия совпадают; клиентской DELETE-policy нет |
| Grants | PUBLIC/anon без прав на таблицы; authenticated SELECT на 4 public таблицы и ровно 18 ожидаемых column INSERT/UPDATE grants |
| Функции приложения | 8/8 тел совпали с последними миграциями после CRLF/внешних пробелов; сигнатуры, invoker/definer, language/volatility, owner=postgres и пустой search_path проверены |
| EXECUTE | anon запрещён; authenticated разрешены только private.is_service_staff и два invoker RPC; trigger-only функции закрыты |
| Триггеры | 9 включены с ожидаемыми timing/events/row-statement; maintenance на 4 таблицах приложения и auth.users, signup/version/processing/history присутствуют |
| private schema | Нет PUBLIC/anon USAGE/CREATE; authenticated USAGE без CREATE и доступа к maintenance_state |

Дополнительная `public.rls_auto_enable()` — платформенная event-trigger функция, условно учтённая миграцией 20261005112441; anon/authenticated EXECUTE отозван. Полная платформа этим не проверена.

Четыре input-check определения дополнительно получены через UTF-8 hex: текстовый ответ коннектора опускал U+202F/U+205F/U+3000/U+FEFF. Hex подтвердил наличие полного набора; определения в снимке восстановлены из него. Это особенность представления ответа, не schema drift.

[Снимок](evidence/production-schema-20261101.json) содержит каталог/ACL/функции и index health. [Запросы](evidence/production-schema-20261101.sql) читают системные каталоги. Получено несколькими SELECT, не одной транзакцией. Набор/типы/nullable столбцов, клиентские grants, тела/security функций и состояния объектов проверены локальными assertions; expressions/defaults/сигнатуры/индексы/триггеры дополнительно сопоставлены с SQL при review.

Пользовательские строки, токены, ключи и пароли не читались. DDL/DML/repair/reset, повтор миграций и Auth-запросы не выполнялись. Поведенческие записи под реальными JWT и production canary не запускались. Сверка не покрывает все платформенные роли/наследование, Auth/Storage-схемы, default privileges будущих объектов, SMTP, содержимое данных и compiled build provenance.

Старый переход 8→11 неприменим. Следующий приоритет — hosted Auth/recovery, свежий backup и конкретный rollback по согласованному объёму. Этот отчёт не разрешает deploy или изменение базы.
