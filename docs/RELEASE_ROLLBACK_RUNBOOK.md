# Выпуск и откат

**NO-GO для production.** План не разрешает merge, deploy, hosted Auth или миграции. Preview закрыт; работа локальная и бесплатная.

## Совместимость

- Старый main с восемью миграциями использует прежнюю запись.
- Текущий интерфейс требует десять миграций: operation key и expected_version/RPC.
- Старые вкладки/старый frontend после новых миграций отклоняются. Старый main не является безопасным rollback target; новые RPC отсутствуют на старой схеме.
- #22/#23 — старые Draft, не полный текущий кандидат. Для выпуска нужен чистый интегрированный SHA.

## Условия допуска

- **G01:** точный candidate SHA, review всего diff, hashes миграций/lockfile и согласованный порядок интеграции PR.
- **G02:** remote CI на том же SHA, независимое Auth/RLS review и ручная client/staff/mobile/error приёмка. Локальные исправления и регрессии подтверждены [проверками](evidence/verification.json).
- **G03:** подтвердить team/project/deployment, активные/исторические URLs, env scopes и отсутствие пути Preview к production. SSO/404 недостаточно.
- **G04:** отдельная hosted Auth/SMTP/template/redirect/signing-secret приёмка, direct Auth policy, JWT TTL и решение по leaked-password protection.
- **G05:** принятые D06/D07, переносимая off-device копия разрешённых реальных DB/Auth/files/config и доказанное восстановление.
- **G06:** испытанный запрет записи на границе БД/API, canary и совместимый rollback build.
- **G07:** конкретное согласие владельца: SHA, ресурсы, действия, окно, ответственный, критерии остановки и восстановление.

Неподтверждённый gate блокирует выпуск. CI release-gates требует success всех четырёх jobs, но его обязательность, branch protection и auto-production настройки нужно подтвердить у провайдера. Локальный PASS не заменяет remote CI/approval.

## Будущий согласованный выпуск

1. Сверить ресурс/тариф/права, действующие app/schema и rollback target; исключить неутверждённый auto-release от push/merge.
2. Проверить backup, переносимый ключ, restore evidence и cutoff; определить сверку последующих записей. Synthetic DPAPI архив не заменяет production backup.
3. Включить заранее испытанный maintenance write gate на стороне БД/API и дождаться текущих операций. Одна страница обслуживания не блокирует старые вкладки и прямой API.
4. Применить только reviewed миграции 20261026141410 → 20261026143113, проверить RLS/grants/catalog/history. Частичную цепочку не считать завершённой; применённые файлы не переписывать.
5. Развернуть одобренный production build при закрытой записи. Proxy допускает только production alias: обычный staged URL не подходит для smoke без отдельно рассмотренного решения; guard не обходить.
6. Выполнить согласованный canary: приватность, login/recovery, повтор create, processing/409, закрытие/история, inactive staff и mobile; только разрешённые данные.
7. Открыть запись после приёмки, учесть старые вкладки и несохранённые drafts; наблюдать в принятом окне с ответственным и записать фактический результат.

Maintenance gate, совместимый rollback build и эксплуатационный backup ещё не приняты.

## При сбое

- До миграций: прервать выпуск, сохранить прежнюю проверенную пару app/schema.
- После миграций: оставить запрет записи, выяснить фактическую history, исправить вперёд либо вернуть совместимый frontend. Не удалять version/key/RLS/history ради старого UI.
- После открытия записи: закрыть затронутый поток, сохранить данные/логи без секретов, проверить совместимый target и canary перед возвратом.
- При потере/порче данных: сохранить источник, восстановить отдельно, сверить post-cutoff изменения и согласовать переключение. Не делать restore поверх production ради упражнения.
- При утечке: ограничить доступ, сохранить доказательства, определить область и согласовать rotation/session response. Не публиковать токены и не удалять пользователей ради деактивации.

Переключение deployment не откатывает БД/Auth/env. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback) зависит от тарифа/доступного target и отключает auto-assignment до promotion. Destructive down migration не подготовлена. Если совместимого target нет, сохранить обслуживание и готовить исправление вперёд.

Release record: owner/reviewer/incident contact, candidate и прежний SHA/deployment, team/project/backend, hashes, CI/manual evidence, backup/cutoff/key custodian, gate/canary/rollback proof, окно, разрешённые данные, точные действия и согласие, smoke/наблюдение. Все перечисленные реальные операции требуют отдельного разрешения.

[Окружения](ENVIRONMENT_REGISTER.md) · [Решения](DECISIONS.md) · [Backup](BACKUP_RESTORE_RUNBOOK.md). Для реальных старых устройств учесть [изменение TLS Supabase не ранее 10.11.2026](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).
