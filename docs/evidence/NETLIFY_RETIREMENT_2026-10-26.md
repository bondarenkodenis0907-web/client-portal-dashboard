# Netlify Client Portal — вывод из эксплуатации

Дата: 26.10.2026, Europe/Moscow. Основание: прямое поручение владельца «из эксплуатации нужно вывести netlify» после аудита обоих дополнительных сайтов.

## DONE

| Проект                  | Site ID                              | Доступность       | Автосборки |
| ----------------------- | ------------------------------------ | ----------------- | ---------- |
| client-portal-dashboard | 4730a1f2-1c0b-49ad-9abc-e9528813bbd0 | Disabled / Paused | Stopped    |
| ornate-daffodil-920c83  | e8e441d8-bbba-4d9a-8f26-bcbffc88580f | Disabled / Paused | Stopped    |

В панели каждого проекта выполнено обратимое Disable project. Панель подтвердила `Your project is currently disabled`. В Developer settings отдельно установлен Stopped builds. Итоговый список проектов показывает у обоих `Builds are stopped` и `Paused`.

Проекты, настройки и сохранённые deploy не удалены. Репозиторий остаётся привязанным; unlink не применялся. Остановка сборок предотвращает автоматическую сборку из Git; отключение проекта прекращает обслуживание его сайтов. Это не создание отдельного тестового backend. Vercel, Supabase, main и PR не изменялись. Hosted Auth, миграции, ключи и пользовательские данные не менялись.

## Проверка известных адресов

Браузер открыл `/login` на каждом из шести адресов ниже. Во всех случаях показана страница Netlify **Site not found**, без приложения Client Portal:

- `client-portal-dashboard.netlify.app`
- `ornate-daffodil-920c83.netlify.app`
- `deploy-preview-22--client-portal-dashboard.netlify.app`
- `deploy-preview-22--ornate-daffodil-920c83.netlify.app`
- `6adce8664e402e22191997d6--client-portal-dashboard.netlify.app`
- `6adce866c6e5806d76904416--ornate-daffodil-920c83.netlify.app`

Последние два permalink получены из метаданных соответствующих deploy через Netlify connector. `ready` в метаданных сохранённой сборки не означает доступность отключённого проекта. Никакие формы приложения не отправлялись. Полный перечень всех исторических URL не перебирался; отключение выполнено на уровне обоих проектов.

## Доказательства

- `netlify-both-retired.png`: итоговый список с Paused и Builds are stopped у обоих проектов.
- `netlify-client-portal-disabled.png`: подтверждение Disabled первого проекта.
- `netlify-ornate-disabled.png`: подтверждение Disabled второго проекта.

## Возврат и оставшиеся ограничения

Если Netlify снова понадобится, владелец сможет включить проект через Configuration → Project availability → Enable project и отдельно активировать сборки. Перед этим обязательна изоляция backend; сейчас Vercel Preview и Production по-прежнему используют общий Supabase. Не включать проекты автоматически.

Вывод Netlify из эксплуатации закрывает обнаруженную лишнюю публикацию, но сам по себе не закрывает зависимости, приёмку Proxy/Auth, актуализацию #23, isolation и остальные критерии выпуска. Старый CI preview-host-smoke остаётся исторически FAIL; workflow ещё не изменён и не перезапущен. Не обходить его проверку безопасности ради зелёного статуса: корректную обработку подтверждённо отключённых хостов следует подготовить отдельным изменением с тестами.
