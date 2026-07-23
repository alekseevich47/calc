# TASKS_graph — настройка «Графика» + производительность (виртуализация, memo, sync-стор, глобальные стили)

> Атомарный план. Каждый пункт — самостоятельная задача: «читать» (контекст, не менять) → «создать/редактировать» (результат).
> Код не пишем, только план. Правки БД/PocketBase этим планом не требуются — все 5 задач чисто клиентские.
> Требование ко всем задачам 2–5: **не менять визуал и не ломать существующую логику** (свайпы, long-press, dropdown, синк, офлайн-очередь) — только внутренняя механика рендера/данных.
> После реализации всех пунктов — `graphify update .`, затем обновить `.cursor/rules/stack.mdc` (см. низ файла — черновик правок уже подготовлен в этом коммите отдельно).

## Контекст из графа (graphify)

- God-nodes по теме: `syncNow()` (23 связи), `confirmShift()` (20), `pushQueueItem()` (14), `getDb()` (13), `updateShift()` (13) — всё в `src/lib/sync.ts`/`src/lib/db.ts`. Любые изменения в `sync.ts` (Задача 4) затрагивают самый связанный модуль проекта — менять точечно, не переписывать файл целиком.
- `HistoryPage()`, `HomePage()`, `ProfilePage()` — все читают состояние через `useShifts()`/`useDictionaries()`/`useSyncStatus()` из `sync.ts`; общий канал обновления — один и тот же `subscribe`/`emit` (community «IndexedDB Shift Cache» + «PocketBase Sync Layer»). Задача 4 разводит этот канал — задевает все три страницы **по чтению**, но их публичный контракт (`useShifts()`, `useDictionaries()`) не меняется, поэтому сами страницы не редактируются.
- `ProfilePage()` уже содержит готовый паттерн «настройка в списке → sheet с опциями» (`LangSheet`/«Язык») — Задача 1 копирует этот паттерн, а не изобретает новый.
- `GlobalStyles()` (`shared.tsx`) уже используется в 3 местах (`AuthPage`, `RegisterPage`, `AppShell` mobile) — Задача 5 обобщает существующий паттерн, а не создаёт новый механизм.

---

## Задача 1. Настройка «Графика»: Высокая / Низкая — в разделе Профиль

### Дизайн-решение

Не трогаем ни один существующий инлайн-стиль в компонентах. Вместо этого:
- На `<html>` ставится атрибут `data-graphics="high" | "low"` (по умолчанию `"high"` = текущее поведение, 1:1).
- Один глобальный CSS-файл с правилами `html[data-graphics="low"] * { ... !important }`, который **перебивает** инлайн-стили компонентов (правило CSS: `!important` в стилевом файле сильнее, чем обычный, без `!important`, инлайн-стиль — а инлайн-стили blur/animation/transition в проекте везде без `!important`).
- Значение хранится в `localStorage` + отдаётся простым модульным стором (тот же паттерн `subscribe/emit`, что уже есть в `sync.ts` для `SyncStatus`), чтобы `ProfilePage` могла управлять, а `main.tsx` — применить атрибут ещё до первого рендера (без «мигания» высокого качества).

### Что подавляется в режиме «Низкая» (не меняя разметку/цвета/расположение)
- `backdrop-filter` / `-webkit-backdrop-filter` → `none` (все 30+ мест: `BottomNav`, sheets, sidebar, карточки History/Profile/Home — см. список файлов ниже).
- Длительность `animation`/`transition` → близкая к нулю (не `none`, чтобы не сломать код, если где-то в будущем понадобится `transitionend`; сейчас таких слушателей нет — проверено, `transitionend`/`animationend`/`onTransitionEnd` в `src/` не используются, риска нет).
- Скорость свайпа/long-press (`onPointerMove` в `ShiftCard`) не меняется — это JS-логика, не CSS, трогать не нужно.

### Читать
- `src/pages/ProfilePage.tsx` — целиком, в фокусе: `LangSheet()` (L42‑94, «Язык интерфейса» — образец второго sheet'а), блок настроек с кнопкой «Язык» (L281‑299, `Globe`/`ChevronRight`), состояние `language`/`showLang` (L165‑166, L336).
- `src/lib/sync.ts` — `SyncSnapshot`/`snapshot`/`listeners`/`subscribe`/`emit`/`setSnapshot`/`useSyncExternalStore` (L166‑230) как образец модульного стора с подпиской (для нового стора графики использовать тот же приём, но **отдельный** независимый модуль — не подключать к `sync.ts`).
- `src/main.tsx` — точка входа, где выставляется тема/сессия до `createRoot` (L1‑33) — здесь же нужно применить сохранённое значение графики к `<html>` до первого рендера.
- `src/styles/index.css` — текущие 3 `@import` (fonts/tailwind/theme) — сюда добавится 4-я строка.
- Полный список мест с `backdropFilter`/`WebkitBackdropFilter` (нужны только как справка «что перебивает CSS-правило», редактировать их не нужно): `src/components/shared.tsx` (`BottomNav` L85, `StatusBadge` L154), `src/pages/AppShell.tsx` (L151, 209, 232, 318, 559 десктоп-сайдбар/шторки), `src/pages/HomePage.tsx` (L151, 241, 254, 559, 834, 1039, 1233, 1441, 1472, 1530, 1622, 2065, 2184, 2425, 2474), `src/pages/HistoryPage.tsx` (L192 календарь, L256 фильтр, L523 dropdown, L762 edit-sheet, L1145 карточка смены), `src/pages/ProfilePage.tsx` (L57, 109, 202, 239, 281, 327).

### Создать
- `src/lib/graphicsPreference.ts` — модуль-стор по образцу `sync.ts`:
  - `type GraphicsQuality = "high" | "low"`.
  - `GRAPHICS_STORAGE_KEY = "calc_graphics_quality"`.
  - `getGraphicsQuality()`, `setGraphicsQuality(q: GraphicsQuality)` — пишет в `localStorage` + сразу выставляет `document.documentElement.dataset.graphics = q` + уведомляет подписчиков.
  - `useGraphicsQuality(): GraphicsQuality` — хук на `useSyncExternalStore` (как `useSyncStatus()` в `sync.ts`).
  - `applyStoredGraphicsQuality()` — читает `localStorage` (fallback `"high"`) и выставляет атрибут на `<html>`; вызывается один раз в `main.tsx` до `createRoot`.
- `src/styles/graphics-low.css` — CSS-правила подавления blur/анимаций под `html[data-graphics="low"]` (селектор через атрибут на `<html>`, не через класс — не пересекается с `.dark`/tailwind-вариантами из `theme.css`).

### Редактировать
- `src/main.tsx` — вызвать `applyStoredGraphicsQuality()` в самом начале (до `restoreSession()`/`createRoot`).
- `src/styles/index.css` — добавить `@import './graphics-low.css';` (после существующих трёх строк).
- `src/pages/ProfilePage.tsx`:
  - Добавить блок настройки «Графика» в тот же контейнер, где сейчас «Язык»/«О приложении» (после кнопки «Язык», L299, перед «О приложении» либо после — по аналогии, тот же `borderBottom`-паттерн между пунктами списка), с иконкой (например `Sparkles` или `Zap` из `lucide-react`, уже используемого набора) и текущим значением («Высокая»/«Низкая») справа + `ChevronRight`, тот же визуальный паттерн, что у кнопки «Язык» (L283‑299).
  - Новый sheet `GraphicsSheet()` — копия структуры `LangSheet()` (L42‑94), с двумя опциями `["Высокая", "Низкая"]`, читает/пишет через `useGraphicsQuality()`/`setGraphicsQuality()` из `src/lib/graphicsPreference.ts` (не локальный `useState`, в отличие от `language`, — значение должно сохраняться между перезапусками).
  - Стейт `showGraphics` рядом с `showLang`/`showAbout` (L166‑167, L336‑337).

### Проверить вручную
- Переключение на «Низкая» и обратно — на Android с 4 ГБ ОЗУ: пропадание блюра на пилюле навигации, sheets, карточках; свайп/long-press в Истории продолжают работать.
- Значение сохраняется после закрытия/повторного открытия PWA (офлайн, без сети).

---

## Задача 2. Виртуализация списка Истории (только видимые карточки)

### Дизайн-решение

- Библиотека: **`@tanstack/react-virtual`** (не `react-window`) — потому что высота `ShiftCard` не фиксирована (раскрытие по тапу добавляет блок деталей, `RestorePlaceholder` ниже обычной карточки) и `react-window` требует либо фиксированную, либо заранее считаемую высоту. `@tanstack/react-virtual` умеет измерять реальную высоту через `measureElement`/`ResizeObserver` — не требует переписывать `ShiftCard`.
- Скролл в проекте — **общий** для всей страницы через `phoneRef` из `ShellContext` (`useOutletContext`, тот же `ref`, что уже использует `ShiftCard` для определения скролла при long-press, L946/973 в `HistoryPage.tsx`). Виртуализатор должен использовать **этот же** `phoneRef.current` как `getScrollElement`, а не создавать свой отдельный скролл-контейнер — иначе сломается общий скролл страницы (шапка/итоговая карточка должны скроллиться в одном потоке с карточками).
- Виртуализируется **только** список `filtered.map(...)` (карточки/`RestorePlaceholder`, сейчас L1362‑1387). Шапка (L1332‑1359) и итоговая карточка (L1389‑1411) остаются обычными DOM-узлами до/после виртуализированного блока — не входят в список элементов виртуализатора.
- Использовать `measureElement` (динамические размеры) вместо фиксированной `estimateSize` — обязательно, иначе раскрытие карточки/переход в `RestorePlaceholder` будет визуально «прыгать».

### Читать
- `src/pages/HistoryPage.tsx` — целиком в фокусе:
  - `ShiftCard()` (L941‑1252) — не менять внутреннюю логику свайпа/long-press/раскрытия, только то, как он попадает в DOM (оборачивается виртуализатором снаружи).
  - `RestorePlaceholder()` (L388‑416) — второй тип элемента списка (другая высота).
  - `HistoryPage()` (L1256‑1442), особенно: `filtered` (L1295‑1303), рендер списка (L1362‑1387), `phoneRef` через `useOutletContext<ShellContext>()` — **пока не импортирован в `HistoryPage()`**, сейчас используется только внутри `ShiftCard()` (L946); в `HistoryPage()` нужно получить тот же контекст на уровне страницы.
- `src/pages/AppShell.tsx` — `ShellContext` (L19‑23, `phoneRef: React.RefObject<HTMLDivElement | null>`), мобильная (L544‑553) и десктопная (L515‑517) разметка `<Outlet context={context} />` внутри `phoneRef`-контейнера — подтвердить, что `phoneRef.current` в момент рендера `HistoryPage` уже существует (актуально для `useLayoutEffect`/инициализации виртуализатора).
- `package.json` — секция `dependencies` (React 18.3.1, без вирт.-библиотек сейчас).

### Установить
- `npm install @tanstack/react-virtual` (актуальная версия, поддерживающая React 18) — единственная новая runtime-зависимость для этой задачи.

### Редактировать
- `src/pages/HistoryPage.tsx`:
  - В `HistoryPage()` получить `phoneRef` из `useOutletContext<ShellContext>()`.
  - Собрать единый массив элементов списка (перед рендером): для каждого `shift` из `filtered` — либо `{ type: "restore"; shift }`, либо `{ type: "card"; shift }` (сегодняшнее ветвление по `pendingDeletes[shift.id]`, L1369‑1385), плюс пустой массив/empty-state (L1362‑1367) обрабатывается как раньше — **отдельно от виртуализатора**, если список пуст, виртуализатор не монтируется вовсе (условный рендер: пусто → текущий блок «Смены не найдены», не пусто → виртуализированный контейнер).
  - Подключить `useVirtualizer({ count, getScrollElement: () => phoneRef.current, estimateSize: () => <примерная высота карточки>, measureElement, overscan: 4..6 })`.
  - Обёртка: внешний `<div style={{ position: "relative", height: totalSize }}>`, внутри — виртуальные элементы `<div style={{ position: "absolute", top, left:0, right:0, transform: translateY(...) }} ref={measureRef}>` (пейдинг между карточками — тот же `gap`, сейчас заданный `gap: 10` на родителе L1361, при абсолютном позиционировании перенести как отступ внутри каждого элемента, напр. `paddingBottom: 10`, чтобы визуальный интервал между карточками не изменился).
  - Внутри виртуального элемента рендерить как и сейчас `<ShiftCard .../>` или `<RestorePlaceholder .../>` без изменений их самих.
  - Итоговую карточку (L1389‑1411) и шапку/empty-state оставить как есть, вне виртуализированного блока.

### Риски / что проверить руками
- Свайп-удаление → переход карточки в `RestorePlaceholder` (другая высота) — `measureElement` должен подхватить новую высоту без «прыжка»/наложения соседних карточек; проверить визуально на реальном списке из 15+ смен.
- Long-press/контекст-меню координаты считаются от `document.getElementById("app-portal")` и `clientX/clientY` (viewport-относительные) — с виртуализацией не меняются, но перепроверить на реальном устройстве после внедрения.
- `MiniCalendar`/`FilterSheet`/`EditShiftSheet` не относятся к виртуализированному списку — не трогать.

---

## Задача 3. Мемоизация `filtered`/`totalVol`/`totalPay`/`totalPerPerson` (участники — уже мемоизированы)

### Контекст
`participantOptions` в `HistoryPage.tsx` **уже** обёрнут в `useMemo` (L1260‑1266, зависимости `[dicts, shifts]`) — трогать не нужно, только проверить корректность зависимостей при доработке Задачи 2 (не менять). Требуют мемоизации: `filtered` (L1295‑1303, пересчитывается на каждый рендер через `shifts.filter`), `activeFiltered` (L1305, зависит от `filtered`+`pendingDeletes`), `totalVol`/`totalPay`/`totalPerPerson` (L1307‑1309, три отдельных `.reduce` по `activeFiltered` при каждом рендере, включая повторные вызовы `shiftTotal()`/`perPerson()` на каждый шифт).

### Читать
- `src/pages/HistoryPage.tsx` — `shifts` (L1259, уже `useMemo`, образец для остальных), `participantOptions` (L1260‑1266), `dateRange`/`filterParticipants`/`pendingDeletes` состояния (L1268‑1279), `filtered` (L1295‑1303), `activeFiltered` (L1305), `totalVol`/`totalPay`/`totalPerPerson` (L1307‑1309), `shiftTotal()`/`perPerson()`/module-функции (L108‑117).

### Редактировать
- `src/pages/HistoryPage.tsx`:
  - `filtered` → `useMemo(() => shifts.filter(...), [shifts, dateRange.from, dateRange.to, filterParticipants])` (сравнивать `dateRange.from`/`dateRange.to` как примитивы, а не сам объект `dateRange`, — он новый объект при каждом `setDateRange`, что и так триггерит пересчёт корректно; **не** упускать `filterParticipants` в зависимостях).
  - `activeFiltered` → `useMemo(() => filtered.filter((s) => !pendingDeletes[s.id]), [filtered, pendingDeletes])`.
  - `totalVol`/`totalPay`/`totalPerPerson` → один `useMemo(() => { ... возвращает объект {totalVol, totalPay, totalPerPerson} ... }, [activeFiltered])` (три `.reduce` за один проход по `activeFiltered`, либо оставить тремя `.reduce`, но внутри одного `useMemo`, чтобы не считать три раза при каждом изменении **другого** состояния, не влияющего на список, — например при открытии `showCal`).
  - Не трогать сигнатуры `shiftTotal()`/`perPerson()`/`initials()`/`fmt()`/`fmtVol()` — используются и внутри `ShiftCard()`, менять их не нужно, только точки вызова на уровне `HistoryPage()`.

### Проверить
- После правки — открытие/закрытие календаря, фильтра, sheet редактирования не должны вызывать пересчёт `filtered`/итогов (React DevTools Profiler или простой `console.count` на время разработки, не оставлять в финальном коде).

---

## Задача 4. `sync.ts`: точечный патч стейта вместо `emit()` + полного refetch на каждую мелкую мутацию

### Контекст (важно понять перед правкой — самый связанный модуль проекта)

Сейчас `useShifts()`/`useDictionaries()` (`src/lib/sync.ts` L252‑280) при **любом** `emit()` полностью перечитывают IndexedDB (`listShifts()`/`getDictionaries()`, L227‑236/211‑220 в `src/lib/db.ts`). `emit()` вызывается из `setSnapshot()` (L190‑193), а её в свою очередь вызывает `refreshStatus()` (L195‑209) — которая дёргается после **каждой** мутации: `confirmShift()` (L383), `updateShift()` (L517), `removeShift()` (L539), `createTeammate()` (L486), плюс несколько раз внутри `syncNow()` (L1002, L1036). То есть один клик «Добавить строку»/«Сохранить смену» сейчас = минимум 1 полное чтение `shifts_cache` + 1 полное чтение `dictionaries_cache` из IndexedDB на **каждого** подписанного потребителя (`HomePage`, `HistoryPage`, `ProfilePage` — если открыты/смонтированы).

### Дизайн-решение

Развести два независимых канала обновления, оставив публичные хуки (`useShifts()`, `useDictionaries()`, `useSyncStatus()`) с тем же именем/сигнатурой/поведением снаружи — **страницы (`HomePage.tsx`/`HistoryPage.tsx`/`ProfilePage.tsx`/`AppShell.tsx`) не редактируются**, меняется только `sync.ts`:

1. **Канал статуса** (`SyncSnapshot`/`snapshot`/`listeners`/`subscribe`/`emit`/`setSnapshot`, L166‑230) — остаётся как есть, только для `useSyncStatus()`/`useSyncSnapshot()`/`peekSyncSnapshot()`. Дешёвый (`queueLength()` — один `count()` по маленькому стору), можно звать часто.
2. **Новый канал данных** — два отдельных модульных стора **внутри `sync.ts`** (не выносить в `db.ts`, там про диски, а не про рантайм-кэш в памяти):
   - `shiftsSnapshot: CachedShift[]` + свой `Set` слушателей `shiftListeners` + `subscribeShifts()`/`emitShifts()`.
   - `dictsSnapshot: Dictionaries | null` + свой `Set` слушателей `dictListeners` + `subscribeDicts()`/`emitDicts()`.
   - Инициализация: при первом вызове (ленивая, как сейчас `getDb()` в `db.ts` L111‑123) — один раз читают `listShifts()`/`getDictionaries()`, дальше живут только в памяти и обновляются точечно.
3. **Точечные патчи** вместо полного refetch:
   - `confirmShift()` (L290‑387): после `await putShift(shift)` — добавить новую смену в `shiftsSnapshot` (immutable: новый массив с добавленным элементом) и `emitShifts()`. Не вызывать общий `emit()` для данных (но `refreshStatus()`/`emit()` для статуса — оставить, как сейчас).
   - `updateShift()` (L493‑521): патч конкретного элемента по `id` в `shiftsSnapshot` (map → заменить совпавший, остальные — тот же референс).
   - `removeShift()` (L524‑542): убрать элемент по `id` из `shiftsSnapshot`.
   - `createTeammate()` (L459‑490): патч `dictsSnapshot.participants` (добавить/заменить один элемент), не всю структуру `Dictionaries` с диска.
   - `pushQueueItem()` при `create_teammate` (L811‑839) — там уже читается/пишется `dicts` через `getDictionaries()`/`putDictionaries()`; после `putDictionaries(...)` дополнительно обновить `dictsSnapshot` тем же точечным патчем участников (не через `emit()`).
4. **Полные операции синка** (`pullFromServer()` L555‑656, `pullShiftsFromServer()` L662‑784) — это законный «полный refetch», происходит один раз за цикл `syncNow()`, а не на каждую мелкую правку. Их поведение **не меняется по сути** — они продолжают писать в IndexedDB (`putDictionaries`/`putShift`/`deleteShiftFromDb`) как сейчас; единственное дополнение — в конце `pullFromServer()`/`pullShiftsFromServer()`/`syncNow()` один раз перечитать `listShifts()`/`getDictionaries()` целиком и разом заменить `shiftsSnapshot`/`dictsSnapshot` + `emitShifts()`/`emitDicts()` (то есть «полный refetch» остаётся, но **только тут**, не на каждый чих).
5. **Хуки** (L252‑280):
   - `useDictionaries()` → `useSyncExternalStore(subscribeDicts, () => dictsSnapshot, () => dictsSnapshot)` (плюс лениво инициировать первую загрузку, если `dictsSnapshot === null`, аналогично текущему `load()` в `useEffect`, но один раз глобально, не на каждый монтирующийся компонент — например через модульный флаг `dictsHydrated`).
   - `useShifts()` → аналогично `useSyncExternalStore(subscribeShifts, () => filteredForAuthor(shiftsSnapshot), ...)`, сохранив текущую фильтрацию по `currentAuthorId()` (L271‑272) — **важно**: фильтрация по автору должна остаться, просто источник данных — не `listShifts()` из IDB на каждый вызов, а `shiftsSnapshot` из памяти.
   - Возвращаемый тип/поведение для потребителей — идентичны сегодняшним (`CachedShift[]`/`Dictionaries | null`), поэтому `HomePage.tsx`/`HistoryPage.tsx`/`ProfilePage.tsx` не редактируются.

### Читать
- `src/lib/sync.ts` — целиком, в фокусе: `SyncSnapshot`/стор статуса (L166‑230), `useDictionaries()`/`useShifts()`/`useMarkingTypesMap()` (L252‑286), `confirmShift()` (L290‑387), `resolveShiftWrite()` (L403‑451), `createTeammate()` (L459‑490), `updateShift()` (L493‑521), `removeShift()` (L524‑542), `pullFromServer()` (L555‑656), `pullShiftsFromServer()` (L662‑784), `pushQueueItem()` (L786‑983, особенно ветка `create_teammate` L811‑839), `syncNow()` (L985‑1039), `initSync()` (L1042‑1057).
- `src/lib/db.ts` — `listShifts()`/`getShift()`/`putShift()`/`deleteShift()` (L218‑246), `getDictionaries()`/`putDictionaries()` (L202‑225) — контракт функций не меняется, `sync.ts` продолжает их вызывать для персиста на диск, добавляется только память-кэш поверх.
- Потребители (только прочитать сигнатуры вызова, не редактировать): `src/pages/HomePage.tsx`, `src/pages/HistoryPage.tsx` (L1257‑1258), `src/pages/ProfilePage.tsx` (L161‑162) — везде `useShifts()`/`useDictionaries()`/`useSyncStatus()` вызываются без аргументов, ожидаемый тип результата не меняется.

### Редактировать
- `src/lib/sync.ts` — только этот файл (см. дизайн-решение выше, пункты 1‑5).

### Не менять
- `src/lib/db.ts` (персист в IndexedDB не трогаем, только добавляем память-кэш поверх в `sync.ts`).
- `src/pages/*.tsx` (контракт хуков идентичен).

### Проверить
- Офлайн-сценарий: добавление смены без сети → `pendingSync`/бейдж «Не синхр.» продолжает работать (статус-канал не тронут).
- Быстрое повторное «Добавить строку»/«Сохранить» — не должно быть заметной задержки/скачка (сейчас потенциально заметно на слабом Android из-за полного `getAll()` на каждый клик).

---

## Задача 5. Убрать дублирование `<style>` с `@keyframes`/`@import` — один глобальный CSS-файл

### Контекст
Дубликаты (визуально идентичные правила, объявленные в нескольких местах — CSS keyframes глобальны независимо от того, где вставлен `<style>`, поэтому перенос в один файл ничего не меняет визуально, только убирает повторную вставку одинаковых правил в DOM при каждом монтировании компонента):

- `@import url('...fonts.googleapis...')` — уже есть **один раз** в `src/styles/fonts.css:1` (подключён через `index.css`), но **продублирован** ещё в `src/components/shared.tsx:181` (`GlobalStyles()`) и `src/pages/AppShell.tsx:496` (десктоп-ветка `AppShell()`) — обе копии избыточны, полностью удаляются.
- `* { box-sizing: border-box; }` + правила скроллбара + `input[type=number]` — продублированы в `GlobalStyles()` (`shared.tsx` L182‑191) и **отдельно повторены** инлайн в десктоп-ветке `AppShell()` (`src/pages/AppShell.tsx` L495‑505) — десктоп-ветка должна использовать компонент `<GlobalStyles />`, как уже делают `AuthPage.tsx`/`RegisterPage.tsx`/мобильная ветка `AppShell()`.
- `@keyframes fadeUp`/`spin` — уже в `GlobalStyles()` (`shared.tsx` L185‑186), но **повторно объявлены** в `src/pages/AppShell.tsx:498‑499` (десктоп) и `src/pages/HistoryPage.tsx:1191` (внутри `ShiftCard()`, при каждом раскрытии карточки).
- `@keyframes sheetUp` — определён **четыре раза** идентично: `src/pages/AppShell.tsx:206`, `src/pages/HistoryPage.tsx:262` (`FilterSheet`), `src/pages/HistoryPage.tsx:768` (`EditShiftSheet`), `src/pages/ProfilePage.tsx:62` (`LangSheet`) — плюс используется без локального объявления в `AboutSheet()` (`ProfilePage.tsx`, полагается на то, что `sheetUp` уже объявлен где-то ещё в DOM — сейчас работает случайно, из-за порядка монтирования; после переноса в глобальный файл будет работать гарантированно).
- `@keyframes fadeInBd` — дублируется в `src/pages/AppShell.tsx:206` и `src/pages/HomePage.tsx:1223`.
- `@keyframes slideUp` — только в `src/pages/HomePage.tsx:1224` (уникальный, просто переносится).
- `@keyframes authFadeUp` — дублируется в `src/pages/AuthPage.tsx:91` и `src/pages/RegisterPage.tsx:139`.

### Читать
- `src/components/shared.tsx` — `GlobalStyles()` (L178‑194) — станет источником правды по составу правил (расширяется, компонент не удаляется — он всё ещё нужен как явная точка подключения в `AuthPage`/`RegisterPage`/`AppShell`, см. ниже вариант А/Б).
- `src/styles/index.css`, `src/styles/fonts.css` — текущие 3 `@import`.
- Все файлы с находками из «Контекст» выше — точные строки уже указаны, менять только вычищением дублей, не логику компонентов.

### Дизайн-решение (что именно переносим и куда)

Вариант — **CSS-файл**, подключённый один раз в `index.css` (грузится один раз при старте приложения, не зависит от того, какие React-компоненты смонтированы, что и убирает сегодняшнюю случайную зависимость `AboutSheet` от `LangSheet`):

- Создать `src/styles/animations.css` со всеми уникальными `@keyframes` из списка выше (`navFadeIn`, `fadeUp`, `spin`, `sheetUp`, `fadeInBd`, `slideUp`, `authFadeUp`) + правилами `* { box-sizing: border-box; }`, `html, body, #root { height:100%; overscroll-behavior:none; }`, `::-webkit-scrollbar*`, `input[type=number]*` (весь текущий состав `GlobalStyles()`, L182‑191).
- Подключить в `src/styles/index.css` (`@import './animations.css';`).
- `GlobalStyles()` в `shared.tsx` — **упростить до no-op / удалить**: раз правила теперь всегда загружены глобально через `index.css`, компонент больше не обязателен. Чтобы не переписывать 3 места вызова (`AuthPage.tsx:47`, `RegisterPage.tsx:93`, `AppShell.tsx:541`) — либо (А) оставить `GlobalStyles()` как пустышку (`return null`) и убрать импорт из всех трёх файлов, либо (Б) удалить функцию и импорт/использование во всех трёх местах. Предпочтительно **(Б)** — меньше мёртвого кода, но потребует 3 точечных правки (см. «Редактировать»).

### Редактировать
- `src/styles/index.css` — добавить `@import './animations.css';`.
- `src/components/shared.tsx` — удалить функцию `GlobalStyles()` (L178‑194) и связанный неиспользуемый импорт, если после удаления что-то осталось неиспользуемым.
- `src/pages/AuthPage.tsx` — убрать импорт и вызов `<GlobalStyles />` (L4, L47), убрать локальный `@keyframes authFadeUp` (L91) — теперь он в `animations.css`.
- `src/pages/RegisterPage.tsx` — то же самое (L4, L93, L139).
- `src/pages/AppShell.tsx`:
  - Мобильная ветка — убрать импорт/вызов `<GlobalStyles />` (L5, L541), убрать локальный `@keyframes fadeInBd`/`sheetUp` в `QuickInputSheet()` (L206) — теперь глобальные.
  - Десктоп-ветка (`AppShell()`) — удалить весь инлайн `<style>` блок (L495‑505, `@import`+`* {}`+`@keyframes fadeUp/spin`+scrollbar+input) — он полностью избыточен после переноса в `animations.css` (глобальные стили действуют независимо от того, десктоп это или мобильная ветка).
- `src/pages/HistoryPage.tsx` — убрать локальные `<style>{...}</style>` с `@keyframes sheetUp` в `FilterSheet()` (L262) и `EditShiftSheet()` (L768), и `@keyframes fadeUp` в `ShiftCard()` (L1191).
- `src/pages/ProfilePage.tsx` — убрать локальный `<style>{...}</style>` с `@keyframes sheetUp` в `LangSheet()` (L62). (`AboutSheet()` уже не имел своего объявления — ничего убирать, продолжит работать, теперь гарантированно.)
- `src/pages/HomePage.tsx` — найти и убрать локальные `@keyframes fadeInBd`/`slideUp` (L1223‑1224, точная область — блок `<style>` в компоненте шторки/сайдбара, где они объявлены; при правке свериться с окружающим кодом, не менять сам JSX-разметку).

### Не менять
- Сам визуальный результат анимаций (тайминги/easing/направления) — переносятся **как есть**, byte-for-byte, только место объявления.
- Инлайн `style={{ animation: "sheetUp 0.28s ..." }}`/`transition: ...` на самих JSX-элементах — это использование анимаций, не объявление, остаётся без изменений.

### Проверить
- Все sheets/шторки (`QuickInputSheet`, `FilterSheet`, `EditShiftSheet`, `LangSheet`, `AboutSheet`, `MiniCalendar`) визуально анимируются как раньше (`sheetUp`/`fadeUp`/`fadeInBd`).
- `AuthPage`/`RegisterPage` — анимация появления формы (`authFadeUp`) не пропала.
- Desktop-сайдбар/шторки (`AppShell()` десктоп-ветка) — скроллбар/box-sizing/шрифт не изменились после удаления локального `<style>`.

---

## Порядок выполнения (рекомендация)

1. Задача 5 (глобальные стили) — чисто механическая, ничего не меняет по поведению, снижает риск конфликтов при последующих правках тех же файлов.
2. Задача 1 (настройка «Графика») — независима, использует уже причёсанные глобальные стили из Задачи 5 (создаёт свой `graphics-low.css` рядом с новым `animations.css`).
3. Задача 3 (мемоизация в `HistoryPage.tsx`) — небольшая, снижает риск конфликтов при Задаче 2.
4. Задача 2 (виртуализация Истории) — самая инвазивная зона `HistoryPage.tsx`, делать после Задачи 3, чтобы мемоизированные значения уже были на месте.
5. Задача 4 (`sync.ts` точечные патчи) — независима от 1‑3, но затрагивает самый связанный модуль проекта; делать последней и тестировать синк/офлайн-очередь отдельно от UI-правок.
6. `graphify update .`
7. Обновить `.cursor/rules/stack.mdc` (см. ниже — список разделов, которые нужно дополнить).

---

## Файлы, созданные/изменённые этим планом (сводка)

**Установить (npm):**
- `@tanstack/react-virtual` (Задача 2).

**Создать:**
- `src/lib/graphicsPreference.ts` (Задача 1).
- `src/styles/graphics-low.css` (Задача 1).
- `src/styles/animations.css` (Задача 5).

**Редактировать:**
- `src/main.tsx` (Задача 1 — применить сохранённую графику до рендера).
- `src/styles/index.css` (Задачи 1, 5 — два новых `@import`).
- `src/pages/ProfilePage.tsx` (Задача 1 — пункт «Графика» + `GraphicsSheet`; Задача 5 — убрать локальный `@keyframes sheetUp`).
- `src/pages/HistoryPage.tsx` (Задачи 2, 3, 5 — виртуализация, мемоизация, убрать локальные `@keyframes`).
- `src/lib/sync.ts` (Задача 4 — единственный файл для точечных патчей стора).
- `src/components/shared.tsx` (Задача 5 — удалить `GlobalStyles()`).
- `src/pages/AppShell.tsx` (Задача 5 — убрать дублирующие `<style>`/импорт `GlobalStyles`).
- `src/pages/AuthPage.tsx`, `src/pages/RegisterPage.tsx` (Задача 5 — убрать `GlobalStyles`/локальные keyframes).
- `src/pages/HomePage.tsx` (Задача 5 — убрать локальные `@keyframes fadeInBd`/`slideUp`).
- `.cursor/rules/stack.mdc` (после реализации — см. ниже).

**Не трогать без необходимости:**
- `src/lib/db.ts` (Задача 4 читает/использует как есть, контракт функций не меняется).
- `src/lib/markingValue.ts`, `schema.json` — не задействованы этим планом (изменений БД нет).

---

## Черновик правок `.cursor/rules/stack.mdc` (выполнить после реализации всех задач)

- Раздел **«Структура `src`»**: добавить `src/lib/graphicsPreference.ts` в список `lib/`, упомянуть `src/styles/animations.css` и `src/styles/graphics-low.css` в разделе про `styles/`.
- Раздел **«Дизайн-токены»** или новый подраздел **«Настройка графики (Профиль)»**: описать `data-graphics="high"|"low"` на `<html>`, что подавляется в «Низкая» (blur + длительность анимаций/transition), что не подавляется (сама логика свайпа/long-press — JS, не CSS), где хранится (`localStorage: calc_graphics_quality`), что применяется до первого рендера в `main.tsx`.
- Раздел **«История»**: дополнить строкой про виртуализацию списка (`@tanstack/react-virtual`, скролл — общий `phoneRef` из `ShellContext`, `measureElement` из-за переменной высоты карточек/`RestorePlaceholder`).
- Раздел **«Синхронизация»**: дополнить, что `useShifts()`/`useDictionaries()` теперь читают из модульного in-memory стора в `sync.ts` (не гоняют `listShifts()`/`getDictionaries()` из IndexedDB на каждую мелкую мутацию), полный refetch остаётся только в конце `pullFromServer()`/`pullShiftsFromServer()`.
- Обновить дату/пометку в начале файла, если там фиксируется «последнее обновление» (сверить текущий формат перед правкой).
