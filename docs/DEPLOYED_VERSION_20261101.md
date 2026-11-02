# Опубликованная версия — 1 ноября 2026

Проверка чтением. Миграции, пользовательские данные, Auth, настройки и deployment не изменялись.

## Установленная связь с GitHub

Рабочий `client-portal-dashboard-one.vercel.app` назначен на Vercel deployment `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od`, проект `prj_srNDpGdYxBgtSfsVfcizbRhistuJ`. Состояние READY, источник CLI; Git SHA в метаданных отсутствует.

Загруженный исходный набор соответствует коммиту [`a0c1af06b842e52e0b98d015adae15433fa2922d`](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/commit/a0c1af06b842e52e0b98d015adae15433fa2922d): **149 из 149 файлов совпали** по raw SHA-1 с UID файлов Vercel. Полный локальный снимок предварительно проверен по Git blob SHA всех 150 файлов этого коммита через GitHub API. Единственный Git-файл вне загруженного исходного набора — `.gitignore`; дополнительных исходных файлов нет. Полностью скачанные `.node-version` и `next.config.ts` дополнительно подтвердили соответствие UID контрольной сумме содержимого.

[Манифест сравнения](evidence/deployment-source-20261101.json) содержит путь, Vercel raw SHA-1, Git blob SHA-1 и SHA-256 каждого файла. Дерево Vercel содержит также 50 записей сгенерированного `out`; они исключены из сравнения исходников. Это устанавливает соответствие загруженного исходного набора, а не воспроизводимость скомпилированных файлов, фактического окружения сборки или историю запуска CLI. Build logs API вернул 404, в том числе с явным team ID. Большой ответ package.json был усечён коннектором; он не использовался как полная скачанная копия.

## Разница с кандидатом — обновлено 02.11

После интеграции #28 application-code baseline #24 — `ac362957a0c4c3aea2453a89f28ff90c71bccbec`, дерево `9c678ef38c26c569e8012017fe4619e45add1e47`. В отличие от production source `a0c1af06`, кандидат меняет `src/lib/supabase/proxy.ts`: transient getClaims/refresh failure возвращает private/no-store 503 с Retry-After, сохраняя cookies; retry проходит без нового login. Расширены unit/server-Auth tests, демонстрационные кадры/тест и документация/CI. Зависимости и миграции между этими версиями одинаковы. **Прежнее утверждение об одинаковом приложении кандидата и production после #28 больше не действует.**

[CI 41327554868](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41327554868) прошёл 8 jobs на `ac362957`: 43 unit/policy, 35 E2E, 230 SQL, server-Auth и guard/maintenance/canary/rollback/restore. Позднейшие документационные SHA требуют своих checks; это не hosted acceptance.

Alias/project/READY повторно прочитаны 02.11; назначение не изменилось. Vercel project lookup с явным teamId ранее дал 404, без необязательного параметра успешно вернул ожидаемый project/account. Это не вывод об удалении проекта и не подтверждение прав на переключение. Не путать этот scoped lookup с прежним 404 build logs, который не был устранён этой проверкой.

Main остаётся `00fc4b856109c29e59c9c71bfc7ea9c9927f8d58`, 8 миграций в Git; он не описывает опубликованную версию. Старые #22/#23 заменены общим #24.

## Выбранный cloud rollback

Существующий deployment `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od` / source `a0c1af06b842e52e0b98d015adae15433fa2922d` выбран для возврата после следующего выпуска. Его runtime-исходники, assets, dependencies и миграции совпадают с CI-tested rollback source `db0f9fb98acd6793c6bdacfc3c2e63fc2ca210ff`: полный Git diff между `db0f9fb9` и `a0c1af06` содержит только docs, CI и canary/rollback scripts. Это совместимость исходников на схеме 11, не тождество compiled artifacts/env. Тариф/права и фактический cloud switch ещё не приняты. Отсутствие A02 возвращается при откате.

## База и миграции

Supabase `xdpewqewdeiaoyotpawv` уже показывает **11 миграций**, включая `20261026141410`, `20261026143113` и `20261030113426`. `private.maintenance_state.enabled=false` на момент чтения. История версий сама по себе не доказывает соответствие каталога или данных SQL-файлам. Последующая [сверка каталога приложения](PRODUCTION_SCHEMA_CHECK_20261101.md) не выявила существенных расхождений в определениях/grants/triggers; данные и поведение под реальными JWT не проверялись.

**Старую последовательность перехода с восьми на одиннадцать миграций повторять нельзя.** Не выполнять повторный db push, повторную установку maintenance gate, repair/reset или переписывание history по историческому плану. Следующее изменение схемы требует свежей read-only сверки каталога и истории; этот отчёт не разрешает DDL.

## Что ещё не установлено

- Соответствие скомпилированных runtime-файлов исходникам и полный build provenance.
- Hosted recovery/SMTP, полная изоляция окружений, свежий backup cutoff и право/тариф и фактическая готовность выбранного rollback.
- Текущая применимость старых release-инструкций после внешних облачных изменений.

Повторно проверенное назначение канонического alias указывает на deployment выше. Предыдущий HEAD smoke: `/login` → 200, `/dashboard` → 307 на `/login`, private/no-store. Прямой deployment URL закрыт Vercel SSO; app-level guard за ним не принимался. Реальные логины, письма и записи не выполнялись.

Для будущего выпуска сохранять deployment ID, полный commit SHA и манифест исходников в записи выпуска; для CLI передавать SHA в deployment metadata из чистого checkout и проверять его после публикации. Новое развёртывание в этой проверке не создавалось.
