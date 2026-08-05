# Graph Report - calc  (2026-08-03)

## Corpus Check
- 88 files · ~66,088 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 973 nodes · 1915 edges · 82 communities (45 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `45b2c79c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- IndexedDB Shift Cache
- PocketBase Sync Layer
- App Shell Routing
- shadcn Input Sheet
- Carousel React Deps
- Avatar Breadcrumb UI
- ESLint Package Config
- Deploy Docs Branding
- Badge Checkbox UI
- App TSConfig Paths
- Alert Dialog UI
- Command Palette UI
- Menubar UI Kit
- Context Menu UI
- Dropdown Menu UI
- Vite Node TSConfig
- Drawer UI Kit
- Select UI Kit
- Navigation Menu UI
- Radix Switch Tabs
- Apple Touch Icon
- PWA Icon 192
- Maskable Icon 192
- PWA Icon 512
- Maskable Icon 512
- Accordion UI
- Alert UI
- Popover UI
- Vite Env Types
- Portal Desktop Home
- Figma Asset Resolver
- clsx Utility
- date-fns Library
- idb Library
- lucide-react Icons
- pocketbase SDK
- Radix Accordion
- Radix Alert Dialog
- Radix Aspect Ratio
- Radix Avatar
- Radix Checkbox
- Radix Collapsible
- AppShell.tsx
- Radix Dialog
- Radix Dropdown
- Radix Hover Card
- Radix Label
- Radix Menubar
- Radix Nav Menu
- Radix Popover
- Radix Progress
- Radix Radio Group
- Radix Scroll Area
- Radix Select
- Radix Separator
- Radix Slider
- DesktopHomePage
- Radix Toggle
- Radix Toggle Group
- react-dom
- Resizable Panels
- react-router
- tailwind-merge
- Guidelines Placeholder
- @radix-ui/react-alert-dialog
- idb
- date-fns
- idb
- @tanstack/react-virtual
- @radix-ui/react-progress
- toggle-group.tsx
- PocketBase hook: ИИ-распознавание быстрого ввода
- select.tsx
- popover.tsx
- clsx

## God Nodes (most connected - your core abstractions)
1. `cn()` - 223 edges
2. `syncNow()` - 24 edges
3. `confirmShift()` - 20 edges
4. `compilerOptions` - 18 edges
5. `isPocketBaseConfigured()` - 17 edges
6. `react` - 16 edges
7. `markingTypesByNumberId()` - 16 edges
8. `getCurrentUserFullName()` - 15 edges
9. `pushQueueItem()` - 14 edges
10. `EditShiftSheet()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `calc` --semantically_similar_to--> `Учёт разметки`  [INFERRED] [semantically similar]
  README.md → index.html
- `PWA Offline Shell` --semantically_similar_to--> `PWA Meta Tags`  [INFERRED] [semantically similar]
  Tasks/TASKS_start.md → index.html
- `Figma Design Source` --semantically_similar_to--> `Figma Make Export`  [INFERRED] [semantically similar]
  README.md → ATTRIBUTIONS.md
- `VPS Git Deploy` --semantically_similar_to--> `rsync Deploy to /var/www/calc/dist`  [INFERRED] [semantically similar]
  Tasks/TASKS_start.md → .github/workflows/deploy.yml
- `Учёт разметки` --conceptually_related_to--> `robots.txt Disallow All`  [INFERRED]
  index.html → public/robots.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Offline Data Stack** — tasks_tasks_start_indexeddb, tasks_tasks_start_offline_sync, tasks_tasks_start_pocketbase, tasks_tasks_start_sync_ts, tasks_tasks_start_db_ts [EXTRACTED 1.00]
- **Shift Marking Schema** — tasks_tasks_start_shifts, tasks_tasks_start_shift_rows, tasks_tasks_start_locations, tasks_tasks_start_marking_numbers, tasks_tasks_start_marking_types, tasks_tasks_start_materials [EXTRACTED 1.00]
- **Production Deploy Pipeline** — github_workflows_deploy_cicd, github_workflows_deploy_rsync, tasks_tasks_start_nginx, tasks_tasks_start_vps_deploy, github_workflows_deploy_pocketbase_url [INFERRED 0.85]

## Communities (82 total, 37 thin omitted)

### Community 0 - "IndexedDB Shift Cache"
Cohesion: 0.05
Nodes (87): CachedShift, CalcDB, DEFAULT_DICTIONARIES, deleteShift(), dequeue(), Dictionaries, DictItem, enqueue() (+79 more)

### Community 1 - "PocketBase Sync Layer"
Cohesion: 0.07
Nodes (73): markingTypesByNumberId(), markingTypesMap(), putShift(), sortedMarkingNumbers(), markingNumberImageUrl(), getCurrentUserFullName(), looksLikePbId(), buildParticipantOptions() (+65 more)

### Community 2 - "App Shell Routing"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 3 - "shadcn Input Sheet"
Cohesion: 0.06
Nodes (39): Input(), Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay() (+31 more)

### Community 4 - "Carousel React Deps"
Cohesion: 0.10
Nodes (19): react, react, ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent() (+11 more)

### Community 5 - "Avatar Breadcrumb UI"
Cohesion: 0.07
Nodes (38): Avatar(), AvatarFallback(), AvatarImage(), Card(), CardAction(), CardContent(), CardDescription(), CardFooter() (+30 more)

### Community 6 - "ESLint Package Config"
Cohesion: 0.05
Nodes (39): eslint, @eslint/js, eslint-plugin-react-hooks, globals, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+31 more)

### Community 7 - "Deploy Docs Branding"
Cohesion: 0.06
Nodes (39): Figma Make Export, shadcn/ui, Unsplash, GitHub Actions Deploy Workflow, VITE_POCKETBASE_URL Production, rsync Deploy to /var/www/calc/dist, PWA Meta Tags, Brand Theme Color #FF6B00 (+31 more)

### Community 8 - "Badge Checkbox UI"
Cohesion: 0.09
Nodes (14): Badge(), badgeVariants, Checkbox(), HoverCardContent(), Progress(), ResizableHandle(), ResizablePanelGroup(), Switch() (+6 more)

### Community 9 - "App TSConfig Paths"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2022, src, src/app/components/ui, compilerOptions, allowImportingTsExtensions, baseUrl (+17 more)

### Community 10 - "Alert Dialog UI"
Cohesion: 0.07
Nodes (31): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+23 more)

### Community 11 - "Command Palette UI"
Cohesion: 0.12
Nodes (14): Command(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut(), Dialog() (+6 more)

### Community 12 - "Menubar UI Kit"
Cohesion: 0.13
Nodes (20): DEFAULT_MARKING_TYPE_BY_NUMBER, formatMarkingNumWithDescription(), HIDDEN_MARKING_NUMBERS, isMarkingNumberVisibleInPicker(), LOCATION_KEYWORDS, MARKING_NUM_ALIASES, MARKING_NUMBER_VARIANT_ALIASES, MARKING_NUMBERS_WITH_DESCRIPTION (+12 more)

### Community 13 - "Context Menu UI"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 14 - "Dropdown Menu UI"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 15 - "Vite Node TSConfig"
Cohesion: 0.13
Nodes (14): ES2023, vite.config.ts, compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection (+6 more)

### Community 16 - "Drawer UI Kit"
Cohesion: 0.11
Nodes (33): App(), RequireAuth(), router, clearUserScopedData(), ensureUserDataScope(), getPocketBaseUrl(), isPocketBaseConfigured(), pb (+25 more)

### Community 17 - "Select UI Kit"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 19 - "Radix Switch Tabs"
Cohesion: 0.18
Nodes (11): class-variance-authority, dependencies, class-variance-authority, @radix-ui/react-accordion, @radix-ui/react-avatar, @radix-ui/react-slot, react-router, @radix-ui/react-accordion (+3 more)

### Community 20 - "Apple Touch Icon"
Cohesion: 0.40
Nodes (6): Nested square brand mark, calc app visual identity, Orange background square, White center square, iOS Add to Home Screen icon, apple-touch-icon.png iOS home screen icon

### Community 21 - "PWA Icon 192"
Cohesion: 0.40
Nodes (6): Nested square brand mark, calc app visual identity, Black outer frame, Orange accent square, White center square, icon-192.png PWA app icon

### Community 22 - "Maskable Icon 192"
Cohesion: 0.47
Nodes (6): Orange-white nested square mark, calc app visual identity, Orange full-bleed background, White center square, icon-192-maskable.png maskable PWA icon, Maskable safe zone layout

### Community 23 - "PWA Icon 512"
Cohesion: 0.53
Nodes (5): Nested-square brand mark, Black outer field, Orange brand square, White inner square, PWA install / home-screen icon

### Community 24 - "Maskable Icon 512"
Cohesion: 0.47
Nodes (6): Centered white-on-orange mark, calc app visual identity, Orange full-bleed background, White center square, icon-512-maskable.png maskable PWA icon, Maskable safe zone layout

### Community 25 - "Accordion UI"
Cohesion: 0.22
Nodes (10): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItemContext, FormItemContextValue, FormLabel(), FormMessage() (+2 more)

### Community 26 - "Alert UI"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 27 - "Popover UI"
Cohesion: 0.09
Nodes (27): DateRange, MiniCalendar(), applyStoredGraphicsQuality(), applyToDom(), emit(), getGraphicsQuality(), GraphicsQuality, listeners (+19 more)

### Community 30 - "Portal Desktop Home"
Cohesion: 0.67
Nodes (3): #app-portal, DesktopHomePage, HomePcPage Dead Code

### Community 32 - "clsx Utility"
Cohesion: 0.23
Nodes (25): locationZone, applyMaterialDefault(), blankOut(), emptyNum(), emptyStr(), escapeRegExp(), field(), findKeyword() (+17 more)

### Community 34 - "idb Library"
Cohesion: 0.19
Nodes (19): AiDictionaryPayload, AiParseResult, buildAiDictionaryPayload(), buildRowFromNumber(), fieldNum(), fieldStr(), matchParticipantNames(), parseQuickInputWithAi() (+11 more)

### Community 40 - "Radix Avatar"
Cohesion: 0.25
Nodes (6): BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 43 - "AppShell.tsx"
Cohesion: 0.08
Nodes (21): BottomNav(), DesktopDropdown(), DropdownCard(), MarkingNumMeta, STATUS_CONFIG, StatusBadge(), SyncStatus, TABS (+13 more)

### Community 51 - "Radix Progress"
Cohesion: 0.05
Nodes (37): TASKS_graph — настройка «Графика» + производительность (виртуализация, memo, sync-стор, глобальные стили), Дизайн-решение, Дизайн-решение, Дизайн-решение, Дизайн-решение (что именно переносим и куда), Задача 1. Настройка «Графика»: Высокая / Низкая — в разделе Профиль, Задача 2. Виртуализация списка Истории (только видимые карточки), Задача 3. Мемоизация `filtered`/`totalVol`/`totalPay`/`totalPerPerson` (участники — уже мемоизированы) (+29 more)

### Community 56 - "Radix Slider"
Cohesion: 0.40
Nodes (3): AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 57 - "DesktopHomePage"
Cohesion: 0.67
Nodes (3): hasUnrecognizedFields(), looksLikeFreeformInput(), shouldUseAiFallback()

### Community 71 - "idb"
Cohesion: 0.12
Nodes (15): 4.1–4.6 Логика парсера (использует справочник из 4.7), 4.7 Файл-справочник ключевых слов (создаётся первым, остальные пункты на него ссылаются), TASKS_fast — быстрый ввод: клавиатура, ручная правка, мультистрока, парсер-справочник, справка, Блок 0. Общий контекст (читать перед началом, не редактировать), Задача 1. Отключить автооткрытие клавиатуры при открытии окна быстрого ввода, Задача 2. Ручная правка распознанных/нераспознанных полей + переключение кнопки «Добавить в таблицу» ↔ «Проверить», Задача 3. Множественный построчный ввод + редактирование нескольких карточек до подтверждения, Задача 4. Парсер по шаблону + редактируемый справочник ключевых слов (+7 more)

### Community 77 - "PocketBase hook: ИИ-распознавание быстрого ввода"
Cohesion: 0.33
Nodes (5): PocketBase hook: ИИ-распознавание быстрого ввода, Деплой на VPS, Логи на сервере, Поведение клиента, Стоимость (ориентир)

### Community 78 - "select.tsx"
Cohesion: 0.18
Nodes (7): SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

## Ambiguous Edges - Review These
- `Nginx SPA + PB Proxy` → `PB Path vs Subdomain Open Question`  [AMBIGUOUS]
  Tasks/TASKS_start.md · relation: conceptually_related_to

## Knowledge Gaps
- **246 isolated node(s):** `fix-nginx-sw-cache.sh script`, `name`, `private`, `version`, `type` (+241 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Nginx SPA + PB Proxy` and `PB Path vs Subdomain Open Question`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Avatar Breadcrumb UI` to `App Shell Routing`, `shadcn Input Sheet`, `Carousel React Deps`, `Badge Checkbox UI`, `Radix Avatar`, `Alert Dialog UI`, `Command Palette UI`, `Context Menu UI`, `Dropdown Menu UI`, `popover.tsx`, `select.tsx`, `Select UI Kit`, `Radix Slider`, `Accordion UI`, `Alert UI`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Radix Switch Tabs` to `Carousel React Deps`, `ESLint Package Config`, `Navigation Menu UI`, `lucide-react Icons`, `pocketbase SDK`, `Radix Accordion`, `Radix Alert Dialog`, `Radix Aspect Ratio`, `Radix Checkbox`, `Radix Collapsible`, `Radix Dialog`, `Radix Dropdown`, `Radix Hover Card`, `Radix Label`, `Radix Menubar`, `Radix Nav Menu`, `Radix Popover`, `Radix Radio Group`, `Radix Scroll Area`, `Radix Select`, `Radix Separator`, `Radix Toggle`, `Radix Toggle Group`, `react-dom`, `Resizable Panels`, `react-router`, `tailwind-merge`, `@radix-ui/react-alert-dialog`, `date-fns`, `idb`, `@tanstack/react-virtual`, `@radix-ui/react-progress`, `toggle-group.tsx`, `clsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `react` connect `Carousel React Deps` to `shadcn Input Sheet`, `Badge Checkbox UI`, `Alert Dialog UI`, `Radix Switch Tabs`, `Accordion UI`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **What connects `fix-nginx-sw-cache.sh script`, `name`, `private` to the rest of the system?**
  _246 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IndexedDB Shift Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.05347985347985348 - nodes in this community are weakly interconnected._
- **Should `PocketBase Sync Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.06613924050632912 - nodes in this community are weakly interconnected._