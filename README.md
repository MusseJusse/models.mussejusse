# Model catalog

A searchable AI model catalog built with Astro, React, and Tailwind CSS. The browser loads provider and model data from `https://models.dev/api.json`.

Use Node.js 22.12 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

`pnpm check` checks Astro and TypeScript, `pnpm test` tests catalog filtering and sorting, and `pnpm build` creates the static site in `dist/`. Use `pnpm preview` to inspect that build locally.

## Code layout

- `src/lib/models.ts` defines the catalog data, builds sort indexes, and filters models.
- `src/hooks/useModelData.ts` loads the catalog and owns search, filter, and sort state.
- `src/components/ModelExplorer.tsx` composes the page, search, filters, and status bar.
- `src/components/FilterPickers.tsx` contains the provider and release menus.
- `src/components/ModelTable.tsx` renders rows, sorting controls, and loading and error states.
- `src/styles/global.css` contains the layout and responsive styles.

The default provider selection is the available frontier labs. Results show at most 250 rows while the status bar counts all matches. Sort indexes are built once when data loads; filter changes scan those indexes without sorting again.
