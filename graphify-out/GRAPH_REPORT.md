# Graph Report - calc  (2026-07-23)

## Corpus Check
- 78 files · ~49,336 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 778 nodes · 1494 edges · 72 communities (36 shown, 36 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `20445e18`
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
- Radix Context Menu
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
- Radix Slot
- Radix Toggle
- Radix Toggle Group
- react-dom
- Resizable Panels
- react-router
- tailwind-merge
- Guidelines Placeholder
- @radix-ui/react-alert-dialog
- idb

## God Nodes (most connected - your core abstractions)
1. `cn()` - 223 edges
2. `syncNow()` - 23 edges
3. `compilerOptions` - 18 edges
4. `confirmShift()` - 17 edges
5. `react` - 16 edges
6. `isPocketBaseConfigured()` - 14 edges
7. `pushQueueItem()` - 14 edges
8. `getDb()` - 13 edges
9. `getCurrentUserFullName()` - 13 edges
10. `updateShift()` - 13 edges

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

## Communities (72 total, 36 thin omitted)

### Community 0 - "IndexedDB Shift Cache"
Cohesion: 0.05
Nodes (100): App(), RequireAuth(), router, GlobalStyles(), CachedShift, CalcDB, clearUserScopedData(), deleteShift() (+92 more)

### Community 1 - "PocketBase Sync Layer"
Cohesion: 0.07
Nodes (50): BottomNav(), STATUS_CONFIG, StatusBadge(), SyncStatus, TABS, DEFAULT_DICTIONARIES, buildParticipantOptions(), isShiftRowComplete() (+42 more)

### Community 2 - "App Shell Routing"
Cohesion: 0.20
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 3 - "shadcn Input Sheet"
Cohesion: 0.06
Nodes (39): Input(), Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay() (+31 more)

### Community 4 - "Carousel React Deps"
Cohesion: 0.10
Nodes (19): react, react, ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent() (+11 more)

### Community 5 - "Avatar Breadcrumb UI"
Cohesion: 0.08
Nodes (36): AccordionContent(), AccordionItem(), AccordionTrigger(), Avatar(), AvatarFallback(), AvatarImage(), BreadcrumbEllipsis(), BreadcrumbItem() (+28 more)

### Community 6 - "ESLint Package Config"
Cohesion: 0.05
Nodes (39): eslint, @eslint/js, eslint-plugin-react-hooks, globals, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+31 more)

### Community 7 - "Deploy Docs Branding"
Cohesion: 0.06
Nodes (39): Figma Make Export, shadcn/ui, Unsplash, GitHub Actions Deploy Workflow, VITE_POCKETBASE_URL Production, rsync Deploy to /var/www/calc/dist, PWA Meta Tags, Brand Theme Color #FF6B00 (+31 more)

### Community 8 - "Badge Checkbox UI"
Cohesion: 0.08
Nodes (11): Badge(), badgeVariants, Checkbox(), HoverCardContent(), Label(), PopoverContent(), Progress(), ResizableHandle() (+3 more)

### Community 9 - "App TSConfig Paths"
Cohesion: 0.08
Nodes (25): DOM, DOM.Iterable, ES2022, src, src/app/components/ui, compilerOptions, allowImportingTsExtensions, baseUrl (+17 more)

### Community 10 - "Alert Dialog UI"
Cohesion: 0.10
Nodes (18): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+10 more)

### Community 11 - "Command Palette UI"
Cohesion: 0.12
Nodes (14): Command(), CommandGroup(), CommandInput(), CommandItem(), CommandList(), CommandSeparator(), CommandShortcut(), Dialog() (+6 more)

### Community 12 - "Menubar UI Kit"
Cohesion: 0.12
Nodes (11): Menubar(), MenubarCheckboxItem(), MenubarContent(), MenubarItem(), MenubarLabel(), MenubarRadioItem(), MenubarSeparator(), MenubarShortcut() (+3 more)

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
Cohesion: 0.08
Nodes (37): MarkingNumberItem, MarkingTypeItem, markingTypesByNumberId(), markingTypesMap(), sortedMarkingNumbers(), draftRowMetrics(), finitePositive(), locationZone (+29 more)

### Community 17 - "Select UI Kit"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 18 - "Navigation Menu UI"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 19 - "Radix Switch Tabs"
Cohesion: 0.22
Nodes (9): class-variance-authority, date-fns, dependencies, class-variance-authority, date-fns, @radix-ui/react-switch, @radix-ui/react-tooltip, @radix-ui/react-switch (+1 more)

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
Cohesion: 0.25
Nodes (9): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItemContext, FormItemContextValue, FormLabel(), FormMessage() (+1 more)

### Community 26 - "Alert UI"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 27 - "Popover UI"
Cohesion: 0.43
Nodes (5): ToggleGroup(), ToggleGroupContext, ToggleGroupItem(), Toggle(), toggleVariants

### Community 30 - "Portal Desktop Home"
Cohesion: 0.67
Nodes (3): #app-portal, DesktopHomePage, HomePcPage Dead Code

### Community 34 - "idb Library"
Cohesion: 0.18
Nodes (7): SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

## Ambiguous Edges - Review These
- `Nginx SPA + PB Proxy` → `PB Path vs Subdomain Open Question`  [AMBIGUOUS]
  Tasks/TASKS_start.md · relation: conceptually_related_to

## Knowledge Gaps
- **178 isolated node(s):** `fix-nginx-sw-cache.sh script`, `name`, `private`, `version`, `type` (+173 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Nginx SPA + PB Proxy` and `PB Path vs Subdomain Open Question`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `cn()` connect `Avatar Breadcrumb UI` to `App Shell Routing`, `shadcn Input Sheet`, `Carousel React Deps`, `idb Library`, `Badge Checkbox UI`, `Alert Dialog UI`, `Command Palette UI`, `Menubar UI Kit`, `Context Menu UI`, `Dropdown Menu UI`, `Select UI Kit`, `Navigation Menu UI`, `Accordion UI`, `Alert UI`, `Popover UI`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Radix Switch Tabs` to `Carousel React Deps`, `ESLint Package Config`, `clsx Utility`, `lucide-react Icons`, `pocketbase SDK`, `Radix Accordion`, `Radix Alert Dialog`, `Radix Aspect Ratio`, `Radix Avatar`, `Radix Checkbox`, `Radix Collapsible`, `Radix Context Menu`, `Radix Dialog`, `Radix Dropdown`, `Radix Hover Card`, `Radix Label`, `Radix Menubar`, `Radix Nav Menu`, `Radix Popover`, `Radix Progress`, `Radix Radio Group`, `Radix Scroll Area`, `Radix Select`, `Radix Separator`, `Radix Slider`, `Radix Slot`, `Radix Toggle`, `Radix Toggle Group`, `react-dom`, `Resizable Panels`, `react-router`, `tailwind-merge`, `@radix-ui/react-alert-dialog`, `idb`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `react` connect `Carousel React Deps` to `App Shell Routing`, `shadcn Input Sheet`, `Radix Switch Tabs`, `Accordion UI`, `Popover UI`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **What connects `fix-nginx-sw-cache.sh script`, `name`, `private` to the rest of the system?**
  _178 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IndexedDB Shift Cache` be split into smaller, more focused modules?**
  _Cohesion score 0.05217391304347826 - nodes in this community are weakly interconnected._
- **Should `PocketBase Sync Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._