# Режим обслуживания

Статус на 02.11.2026: миграция `20261030113426_maintenance_write_gate.sql` уже присутствует среди 11 production migrations. [Read-only сверка](PRODUCTION_SCHEMA_CHECK_20261101.md) подтвердила пять включённых maintenance-триггеров; при read-only проверке 02.11 переключатель был false. Maintenance API/concurrency и HTTP guard прошли remote CI на изолированной базе. Это не проверка поведения production под записью и не разрешение включать обслуживание. [Текущий статус безопасности](SECURITY_STATUS.md).

Feature-ветка объектов добавляет 3 triggers на sites/buildings/site_memberships: её isolated schema содержит 12 миграций и 8 triggers. Это не состояние production; новая миграция там не применялась. Подробнее — [facility directory](FACILITY_DIRECTORY.md).

## Блокировка записи

Единственный переключатель записи — `private.maintenance_state`. Роли anon, authenticated и service_role не могут читать или менять его. Приватная SECURITY DEFINER trigger-функция с пустым search_path только читает и блокирует строку переключателя; она не предоставляет клиенту право записи и не доступна для прямого вызова.

BEFORE STATEMENT триггеры запрещают INSERT/UPDATE/DELETE/TRUNCATE в profiles, service_requests, request_events, service_staff и auth.users. Это покрывает прямой REST, RPC, старые вкладки, привилегированный Data API, создание пользователя, смену пароля и удаление аккаунта. Ошибка PostgreSQL PT503 даёт HTTP 503 в PostgREST. Auth возвращает собственную ошибку сервиса; код 503 для Auth не обещается. Отклонённая операция не создаёт частичный результат/историю. Ранее сохранённый idempotent replay может вернуть существующую запись, не меняя данные.

Записи берут FOR SHARE на переключателе до конца транзакции. Включающий UPDATE ждёт допущенные записи; после его успешного COMMIT следующие записи отклоняются. Не считать отправленный UPDATE или таймаут подтверждением включения. При отсутствии строки переключателя запись запрещена. Повторяемые снимки могут получить serialization failure вместо записи; клиент не должен считать это успехом.

Чтение сохраняет прежние RLS. Режим не меняет grants/RLS, версии заявок, operation keys, пользователей или историю. Владелец БД/суперпользователь может отключить триггеры, изменить переключатель или использовать replication_role; административные действия остаются вне защиты от обхода владельцем.

Это блокировка текущих таблиц приложения и auth.users, а не всей платформы Supabase: auth.sessions/refresh_tokens/MFA/Storage/Vault/Edge Functions и новые таблицы автоматически не защищаются. Фоновый Auth может менять свои служебные таблицы; логин, signup или recovery, меняющие auth.users, могут завершаться отказом. Внешние почтовые попытки этим триггером не выключаются. Для полного cutoff и доставки писем нужен отдельный принятый план. Новые изменяемые таблицы требуют отдельного триггера и регрессии.

## Интерфейс

Серверная переменная `CLIENT_PORTAL_MAINTENANCE=1` включает HTTP 503, no-store, noindex и Retry-After: 60 для всех путей и методов до Auth, включая POST старых форм, recovery и assets. Retry-After — подсказка повторить запрос, не обещание срока окончания работ. Неверный/неразрешённый deployment по-прежнему сначала отклоняется deployment guard. Переменную нельзя называть NEXT_PUBLIC или использовать как замену блокировке БД.

Флаг интерфейса и переключатель БД независимы. Выключенный интерфейс не открывает БД; закрытая только страница не защищает прямой API. Для production изменение env может потребовать новую сборку/deployment; это отдельно согласуемое действие.

## Управление — только в подтверждённой среде

Ниже команды администратора для локальной синтетической базы. Для production нужны проверенные ресурсы, конкретное разрешение и release record. Не копировать в случайную открытую вкладку SQL Editor.

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '10s';
update private.maintenance_state set enabled = true where singleton;
commit;
select enabled from private.maintenance_state where singleton;
```

Ожидается одна строка enabled=true после успешного COMMIT. Затем независимо проверить отказ реального REST/RPC и отсутствие изменений, включить frontend-флаг. При таймауте или неизвестном исходе сначала проверить состояние; не начинать миграции.

Для снятия блокировки после приёмки повторить транзакцию с `enabled = false`, подтвердить false и контрольную запись, затем открыть интерфейс. Сохранять историю действий и согласованный допуск canary. Постоянного bypass/allowlist нет. DB-only canary реализован транзакцией в `scripts/release-canary.sql` и проверен `scripts/test-release-canary.mjs` в изолированной CI-базе: внешняя запись остаётся закрытой. Production canary отдельно не принимался; краткое открытие всем пользователям его не заменяет.

Включающий UPDATE и дальнейшие DDL нельзя держать в одной транзакции. Однако production уже имеет все 11 версий: старую последовательность установки gate перед SR06/SR07 повторять нельзя. `test-release-order.mjs` остаётся синтетической регрессией исторического порядка, а не указанием заново устанавливать эти миграции в production. Любое будущее изменение схемы требует нового плана для подтверждённой разницы.

## Проверки

- `npm run test:local:sql`: 271 assertions на facility branch; базовый #24 содержит 230. Проверяется включение/снятие, прямые записи, RPC, service_role, Auth, неизменность истории и fail-closed.
- `node scripts/test-maintenance.mjs`: реальный локальный REST/RPC HTTP 503, отказ Auth password update, чтение, повтор после открытия и межтранзакционный барьер. Создаётся и удаляется только синтетический аккаунт в проверенном профиле. Собственное уже открытое окно обслуживания тест не перехватывает.
- `node scripts/verify-preview-guard.mjs maintenance`: production build с локальным backend, 48 HTTP GET/HEAD/POST проверок, Retry-After/no-store/noindex, отсутствие обновления Auth cookies. Проверка не аттестует hosted backend.
- Remote [CI 41327554868](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41327554868) прошёл все восемь jobs, включая maintenance guard, API/concurrency, DB-only canary, порядок миграций и rollback. Тесты использовали изолированный backend runner, не production.

Тестовый профиль проверяет 11 миграций, пять включённых триггеров и выключенный переключатель перед обычными тестами. Его reset допустим только штатным guarded script; существующую development базу не сбрасывать. Команды обычной разработки и форматирования — в [DEVELOPMENT.md](DEVELOPMENT.md).

[Выпуск/откат](RELEASE_ROLLBACK_RUNBOOK.md). Перед следующим выпуском нужны актуальный SHA/CI, принятая hosted-проверка Auth, согласованный canary и конкретный совместимый cloud rollback.

Репетиции: `node scripts/test-release-order.mjs`, затем `node scripts/test-rollback-build.mjs`. Текущий rollback script закрепляет `db0f9fb98acd6793c6bdacfc3c2e63fc2ca210ff` и проверяет 35 browser scenarios, сохранение request/version/history и DB maintenance denial на схеме 11. Это исходный baseline синтетической репетиции. Выбран существующий cloud rollback `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od` с source `a0c1af06`; runtime-исходники совпадают с baseline. Cloud switch/права/тариф ещё не приняты. Старое ограничение Windows-портов относилось к тому локальному запуску; Linux CI fresh/saved restore прошёл. Restore preflight требует выключенный переключатель. [Выпуск](RELEASE_ROLLBACK_RUNBOOK.md).
