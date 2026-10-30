# Выпуск и откат

**NO-GO для production до закрытия всех условий ниже.** Merge, production deploy, миграции, реальные письма и открытие записи требуют отдельного конкретного согласия. Работа остаётся бесплатной; Preview закрыт.

## Текущий набор — 30.10.2026

Код TA-01–TA-04 закреплён в `db0f9fb98acd6793c6bdacfc3c2e63fc2ca210ff`. Версия для отката — тот же SHA: она включает серверные Auth-исправления, мобильные переносы и полную историю. Коммит `836d5a7eeac18d9184219d60c00f356b05060ba7` закрепляет этот baseline. [CI #160](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41088982039) — восемь jobs PASS: 39 unit, 35 browser, серверная Auth-регрессия, SQL/maintenance, порядок миграций, 35 browser на rollback и fresh + saved restore. Последующие изменения canary должны пройти собственный CI; прежний PASS не наследуется автоматически.

Main остаётся `00fc4b856109c29e59c9c71bfc7ea9c9927f8d58`. Production Vercel — Ready deployment `GsCimJju6b7wDRYHL1u34gNaMqxF`, alias `client-portal-dashboard-one.vercel.app`. Supabase `xdpewqewdeiaoyotpawv` содержит восемь миграций до `20261010153002`; кандидат — одиннадцать. Старый main несовместим с новым контрактом записи и не является rollback после SR06/SR07. #22/#23 остаются старыми Draft; интегрированный кандидат — #24.

## Условия допуска

| Gate | Статус | Фактический объём / остаток |
| --- | --- | --- |
| G01 — точный набор | PREPARED | Код/rollback закреплены, локальные QA PASS. Перед выпуском записать окончательный SHA после всех script/doc изменений и CI; обновить описание #24, принять весь diff вместо старого стека #22/#23. |
| G02 — проверки и review | PREPARED | CI #160 зелёный. Независимое read-only review не обнаружило открытых P1/P2 после исправления передачи ephemeral CI key; новый DB-only canary также reviewed. Нужны CI финального SHA и ручная приёмка владельцем. Review не является hosted acceptance. |
| G03 — изоляция | PREPARED | С отдельного согласия GitHub требует check/database-tests/release-gates, запрет admin bypass сохранён. Supabase URL/publishable key в Vercel теперь Production-only; recovery secret тоже Production-only. Branch tracking Preview выключен. Исторические Preview остаются: immutable builds не очищаются сменой env scope; нужен согласованный вывод по точному реестру и проверка URLs. |
| G04 — hosted Auth | BLOCKED | Реальная доставка/redirect/template/signing-secret runtime ещё не приняты. D04 direct Auth/JWT TTL и leaked-password protection требуют решения. Наличие SMTP/secret не доказывает доставку. |
| G05 — восстановление | PREPARED | CI fresh + independent saved consumer PASS, source остановлен, 230 архивных SQL assertions; Linux key только в памяти. Реальная off-device DB-копия имеет отдельное прежнее доказательство восстановления. C10 принимает F:/E:, 14 дней, backup перед выпуском, целевые RPO24ч/RTO4ч. Нужны свежий cutoff snapshot, измерение реального восстановления, ежедневный процесс/ответственный и полнота DB/Auth/files/config. Старые форматы архивов после последних helper-изменений полностью не повторены. |
| G06 — canary и rollback | PREPARED | Принят C11: DB-only транзакция при закрытой внешней записи + полный flow в изолированной копии + readonly smoke production UI; почта отдельно. Локально проверены HTTP writer wait→503, observer=true, replay/CAS/history/privacy, commit и EOF rollback. Постоянный bypass/allowlist не вводились. Нужны CI canary, конкретный облачный rollback deployment ID и согласованный production-инструмент регистрации gate history до SR06/SR07. |
| G07 — выпуск | BLOCKED | Не согласованы точные действия production, тестовые user IDs/данные, окно, основной/резервный ответственный, поддержка и критерии остановки. C10–C12 не заменяют согласия выпуска. |

C12 выполнен только в разрешённом объёме настроек. Текущий deployment не пересобирался, production БД/Auth/SMTP не менялись, старые Preview не удалялись. Смена env влияет на будущие deployment, а не очищает уже созданные bundles.

## Принятый DB-only canary

SQL для review — `scripts/release-canary.sql`; локальная конкурентная репетиция — `node scripts/test-release-canary.mjs`. Скрипт запускается только против подтверждённого synthetic профиля; он не является командой production-выпуска.

Для будущего разрешённого выполнения отдельно проверить ресурс, окончательную схему, заранее выделенные canary client/staff/outsider IDs и новый operation UUID. Staff должен быть активен; использовать только согласованные тестовые данные. Production canary оставит одну закрытую синтетическую заявку/три события, если транзакция успешно зафиксирована; удаление данных отдельно не подразумевается.

Транзакция требует исходный gate=true, блокирует его строку, устанавливает false только внутри своей незакоммиченной транзакции, проверяет RLS/RPC под локальными ролями/claims, возвращает true до COMMIT. Остальные пишущие транзакции ждут и после окончания получают отказ. При ошибке/обрыве соединения false откатывается. Нет DDL/внешних HTTP/интерактивных пауз внутри production транзакции. Локальная репетиция намеренно задерживает её только для проверки конкурентного writer; SQL содержит короткие lock/statement/idle timeouts.

SQL claims проверяют RLS, не подлинность JWT. Canary не покрывает browser writes, маршрутизацию PostgREST, SMTP/recovery и служебные Auth-таблицы. Это принятый ограниченный объём C11; не выдавать его за полный hosted flow. Поведение блокировок — [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html).

## Точный порядок будущего согласованного выпуска

1. Записать final SHA, team/project/backend, нынешний deployment и конкретный совместимый rollback target; проверить тариф и права. Production tracking main с auto-assignment включён: merge может сразу опубликовать код. Исключить случайную публикацию до окна отдельным согласованным действием; не считать branch protection разрешением merge.
2. Завершить ручную приёмку, hosted Auth/SMTP/URLs/template и D04/D06/D07. Согласовать окно, владельца/резервного, разрешённые данные, stop/rollback критерии. Сделать свежую переносимую off-device копию и определить cutoff/сверку последующих записей. Dump не включает все внешние настройки/секреты/файлы.
3. Отдельно reviewed инструментом установить неизменённую `20261030113426_maintenance_write_gate.sql` на старые восемь миграций и атомарно зарегистрировать её version/history. Репетиция SQL + history проверена в временной synthetic БД. Не заменять это обычным db push по датам: gate тогда установится последним.
4. Отдельной короткой транзакцией включить gate, дождаться COMMIT и подтвердить отказ API. Не держать DDL в транзакции переключения. Сверить cutoff и сделать согласованный snapshot. Gate охватывает четыре таблицы приложения и auth.users, но не всю платформу Auth/Storage/внешние письма.
5. При закрытой записи применить только `20261026141410` → `20261026143113`, получить ровно 11 versions, сверить hashes/RLS/grants/catalog, legacy данные/события. Применённые миграции не переписывать.
6. Собрать разрешённые Production candidate и rollback из закреплённых SHA без назначения домена, записать deployment IDs. Нынешняя локальная сборка с synthetic backend не пригодна как production prebuilt artifact. Guard допускает только канонический production alias; staged URL должен отклоняться. Для Hobby не рассчитывать на Previous: предыдущий production может быть несовместимым main; проверить возможность возврата на конкретный target, не менять тариф автоматически.
7. При закрытой записи переключить одобренный candidate на alias, выполнить DB-only canary и readonly smoke интерфейса в принятом объёме C11. SMTP/recovery принимаются отдельно по разрешённому сценарию. Полный пользовательский flow должен быть подтверждён изолированной копией; краткое открытие всем пользователям ради проверки запрещено.
8. Открыть запись только после приёмки и конкретного согласия, учесть старые вкладки/несохранённые drafts, наблюдать в согласованном окне. Зафиксировать фактические результаты, ответственного и post-cutoff записи.

## При сбое

- До SR06/SR07: прервать выпуск, сохранить прежнюю пару app/schema; gate снимать только после проверки и согласия.
- После SR06/SR07: сохранить закрытую запись, проверить фактическую history; исправлять вперёд либо вернуть только совместимый frontend, сохраняя 11 миграций, новые записи, operation keys, versions/RLS/history. Destructive schema-down не подготовлен.
- После открытия: закрыть затронутый поток, сохранить данные/логи без секретов; проверить target и ограниченный canary перед возвратом.
- При потере данных: сохранить повреждённый источник, восстановить отдельно, сверить post-cutoff изменения и согласовать переключение. Никогда не делать тренировочный restore поверх production.
- При утечке: ограничить доступ, сохранить доказательства, определить scope и согласовать rotation/revocation. Не удалять пользователей ради деактивации.

Переключение Vercel не откатывает БД/Auth/env. Recovery signing secret, канонические URLs и template должны соответствовать обеим новым сборкам; не возвращать старый Netlify URL автоматически. Отказ любого gate останавливает выпуск. Если совместимого облачного target нет, сохранить обслуживание и готовить исправление вперёд.

## Release record

Перед разрешением заполнить: owner/reviewer/incident contact; final и rollback SHA/deployment; team/project/backend; hashes миграций/lockfile; CI/manual/hosted evidence; backup/cutoff/key custodian/retention/RPO/RTO; canary IDs и его scope; окно, точные операции и согласие; smoke/наблюдение и фактический результат.

[Решения](DECISIONS.md) · [Maintenance](MAINTENANCE.md) · [Backup](BACKUP_RESTORE_RUNBOOK.md) · [Матрица QA](QA_ACCEPTANCE_MATRIX.md). Прежние локальные отчёты в evidence описывают свой SHA/дату; они не подменяют текущую приёмку. Учесть [объявленное изменение TLS Supabase](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) при выборе реальных устройств.
