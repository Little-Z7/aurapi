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

Release tags are named `v<upstream base>-aurapi.<n>` (for example
`v1.0.0-rc.46-aurapi.1`). The tagged commit writes the same name into
`VERSION`, so `/api/status` reports the tag the image was built from.

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
| Billing | Image pricing expressions that use `image_count` can also read `resolution` (upper-cased), `aspect_ratio` and `input_reference_count` from the request (OpenRouter Images API fields). Ingress rejects non-string labels longer than 32 characters and non-array or over-`MaxImageN` `input_references`; reference payloads never enter the billing context | `relay/helper/billing_expr_request.go`, `relay/helper/valid_request.go`, `relay/helper/openai_image_request_test.go` |
| Release | `VERSION` holds the release tag in the repository (upstream fills it in CI), because the deploy host builds straight from the tagged source | `VERSION` |
| Relay | Pass-through image request bodies apply the channel's model mapping: the `model` field in the forwarded JSON body is rewritten to the mapped upstream model (sjson allocates a copy; the stored ingress body and its billing facts are untouched) | `relay/image_handler.go`, `relay/convert_request_error_test.go` |
| Pricing display | The frontend billing-expression parser and runtime support Expr's `??` operator. Expressions that pick a fixed per-call or per-image price from request parameters (`param`/`header`/`has` conditions, `tier(name, fixed(n))` leaves, optional `* image_count`) are shown as a price range, a default tier and a tier table instead of the raw expression; linear `_r0.._rN` reference-count chains collapse into one row with a per-reference step | `web/src/features/pricing/lib/param-tier-pricing.ts`, `web/src/features/pricing/lib/billing-expression/`, `web/src/features/pricing/lib/dynamic-price.ts`, `web/src/features/pricing/components/`, locale files |
| Relay | OpenAI-format chat, Responses, compaction and image responses (raw, typed and converted, stream and non-stream) no longer forward upstream cost disclosures: `usage.cost`, `usage.cost_details`, `usage.is_byok` and the internal `usage.billing_usage` snapshot (also under `response.usage`) are removed after billing has read usage | `relay/channel/openai/relay-openai.go`, `relay/channel/openai/image_stream_test.go` |
| Plugins | New built-in task plugin `maitoken`: Seedance 2.0, 2.0 Mini and 2.5 through the Mai Token gateway (`/v1/videos`), under the same model names as `doubao` so the token group picks the upstream. Usage facts are requested `seconds` and `resolution`; durations, resolutions, ratios, audio switch and reference mixes are validated before submission because the upstream charges unlisted values in full | `plugins/tasks/maitoken/plugin.js`, `plugins/builtin_plugins_test.go` |
| Plugins | New built-in task plugin `aura`: Seedance 2.0 / 2.0 Fast / 2.0 Mini / 2.5 text-to-video through the Aura open API (`/v1/videos/generations`) on its `super` channel, under the same model names as `doubao`. Usage facts are billed `seconds` (2.5 bills under 5 s as 5 s) and `resolution` (upscaled and native tiers); limits are validated before submission because Aura clamps unsupported values, a downgraded submission fails, and Aura's automatic retry is switched off per task. Downloads ask Aura for a fresh signed link each time | `plugins/tasks/aura/plugin.js`, `plugins/builtin_plugins_test.go` |
| i18n | Visitors who have not picked a language get Simplified Chinese instead of the browser language; the language in use is cached under `aurapi-language`, so languages the upstream build guessed into `i18nextLng` are not reused. A saved account language is applied at sign-in and when a session is restored after a reload; later refreshes for the same user keep the language picked in the tab. `<html lang>` follows the interface language | `web/src/i18n/config.ts`, `web/src/i18n/languages.ts`, `web/src/lib/auth-session.ts`, `web/src/i18n/languages.test.ts`, `web/src/lib/auth-session.test.ts` |
| Relay | Credentialed task content requests (built only by task plugins and limited to the channel base host and the plugin's `allowedHosts`) skip the fetch SSRF policy on the first hop, like the plugin's submit and poll requests; redirects are still SSRF-checked and credentialless requests are unchanged | `controller/video_proxy.go`, `controller/task_generic_test.go` |
