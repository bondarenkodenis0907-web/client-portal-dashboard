# Управление объектом и контрактом — план и checkpoint

02.11.2026. База — #29, `e60b20955b3ecc74d93738ab92df49b9f00be146`.

**Этот коммит содержит только план. Функциональная реализация не опубликована.** Рабочая копия была подготовлена в отдельной ветке, но среда отключилась (`environment_offline`) до чтения файлов для публикации. Не считать этот документ доказательством наличия нового SQL/UI/API в GitHub. #29 и #24 не менялись.

## Подготовленный объём

- Создание/редактирование объекта: name, address, customer_name, contact_name/email/phone, archive, version/updated_at; CAS и стабильный draft UUID.
- Явная manager admission: активный service_staff И активный facility_managers. Администратор назначает отдельно; миграция не создаёт менеджеров. Обычный staff/клиент/metadata не повышают права.
- Контракт одного объекта, неизменяемые через API версии с реквизитами, ответственным, автором/временем и основным PDF. Замена/продление добавляют snapshot; прежние версии сохраняются.
- Отдельная CAS-защищённая публикация выбранной версии. Новая версия остаётся внутренней, пока не опубликована; снятие/смена публикации не удаляет историю.
- Клиент видит только текущую публикацию назначенного объекта. Старый/чужой UUID не открывает файл. Скачанные копии отозвать нельзя.
- Append-only management audit через API, сохранение прежнего request workflow/privacy/history.

## Выбор файлового backend для review

В неопубликованной реализации для ограниченного пилота использован private PostgreSQL bytea: один PDF до 2 MiB на версию. Metadata, bytes, digest и audit сохраняются атомарно и попадают в один DB backup.

Это **изменение относительно направления с private Storage bucket**, а не выполненная интеграция Storage. Техническое решение/лимит требуется принять до выпуска. Большие файлы, дополнительные приложения, сканы/Office, object Storage и его самостоятельное восстановление остаются отдельным этапом.

PDF ограничивается по действительным bytes/имени без path/control characters и %PDF- header. Это не антивирус и не полный PDF parser. Только attachment, без inline preview; no-store/nosniff/sandbox, SHA-256 проверяется при выдаче. Публичные/signed URLs не создаются.

## Матрица доступа

| Актор | Объекты | Контракт и PDF | Запись |
| --- | --- | --- | --- |
| Guest | Нет | Нет | Нет |
| Клиент | Назначенные | Текущая публикация своего объекта | Нет |
| Активный staff | Общий реестр одной компании | Только публикации видимых объектов | Нет |
| Активный staff + manager admission | Общий реестр | Все версии | Объект, append version, publish/unpublish |
| Отозванный manager | Только сохранённые обычные staff/client права | Внутренние версии закрыты | Нет |

Никакой cross-organization tenancy не заявляется. Контактные поля карточки видимы участникам её объекта. Управление зданиями и клиентскими admissions в этом срезе остаётся административным.

## Подготовленные SQL и API (ещё не в этом GitHub-коммите)

CLI создал в недоступной рабочей копии миграцию `20261102123056_site_contract_management.sql`: public.facility_managers/contracts/contract_versions/contract_events, private.contract_files и поля sites. Рабочая ветка имеет 13 миграций, 11 public RLS tables, 13 maintenance triggers и RLS на private bytes. Production остаётся на 11 версиях; новый DDL не применялся.

Authenticated получает SELECT без прямого DML. Public mutation wrappers — INVOKER; private ограниченные DEFINER entrypoints проверяют реальную активную admission, имеют empty search_path и отозванный PUBLIC/anon/service_role EXECUTE. SQL фиксированный, без клиентских имён таблиц/столбцов. Эти границы требуют независимого security review.

Стабильные operation/draft UUID, advisory lock/FOR UPDATE, expected site version/contract revision и exact-payload replay предотвращают дубли/stale overwrite. При неизвестном исходе нет автоматического повтора; пользователь проверяет сохранённое с тем же ID. Manager API не предоставляет update/delete версии/файла. Deferrable FK не позволяет committed версии остаться без файла или публикации указывать на чужой контракт.

POST /api/facility/manage: same-origin JSON, Auth/manager, bounded stream 3 MiB независимо от Content-Length, schema/input/CAS validation, generic errors.
GET /api/facility/files/[versionId]: Auth/RLS, digest check, attachment/no-store.
Server Components: sites new/edit, contract list/editor/version history, явное publish/unpublish.

## Проверки: что действительно произошло

В рабочей копии запускались 46 unit/policy tests (PASS), TypeScript/typegen, ESLint, format/diff/link/secret-pattern checks. Production build проходил в ходе реализации с placeholder config. Последний статический проход подтвердил 33 изменённых файла, 56 относительных ссылок и 13 migration files.

Эти локальные результаты **не аттестуют этот docs-only коммит**, не заменяют итоговый CI и не доказывают SQL/browser/restore. Локальный runtime отличался от pins: Node 24.22.1 / npm 11.9.0.

Подготовлены, но **не запускались** из-за отсутствия Docker/последующего отключения среды:
- 63 новых pgTAP assertions; предполагаемый общий suite — 334 / 10 файлов.
- 3 новых browser scenarios; общий suite — 41.
- Fresh/saved restore двух PDF-контрактов: bytes/digest/publication/client isolation; закрытые новые таблицы только пустые в preflight.
- Старый frontend rollback с сохранением контракта/PDF/объекта/заявок.
- Полный remote CI нового кода.

Существующий CI #29 подтверждает только прежний directory slice на e60b209, не контрактный этап.

## Продолжение

1. Восстановить подключение среды и проверить наличие рабочей копии/branch `feat/site-contract-management-20261102`.
2. Сверить source/diff, повторить актуальные локальные проверки и опубликовать фактические 33 файла отдельно от этого checkpoint.
3. Создать Draft PR к ветке #29; выполнить его собственный CI, исправить failures, записать точный SHA/run.
4. Провести независимый review manager/DEFINER/RLS/file boundary и принять bounded bytea/лимит либо реализовать Storage backend.
5. Production rollout/roles/реальные документы/backup и merge — отдельный согласованный шаг. Не повторять старый переход 8→11.

Hosted recovery по указанию владельца отложен для текущей разработки. Существующий recovery-код не удалялся. Никаких production writes, role assignments, реальных файлов, писем или deployment эта работа не выполняла.
