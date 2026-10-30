# Проверка допуска к выпуску 30.10.2026

**Результат: NO-GO.** Проверка чтением; production, настройки провайдеров и данные не изменялись. Merge/deploy/миграции не выполнялись. Этот срез дополняет исторические отчёты, не переносит их PASS на новые версии.

## DONE

- Кандидат `47865d5eb269833330793c5d36e725553e0f981d` отправлен в Draft [PR #24](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/pull/24). Main остаётся `00fc4b856109c29e59c9c71bfc7ea9c9927f8d58`.
- [CI #158](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41073234172): восемь jobs success, включая release-gates. Проверенный merge ref `e2901607aba0c2b26f555cbea9a92f7124d7c163` и candidate имеют одинаковое дерево `d9719a53ce7d7317660ecf5c5d72daf8807074b5`.
- В логах подтверждены 11 миграций, 230 SQL assertions, 32 browser сценария, maintenance API/barrier, порядок установки gate перед SR06/SR07, 24 архивных browser сценария rollback и сохранение записей при переключении.
- Linux restore-drill: preflight и восстановление свежей синтетической копии success. Sanitized artifact `restore-drill-reports`, ID `12986700875`, digest `sha256:9ba4fc215859460f958626a43252d1e363dfb3d27d98ac111dfc41fa154ec709`, срок хранения до 06.11.2026. Подтверждены наличие artifact и результат job; содержимое zip не скачивалось.
- Supabase MCP вновь подтвердил восемь production migrations до `20261010153002`; gate/SR06/SR07 туда не применены.
- Vercel UI подтвердил текущий Ready production deployment `GsCimJju6b7wDRYHL1u34gNaMqxF`, source main/`00fc4b8`, alias `client-portal-dashboard-one.vercel.app`. Production branch tracking main и auto-assignment включены. Preview branch tracking выключен, домены к Preview не прикреплены.

## Условия G01–G07

| Gate | Статус | Что осталось |
| --- | --- | --- |
| G01 — точный набор/review | PREPARED | SHA и hashes закреплены; финальное принятие всего diff и порядок интеграции #24 вместо старых #22/#23 не согласованы. Описание PR ещё ссылается на предыдущий SHA/CI и требует обновления перед review. |
| G02 — CI/review/приёмка | PREPARED | Remote CI закрыт. Автоматические browser проверки не заменяют ручную приёмку владельцем. Предыдущее независимое read-only review не является hosted Auth acceptance. |
| G03 — окружения/изоляция | BLOCKED | Параметры Supabase URL и publishable key в Vercel имеют All Environments scope; значения не раскрывались. Исторические Preview остаются Ready (#22/#23 и более старые). Отключённый tracking не отзывает существующие deployment и не запрещает CLI/API. Полная изоляция и инвентаризация исторических ресурсов не аттестованы. |
| G04 — Auth/SMTP | BLOCKED | Hosted доставка/recovery/template/redirect/signing-secret runtime не приняты. D04: direct Auth API и TTL ранее выданных JWT требуют решения; app-only recovery не равнозначен запрету direct Auth. Leaked-password protection остаётся disabled (WARN). |
| G05 — backup/эксплуатация | PREPARED | Реальная переносимая копия и отдельное восстановление имеют предыдущие локальные доказательства; новый cutoff backup и сверка последующих записей нужны перед выпуском. D06/D07: retention, расписание, RPO/RTO, ответственные, поддержка/алерты не приняты. Полнота DB/Auth/files/config должна быть явно согласована; DB dump не включает внешние настройки/секреты. |
| G06 — maintenance/canary/rollback | BLOCKED | Gate/порядок/совместимость проверены в синтетике. Controlled canary отсутствует; открытие записи всем не заменяет его. Rollback9d не содержит пяти QA-исправлений; нужен reviewed target и конкретный облачный Production deployment ID/способ возврата. Production-инструмент установки gate вне порядка дат и регистрации history ещё не выбран/reviewed. |
| G07 — разрешение выпуска | BLOCKED | Нет конкретного согласия на SHA, ресурсы, действия, окно, ответственного и критерии остановки/отката. |

## Дополнительные ограничения проверки

- GitHub branch GET показывает protected main и обязательные contexts только `check`, `database-tests`. `release-gates` среди них отсутствует; rulesets GET вернул пустой список. Полный protection endpoint вернул 403, поэтому reviewers/bypass/admin enforcement не аттестованы. Настройки не менялись.
- Vercel MCP get project/list deployments вернул 404/403; сведения выше прочитаны в существующей авторизованной UI-сессии. Локальные `vercel` и `gh` в PATH отсутствуют; установка/новый вход не выполнялись.
- CI workflow запускает `test:restore:preflight` и `test:restore`, но не `restore:backup`. Повторная полная проверка отдельного saved-backup consumer и последовательности нового/старого архивов после последних исправлений остаётся NOT_RUN. Зелёный restore-drill не закрывает этот отдельный объём. Windows reserved ports по-прежнему ограничивают прежний локальный путь; сетевые настройки не менялись.
- Настройка RECOVERY_SIGNING_SECRET видна как Production-only Secret, без раскрытия. Наличие настройки не подтверждает её применение текущим deployment или корректность писем.
- Повторных production логинов, писем, записей, чтения содержимого пользовательских таблиц или расшифровки backup в этой проверке не было. Netlify повторно не проверялся; сохраняется предыдущий срез.

## Hashes кандидата

| Файл | SHA256 |
| --- | --- |
| package-lock.json | `90c8ef30015133381ff6f631fd991206a5d18ffff2c3b170b2008cff2a183bc7` |
| 20261026141410_idempotent_request_creation.sql | `a53f65a95c0da300d2da43421304d328867fafe231342d503eca39b94a345985` |
| 20261026143113_versioned_request_processing.sql | `8e01dc128a50863389e66c98b65864f07a0371e1453dea5307f67f0430f4fd5c` |
| 20261030113426_maintenance_write_gate.sql | `ebbac52e7754e75d08daaf289c93bd1138ed1f9e3827d5ccb8dae2b5b4373128` |

## Ближайший безопасный шаг

После этого среза rollback target обновлён на `47865d5`: локально PASS всех 32 browser сценариев, continuity/version/history/replay и maintenance denial, cleanup завершён. Ограничение старого target «без QA-исправлений» устранено локально; конкретный облачный deployment ID и удалённая проверка изменённого скрипта остаются открытыми. Исторический CI #158 проверял прежний rollback9d и не является доказательством нового target.

Подготовить и проверить controlled canary локально: явный узкий допуск тестовых участников при закрытой записи для остальных, с отрицательными прямыми API-проверками и сохранением fail-closed. Сначала определить границы Auth/служебных операций и критерии допуска; production gate не открывать. Параллельные условия выпуска — отдельная полная репетиция saved-backup consumer, выбор актуального rollback target, принятие D04/D06/D07 и ручная приёмка владельцем. Изменения GitHub/Vercel, hosted acceptance и выпуск согласуются отдельно конкретным набором действий.

[Порядок выпуска](RELEASE_ROLLBACK_RUNBOOK.md) · [Решения](DECISIONS.md)
