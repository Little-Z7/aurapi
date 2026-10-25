# aurapi — modification notice

aurapi is a **modified version** of [New API](https://github.com/QuantumNous/new-api)
(Copyright (C) 2023-2026 QuantumNous), distributed under the GNU Affero General
Public License v3.0 with the additional terms in `NOTICE`. This file is the
notice of modification required by AGPLv3 section 5(a) and section 7(c).

New API and its contributors are the authors of the original work. The
`LICENSE`, `NOTICE`, copyright headers, Go module path, and the "Frontend design
and development by New API contributors." attribution (with its link to
https://github.com/QuantumNous/new-api) are kept unchanged and visible in the
user interface.

## Source code (AGPLv3 section 13)

The complete corresponding source of every deployed aurapi build is published
here:

- Primary: https://github.com/Little-Z7/aurapi (public)
- Mirror: https://gitee.com/tangenzhe/aurapi (public)

The modified source lives on the `aurapi/main` branch.

Every deployed image is built from a git tag of that repository, and the
running instance links to that tag. If a deployed build does not match a
published tag, that is a bug; please report it.

## Upgrade model

- `aurapi/main` is a pinned upstream release tag plus a small series of themed
  patches. It does not track upstream `main`.
- Current base: `v1.0.0-rc.46` (`7d8b9126`).
- Upgrading: `git fetch upstream --tags`, then
  `git rebase --onto <new-tag> <old-tag> aurapi/main`, resolve conflicts patch
  by patch, run the test suites, and deploy to a test instance (migrate twice,
  smoke test) before the production instance.
- Patches are split by theme (docs, theme, shell, auth, ...) so a conflict in
  one area can be judged without touching the others.
- Branding (name, logo, footer, home page, about page) is delivered through New
  API's runtime settings (`SystemName`, `Logo`, `Footer`, `HomePageContent`,
  `About`), not by editing upstream branding in source.

## Change list

Keep this list current: add an entry in the same commit as the change.

| Area | Change | Files |
| --- | --- | --- |
| Docs | Added this notice | `AURAPI.md` |
| Theme | New `aura` color preset (warm paper canvas, soft-shadow cards, blue accent), made the default preset; other presets stay selectable | `web/src/styles/theme-presets.css`, `web/src/styles/index.css`, `web/src/lib/theme-customization.ts`, `web/src/context/theme-customization-provider.tsx`, locale files |
| Shell | Aura shell dimensions (3.5rem header, 14rem sidebar, nav item styling) scoped to the `aura` preset; default sidebar layout variant changed from `inset` to `sidebar` | `web/src/styles/theme-presets.css`, `web/src/context/layout-provider.tsx`, `web/src/components/layout/components/header.tsx` |
| Login | Custom OAuth provider with slug `aura` is the primary sign-in button; password sign-in collapsed behind "Administrator password sign-in"; sign-up link hidden when password registration is off (presentation only, auth flow unchanged) | `web/src/features/auth/sign-in/`, `web/src/features/auth/components/`, `web/src/features/auth/lib/aura-sign-in.ts`, locale files |
| Attribution | Project attribution line (with link to the original project) also shown at the bottom of the sign-in and sign-up pages, at full muted-text strength, so it stays visible when the home page is replaced by custom content | `web/src/features/auth/auth-layout.tsx`, `web/src/components/layout/components/footer.tsx` |
| Attribution | The NOTICE sentence "Frontend design and development by New API contributors." is shown verbatim (untranslated) inside the attribution line | `web/src/components/layout/components/footer.tsx` |
| Build | Optional `GOPROXY` build argument for build hosts without access to proxy.golang.org; unset keeps the default | `Dockerfile` |
