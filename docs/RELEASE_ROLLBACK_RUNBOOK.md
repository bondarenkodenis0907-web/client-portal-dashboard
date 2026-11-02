# Выпуск и откат

Действующий план, 02.11.2026. **NO-GO для production до приёмок и конкретного разрешения.** Публикация документации в #24 не выполняет выпуск. Работа остаётся бесплатной; Preview закрыт, hosted staging отложен.

Этот runbook относится к базовому #24 без facility migration. Отдельная [feature-ветка объектов](FACILITY_DIRECTORY.md) готовит двенадцатую миграцию; для её выпуска нужен новый reviewed delta plan и собственный CI/rollback/schema acceptance. Разработка этой ветки продолжается с отложенным hosted recovery, без изменения production.

Отдельная [ветка управления объектом и контрактом](SITE_CONTRACT_MANAGEMENT.md) содержит 13-ю миграцию и private DB PDF. Она также не покрыта этим runbook: нужны delta rollout, review manager/definer boundaries, принятие storage/лимита, собственные CI и проверка реального restore с файлами. Production на 11; auto-merge/deploy не выполняется.

## Исходное состояние

| Назначение                         | Закреплённый ресурс                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Кандидат                           | #24; application-code baseline `ac362957a0c4c3aea2453a89f28ff90c71bccbec`, включает #28                                                                                                     |
| Проверенный CI                     | [41327554868](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41327554868), 8 jobs SUCCESS на baseline; последующие commits требуют собственного результата |
| Main                               | `00fc4b856109c29e59c9c71bfc7ea9c9927f8d58`, 8 миграций в Git; не является совместимым rollback                                                                                              |
| Vercel                             | team `team_vOX8YKiZtfFXHWpxEya9i06D`, project `prj_srNDpGdYxBgtSfsVfcizbRhistuJ`                                                                                                            |
| Alias / действующий deployment     | `client-portal-dashboard-one.vercel.app` → `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od`, READY/production                                                                                             |
| Uploaded source действующей версии | `a0c1af06b842e52e0b98d015adae15433fa2922d`, 149/149 source files сверены 01.11; alias повторно прочитан 02.11                                                                               |
| Supabase                           | `xdpewqewdeiaoyotpawv`, уже 11 миграций; maintenance=false при read-only проверке 02.11                                                                                                     |
| Выбранный rollback                 | Существующий cloud deployment `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od`, source `a0c1af06`; cloud switch/право/тариф не испытаны                                                                   |

**Не повторять переход 8→11, установку gate/SR06/SR07, db push, repair/reset по старому плану.** Новый DDL/env/roles в этот выпуск не запланирован. Исторический [срез 30.10](RELEASE_GATE_CHECK_20261030.md) не является действующей инструкцией; прежняя последовательность сохранена в Git history, а не среди текущих шагов.

[Текущий статус безопасности](SECURITY_STATUS.md) · [Source provenance](DEPLOYED_VERSION_20261101.md) · [Schema scope](PRODUCTION_SCHEMA_CHECK_20261101.md) · [Read-only snapshot](evidence/project-state-20261102.json).

## Условия допуска

| Gate                  | Статус сейчас | Что нужно для GO                                                                                                                        |
| --------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| G01 — code/version    | PREPARED      | Закрепить итоговый release SHA после согласованного main merge и его собственный CI; не наследовать PASS baseline автоматически         |
| G02 — review/QA       | PREPARED      | Ручная приёмка владельцем и итоговый diff; CI baseline: 43 unit/policy, 35 E2E, 230 SQL, server-Auth, guard/canary/rollback/restore     |
| G03 — окружения       | BLOCKED       | Принять объём исторических deployment, проверить права/тариф/auto-assignment; env Production-only сам по себе старые bundles не очищает |
| G04 — hosted recovery | BLOCKED       | Реальная почта, template/allowlist, signing-secret runtime, пароль/logout; решения D04/TTL/direct Auth/leaked-password protection       |
| G05 — backup/restore  | BLOCKED       | Свежая encrypted production-копия, отдельный переносимый ключ, independent restore, полнота DB/Auth/files/config и измеренное время     |
| G06 — canary/rollback | PREPARED      | Cloud ID выбран и runtime sources сравнились; проверить право возврата на точный ID и согласовать production canary tool/test IDs       |
| G07 — окно/операции   | BLOCKED       | Исполнитель, резервный, reviewer/incident contact, окно, support/stop-критерии и точное разрешение                                      |

## Hosted recovery: перед выпуском и после

Тестировать только отдельно согласованную disposable учётную запись/ящик, без staff и реальных заявок. Не помещать пароли, OTP/JWT/cookies и recovery URLs в logs/reports/screenshots. Перед реальными письмами/сменой пароля требуется подтверждённый scope. Provider-настройки читать без вывода secret values; не менять их по ходу приёмки.

1. H01: проверить SMTP, recovery template, Site URL/redirect allowlist, наличие server-only signing secret, TTL и limits. Env metadata не является runtime PASS.
2. H02: войти тестовым пользователем в две независимые сессии, запросить одно письмо. Зафиксировать UTC request/delivery и фактическую доставку без тела/ссылки. Не делать бесконтрольные повторы.
3. H03: открыть callback/confirm и повторить GET до явного подтверждения: пароль не меняется, token не расходуется. После явного POST правильный origin и относительный redirect сохраняются. GET-only scanner coverage не гарантирует защиту от scanner, отправляющего формы.
4. H04: mismatch/слабый пароль отвергаются без изменения; валидный пароль ≥12 символов, ≤72 UTF-8 bytes и подтверждение принимаются только после серверного успеха.
5. H05: завершение global logout подтверждено; старый пароль не работает, новый работает, старые refresh-сессии не продлеваются. Уже выданный access JWT может жить до expiry: зафиксировать фактический TTL/решение D04, не обещать мгновенный отзыв.
6. H06: replay старой ссылки и reset из обычной сессии без recovery grant не дают повторной смены пароля.
7. H07: согласованный несуществующий адрес получает тот же общий ответ; отдельные неверный/просроченный токены отклоняются. Не посылать письма на чужой существующий адрес.
8. При pending/unknown не повторять автоматически password write; отдельно установить фактический результат/завершить logout. Production fault injection не проводить.

Предрелизный тест на действующем alias относится к `a0c1af06`, **не к кандидату**. После одобренного переключения/открытия повторить hosted recovery на новом deployment в период наблюдения. Если кандидат должен пройти реальную почту до открытия пользователям — нужен отдельно одобренный изолированный hosted target; Preview guard не обходить и production backend к Preview не подключать.

Maintenance gate блокирует `auth.users`, включая password update. Не тестировать успешную смену пароля при gate=true и не открывать запись всем кратковременно ради acceptance. До GO принять D04: direct Auth policy/JWT TTL и disabled leaked-password protection. Платная функция/расходы автоматически не разрешены.

Hosted PASS требует H01–H07 без нерешённого UNKNOWN, с deployment/source SHA, UTC, reviewer и обезличенным результатом. CI не заменяет эту приёмку.

## Свежая копия и независимое восстановление

Свежая production-копия этой работой не создана. [Synthetic backup runbook](BACKUP_RESTORE_RUNBOOK.md) и его scripts не направлять на production/реальные данные. Нужны отдельно reviewed production-процедура, доверенный исполнитель и разрешённый пустой изолированный target.

C10: ciphertext на **F:**, переносимый ключ отдельно на **E:**, хранение **14 дней**, копия перед каждым выпуском. Цели **RPO ≤24 ч / RTO ≤4 ч** требуют измерения; ежедневный процесс не настроен. С телефона нельзя подтвердить наличие носителей, независимость ключа и фактическое восстановление без выполнения этих операций доверенным компьютером.

После предрелизной hosted-приёмки закрыть existing DB gate, дождаться write barrier/COMMIT, независимо проверить состояние/отказ записи. Gate охватывает 4 app tables и auth.users, но не всю Auth/Storage/внешнюю доставку. Снять консистентный snapshot с точным UTC cutoff; несколько компонентов должны использовать согласованный snapshot или иметь описанную процедуру сверки.

Состав: app schema/data, нужный Auth-контент, grants/RLS/functions/triggers/extensions, migration history и воспроизводимая конфигурация ролей. Проверить реальный состав dump: defaults команды не гарантируют полноту. Шифровать до постоянной записи; plaintext/credentials/ключи не помещать в temp/logs/Git/CI artifacts/ChatGPT-файлы. Ключ проверить без исходного Windows-профиля — DPAPI CurrentUser не является отдельным переносимым ключом.

Закрытый manifest: backup ID, source ref, UTC/cutoff, server/tool versions, 11 migration versions, source/candidate/rollback SHA, ciphertext SHA-256/размер, inventory/row counts, custodians и retention. Secret values хранятся отдельно зашифрованно. Storage objects, SMTP/OAuth/redirect, Vercel config/env, signing secret, passwords/jobs требуют отдельной инвентаризации/копии; DB-backup не сохраняет сами Storage-объекты.

Восстановить **именно релизный архив** с отдельным ключом в подтверждённый пустой target. Не обходить preflight удалением неизвестных данных. Отключить внешние письма/hooks/jobs, исключить использование активных production sessions. Если snapshot содержит gate=true, его снятие для проверок разрешается только внутри изолированной копии; production gate остаётся закрытым. Проверить schema/migrations/counts/FK/grants/RLS, Auth test login, роли/приватность, workflow/version/history/idempotency. Измерить от начала restore до проверенной готовности; согласовать остаточные ограничения. Реальные данные требуют соответствующего закрытого доступа к target.

Backup PASS: ciphertext/ключ доступны раздельно, independent restore этого архива принят, полнота и post-cutoff записи описаны, время измерено, owner/резервный назначены. Если между репетицией и выпуском сервис открывался, потребуется новый cutoff/архив; старый restore нельзя выдавать за проверку новой копии.

## Последовательность выпуска

Дата/длительность окна пока не назначены. Предлагаемый период наблюдения после открытия — 30 минут; фактический график поддержки принимает владелец.

1. Согласовать scope: #24, test mailbox/user IDs и canary IDs/operation UUID, backup/restore target, окно/ответственные, stop/rollback-критерии. Не включать DDL/env/roles/платные услуги без нового решения. Принять hosted baseline и открытые D04/D06/D07.
2. Свежим чтением сверить refs/alias/team/project/backend/11 migrations/gate, права promote/rollback и тариф. Любой drift требует пересмотра плана.
3. **До main merge** отдельно согласованно контролировать Git auto-deploy/auto-assignment. Merge может немедленно выпустить приложение. `--skip-domain` отдельного CLI deploy не защищает от независимой Git-сборки. Если случайную публикацию нельзя исключить — STOP до merge.
4. После конкретного разрешения объединить #24 в main; записать фактический итоговый release SHA/дерево и его собственный CI. Baseline `ac362957` не заменяет проверку merge SHA.
5. Собрать reviewed/pinned CLI production deployment без назначения доменов (`deploy --prod --skip-domain`, предварительно проверив текущий help); записать READY/production ID и source provenance. Не использовать synthetic prebuilt artifact/Preview build и не включать `--public`. Guard по-прежнему должен закрывать staged URL; его READY не доказывает hosted recovery.
6. Подтвердить, что canonical alias всё ещё указывает на выбранный старый target. Проверить доступность возврата именно на этот ID по тарифу/правам; не вставлять промежуточный aliased production deployment. Не менять env одновременно.
7. Закрыть existing DB gate и выполнить свежий cutoff/backup/independent restore в объёме выше; при провале оставить запись закрытой до принятого решения. Миграции не переустанавливать.
8. При закрытой записи promote конкретного READY ID шага 5 на canonical alias. Перечитать назначение/source. Не пересобирать приложение при переключении.
9. Выполнить принятый DB-only canary и readonly production UI smoke при gate=true. Проверить login/forgot-password/guest dashboard и авторизованные client/staff reads; не проводить password write при закрытом gate.
10. После приёмки — явное GO на открытие записи. Подтвердить false/UTC; выполнить согласованный hosted recovery кандидата и наблюдение. Это обычное открытие сервиса по решению, не краткий обход ради canary.
11. Записать фактические результаты, post-cutoff writes, SHA/deployment/CI/backup/reviewer и состояние auto-assignment. DONE присваивать только выполненному объёму.

## Принятый DB-only canary

SQL для review — `scripts/release-canary.sql`; `scripts/test-release-canary.mjs` является только guarded synthetic runner, не production-командой. Production-инструмент/таймауты/журнал/test IDs требуют отдельного review и разрешения. Staff активен; client/staff/outsider явно выделены.

Транзакция требует gate=true, блокирует singleton, устанавливает false только в незакоммиченной транзакции, проверяет create/idempotent replay/version 1→2→3/stale отказ/closure/3 events/outsider privacy, возвращает true до COMMIT. Внешние писатели ждут и получают отказ; при disconnect/error false откатывается. Никаких DDL/HTTP/интерактивных пауз/постоянного bypass. SQL содержит короткие lock/statement/idle timeouts.

После успешного COMMIT остаются одна закрытая synthetic заявка и 3 события; согласовать их сохранение и отметить как post-backup-cutoff. SQL claims проверяют RLS, не подлинность JWT. Canary не подтверждает browser writes/PostgREST/SMTP/все Auth tables; полный flow репетируется изолированно. Кратко открывать всем запись ради canary запрещено.

DB gate и `CLIENT_PORTAL_MAINTENANCE` независимы. Изменение Proxy env может потребовать deployment и не входит в этот план; закрытая UI-страница не заменяет DB gate.

## Точный откат

Target: project `prj_srNDpGdYxBgtSfsVfcizbRhistuJ`, **deployment `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od`**, source **`a0c1af06b842e52e0b98d015adae15433fa2922d`**, canonical alias выше. БД сохраняется на 11 миграциях.

Runtime sources/assets/dependencies/migrations `a0c1af06` совпадают с CI-tested rollback source `db0f9fb98acd6793c6bdacfc3c2e63fc2ca210ff`; полный diff — docs, CI и canary/rollback scripts. Это не compiled/env equivalence и не испытанный cloud switch. На Hobby Instant Rollback ограничен предыдущим deployment; фактический тариф/доступность target проверить в окне. Недоступный target означает NO-GO, не замену старым main. `dpl_GsCimJju6b7wDRYHL1u34gNaMqxF`/main несовместим с новым write contract, даже если платформа считает его eligible.

Предлагаемый STOP немедленно: чужие данные, неверный backend/source/alias, потеря истории, нарушение gate или провал обязательного smoke/recovery/неразрешённый UNKNOWN. Для предположительно временного Auth/5xx — одна повторная проверка через 5 секунд **без повтора записи**; повторный отказ требует incident/rollback-решения. Это предлагаемый порог окна, не SLA.

После разрешения: остановить новые deploy, сохранить evidence без секретов; при уже открытом сервисе закрыть existing gate и дождаться barrier. Выполнить поддерживаемую rollback-операцию на **точный ID**, проверить alias/source/READY, gate=true, 11 migrations и readonly client/staff/continuity. Открыть запись только после явного решения; при сомнении оставить закрытой. Проверить auto-assignment после rollback, не допустить случайного повторного выпуска.

Откат возвращает отсутствие A02: временный отказ Auth снова может привести к login. Если инцидент вызван именно этим, rollback не лечит его; нужен maintenance/отдельно reviewed forward fix. Code rollback не отменяет пароли, письма или post-cutoff записи и не восстанавливает БД. Production DB restore — отдельное разрешение: сохранить повреждённый source, восстановить отдельно, сверить post-cutoff и только потом решать переключение.

## Карточка исполнения

До разрешения заполнить: окно UTC; исполнитель/резервный/reviewer/incident contact; final SHA/CI/deployment; точный rollback ID/source и доступность; team/project/backend; migration/lockfile hashes; hosted record; backup ID/cutoff/hash/custodians/retention/restore target/измеренное время; canary IDs/operation UUID/пост-cutoff данные; auto-assignment; stop/monitoring; точные разрешённые операции.

Каждый шаг: UTC, среда/SHA/deployment, PASS/FAIL/UNKNOWN, обезличенное evidence, reviewer и решение. Секреты/recovery URLs/реальные заявки не публиковать. Следующий шаг — согласовать test account/mailbox для hosted recovery и trusted executor для F:/E:/isolated restore. Main merge/deploy/SQL writes/письма/смена пароля ещё не разрешены этой публикацией GitHub.

[Решения](DECISIONS.md) · [Maintenance](MAINTENANCE.md) · [Synthetic backup](BACKUP_RESTORE_RUNBOOK.md) · [QA](QA_ACCEPTANCE_MATRIX.md) · [Vercel deploy](https://vercel.com/docs/cli/deploy) · [Vercel rollback](https://vercel.com/docs/instant-rollback) · [Supabase backups](https://supabase.com/docs/guides/platform/backups).
