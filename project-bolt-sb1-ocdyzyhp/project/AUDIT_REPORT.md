# Application Audit Report

Scope: source, SQL migrations, local deployment metadata, and the current dependency lockfile. `.env` values were not inspected or copied. No application files were changed.

## A. Summary

- **Works:** TypeScript check passes; Vite production build succeeds. Authenticated navigation, bilingual labels, role-specific catalog reads, admin staff controls, RLS/grants, and loading/empty/error UI are present.
- **Does not work / is incomplete:** The app has no URL routing; catalog pages are read-only and vendors are absent from the UI; Home modules are placeholders. The demo-login component contains committed demo credentials. The edge function accepts requests from any origin, audit writes can fail silently, and dependency audit reports 14 vulnerable transitive packages.
- **Checks:** `npm run typecheck` passed with no diagnostics. `npm run lint` passed with **3 warnings, 0 errors** (`react-refresh/only-export-components` in `useAuth.tsx:56`, `useLanguage.tsx:36`, `useToast.tsx:70`). `npm run build` passed (1,662 modules). `npm audit` failed with **14 findings: 9 high, 4 moderate, 1 low, 0 critical**. No test script is defined in `package.json`.
- **Deployment:** The project has Vite configuration but no Vercel configuration, favicon asset, or PWA assets. Local function metadata says `admin-create-user.hasChanged: false`; it does not prove that the function is deployed or correctly configured in the live Supabase project.

## B. Bugs and errors

### Findings

| File and line | Severity | Finding | Suggested fix |
|---|---|---|---|
| [`src/components/auth/DemoLoginBox.tsx`](src/components/auth/DemoLoginBox.tsx#L13) | High | Demo account passwords, including an admin account, are embedded in client source and shipped to every browser. Hiding the box is not a security control. | Remove demo credentials from production builds; rotate/disable any matching accounts and use isolated, non-privileged demo data. |
| [`src/hooks/useAuth.tsx`](src/hooks/useAuth.tsx#L39) | Medium | A profile-fetch failure switches the UI to signed-out but does not clear the stored Supabase session. The “sign in again” state can therefore retain a session that failed to resolve. | Clear the session on profile-load failure (handling sign-out failure explicitly) or provide a retry state. |
| [`supabase/functions/admin-create-user/index.ts`](supabase/functions/admin-create-user/index.ts#L4) | Medium | CORS allows every origin and permits credential-bearing authorization headers. JWT and active-admin checks are present, but this broad cross-origin policy is unnecessary. | Restrict `Access-Control-Allow-Origin` to the production app origins; keep preflight methods/headers minimal. |
| [`supabase/functions/admin-create-user/index.ts`](supabase/functions/admin-create-user/index.ts#L26) | Medium | Input checks cover common cases but do not first validate the JSON body/property types or enforce field-length limits. Malformed or oversized input can reach exceptions or expensive Auth/database operations. | Validate object shape, string types, maximum lengths, and content type before processing; return consistent 4xx responses. |
| [`supabase/functions/admin-create-user/index.ts`](supabase/functions/admin-create-user/index.ts#L99) | Medium | The `audit_log` insert result is ignored; the function can report successful user creation without its required audit entry. The compensating Auth-user deletion result on profile-insert failure is also ignored (`:95`). | Treat audit-write failure as an explicit operational error and reliably reconcile/roll back partial account creation. |
| [`supabase/migrations/20261101024123_create_catalog_raw_materials_vendors_seed.sql`](supabase/migrations/20261101024123_create_catalog_raw_materials_vendors_seed.sql#L145) | Low | Read policies do not filter `is_active`; the UI filters active rows, but authorized users can directly query inactive products/raw materials/vendors through Supabase. | Add `is_active` to SELECT policies if inactive records must be hidden; otherwise document that deactivation only hides records in the UI. |
| [`src/components/ui/Modal.tsx`](src/components/ui/Modal.tsx#L19) and [`src/components/ui/Field.tsx`](src/components/ui/Field.tsx#L47) | Medium | Dialogs close on Escape but do not trap/restore focus; select-field errors are not linked with `aria-describedby`. These weaken keyboard and screen-reader access. | Add focus management/trapping and error descriptions for select controls; test keyboard-only and screen-reader flows. |
| [`index.html`](index.html#L5) | Low | The favicon points to `/vite.svg`, which is not present. Open Graph and Twitter images still point to Bolt’s default image (`:16`, `:18`). | Add a project favicon and replace social preview metadata with branded assets. |
| [`src/services/userService.ts`](src/services/userService.ts#L63) | Low | Audit pagination sorts only by timestamp; entries sharing a timestamp can shift between offset pages, causing omissions or duplicates. | Add a stable secondary sort (for example, entry ID) and use a stable cursor if the log grows. |

### Page, component, service, and hook inventory

| File | Works | Broken or missing |
|---|---|---|
| [`src/pages/LoginPage.tsx`](src/pages/LoginPage.tsx) | Email/password sign-in, validation, password visibility, localized feedback, optional demo box. | Demo lookup failure is silently treated as “hidden”; no reset-password flow. |
| [`src/pages/HomePage.tsx`](src/pages/HomePage.tsx) | Shows profile/role and role-specific modules; admin quick links work. | Every business module is marked “Coming soon”; no operational dashboard or summary data. |
| [`src/pages/CatalogPage.tsx`](src/pages/CatalogPage.tsx) | Loads products/raw stock by role; tabs, skeletons, empty state, retry, and price visibility are implemented. | Read-only; no vendors tab/list, search/filter, or mutation controls. |
| [`src/pages/SettingsPage.tsx`](src/pages/SettingsPage.tsx) | Combines demo-login setting and staff management. | Only account/demo settings exist; no catalog settings. |
| [`src/pages/AuditPage.tsx`](src/pages/AuditPage.tsx) | Admin audit list, localized known actions, retry and pagination. | Does not display reason/entity/old-new values generally; unknown actions lose detail; offset ordering is unstable. |
| [`src/components/auth/DemoLoginBox.tsx`](src/components/auth/DemoLoginBox.tsx) | Clear account selection UI. | Ships hardcoded demo credentials (see security finding). |
| [`src/components/catalog/CatalogSections.tsx`](src/components/catalog/CatalogSections.tsx) | Responsive stock cards, low-stock indicators, grouped products, role-controlled prices/costs. | No vendor section; category/product labels come from seed text and remain English. |
| [`src/components/layout/AppHeader.tsx`](src/components/layout/AppHeader.tsx) | Responsive header, language toggle, sign-out control. | No dedicated active-session/network status. |
| [`src/components/layout/Navigation.tsx`](src/components/layout/Navigation.tsx) | Role-aware desktop sidebar and mobile bottom navigation. | State-only navigation is not bookmarkable/shareable; nav labels are generic “Home” landmarks. |
| [`src/components/layout/SignedInApp.tsx`](src/components/layout/SignedInApp.tsx) | Keeps non-admin pages out of navigation and selects the allowed page. | No router/deep links; direct URL navigation cannot select a page. |
| [`src/components/settings/CreateStaffModal.tsx`](src/components/settings/CreateStaffModal.tsx) | Validates common staff fields and submits through the edge function. | No server-side maximum field lengths or password policy beyond minimum length. |
| [`src/components/settings/DemoLoginSetting.tsx`](src/components/settings/DemoLoginSetting.tsx) | Admin toggle loads/saves the public visibility flag with feedback. | Hiding the flag does not disable/remove credentials embedded in the bundle. |
| [`src/components/settings/StaffAccountsSection.tsx`](src/components/settings/StaffAccountsSection.tsx) | Loads staff, supports retry/empty state, opens management modals. | Errors are generic; no pagination/search. |
| [`src/components/settings/StaffActionModals.tsx`](src/components/settings/StaffActionModals.tsx) | Role and activation changes call protected RPCs and refresh. | Generic failure messages; modal accessibility limitations apply. |
| [`src/components/settings/StaffRow.tsx`](src/components/settings/StaffRow.tsx) | Shows staff status/role and prevents self-actions in UI. | Authorization still correctly depends on server/RLS; no email is shown, so staff lookup is limited. |
| [`src/components/ui/Button.tsx`](src/components/ui/Button.tsx) | Reusable variants, disabled/loading behavior, focus-visible styling. | Spinner has no separate live status announcement. |
| [`src/components/ui/Feedback.tsx`](src/components/ui/Feedback.tsx) | Reusable badges, empty state and skeleton. | Skeleton is hidden from assistive technology and does not announce loading. |
| [`src/components/ui/Field.tsx`](src/components/ui/Field.tsx) | Labels, invalid state and text-input error descriptions. | Select errors lack `aria-describedby`; required status is not consistently surfaced. |
| [`src/components/ui/Modal.tsx`](src/components/ui/Modal.tsx) | Dialog semantics, close button, Escape support, mobile layout. | No focus trap/restore or backdrop-dismiss behavior. |
| [`src/components/ui/PageHeader.tsx`](src/components/ui/PageHeader.tsx) | Reusable responsive page heading. | No independent issue found. |
| [`src/hooks/useAuth.tsx`](src/hooks/useAuth.tsx) | Resolves active profiles on auth events; rejects inactive/missing profiles; sign-out is exposed. | Load failure leaves the auth session stored; asynchronous auth-event resolution has no stale-request guard. |
| [`src/hooks/useLanguage.tsx`](src/hooks/useLanguage.tsx) | Persists Hindi/English selection and updates document language. | Local-storage access is unguarded if browser storage is unavailable. |
| [`src/hooks/useToast.tsx`](src/hooks/useToast.tsx) | Shared timed success/error notifications with live-region semantics. | Success and error share a polite live region; rapid notifications can accumulate. |
| [`src/services/authService.ts`](src/services/authService.ts) | Auth sign-in/out, own profile, and demo flag reads. | Profile is asserted to `Profile` without runtime shape validation. |
| [`src/services/catalogService.ts`](src/services/catalogService.ts) | Read-only product/raw queries select correct columns or stock-only RPCs. | No create/update/deactivate functions or vendor service. |
| [`src/services/userService.ts`](src/services/userService.ts) | Staff list/create/role/status, demo flag, and audit reads use Supabase. | No catalog/vendor operations; edge-function partial-success logging issue is outside this service. |

Core support files reviewed: [`src/lib/i18n.ts`](src/lib/i18n.ts) has both `en` and `hi` values for every typed key (no missing-key gap); some product/category seed content and technical terminology remain English. [`src/lib/roles.ts`](src/lib/roles.ts), [`src/types/index.ts`](src/types/index.ts), [`src/lib/format.ts`](src/lib/format.ts), [`src/lib/cn.ts`](src/lib/cn.ts), [`src/lib/supabase.ts`](src/lib/supabase.ts), [`src/App.tsx`](src/App.tsx), and [`src/main.tsx`](src/main.tsx) are small and internally consistent. Responsive Tailwind layouts and mobile navigation exist; a full viewport/device and assistive-technology test was not run.

### Role access versus RLS/grants

| Role | UI access | Database policy/grant result |
|---|---|---|
| Admin | Home, catalog, settings, audit; catalog only reads. | Can read/write products and raw materials; can read/write vendors; can read audit/settings; staff changes use admin RPC/edge checks. Matches intended UI, but UI does not expose catalog/vendor writes. |
| Purchase | Home and catalog; products with prices, raw material costs. | Can read products and raw materials; can read/insert/update vendors; cannot write products/raw materials or read audit/settings. Catalog reads match; vendor write capability is unused by UI. |
| Store | Home and catalog; stock-only product/raw lists. | No table grants for products/raw materials; authenticated stock RPCs return active stock only and omit price/cost. Matches UI. |
| Sales | Home and catalog; product prices, stock-only raw materials. | Can read products; cannot read raw-material table and uses stock-only RPC; cannot read/write vendors, settings, or audit. Matches UI. |

The admin-only settings/audit UI is backed by admin-only policies. `current_app_role()` returns no role for inactive users and the security-definer stock RPCs require an active profile. No privilege escalation path was identified in the reviewed SQL/functions. One reverse mismatch is that direct SELECT policies expose inactive catalog rows to otherwise authorized roles while the UI filters them.

## C. Security findings

| Severity | Finding | Fix |
|---|---|---|
| High | Demo credentials, including admin credentials, are shipped in [`src/components/auth/DemoLoginBox.tsx`](src/components/auth/DemoLoginBox.tsx#L13). The public visibility flag only hides UI; it cannot protect credentials in the bundle. | Remove from production source/build; rotate or disable any corresponding accounts; provision isolated demo users only in non-production. |
| Medium | Wildcard CORS in [`supabase/functions/admin-create-user/index.ts`](supabase/functions/admin-create-user/index.ts#L4). The function does verify JWT and active admin status, so this is not by itself an authentication bypass. | Allowlist trusted origins. |
| Medium | Insufficient input shape/length validation in the staff-creation edge function (`:26`); malformed input may become a 500. | Strict schema validation and length caps at the server boundary. |
| Medium | Staff creation ignores audit insert errors (`:99`) and rollback deletion errors (`:95`), allowing unrecorded or partially provisioned state. | Make audit persistence and rollback/reconciliation observable and reliable. |
| Medium | Audit coverage is incomplete: only account create/role/status and product price updates are recorded. Catalog inserts/deactivations, raw-material edits, vendor changes, and demo-setting changes are not audited. | Add audit events/triggers or transactional RPCs for these mutations; do not rely on client-only logging. |
| Low | Inactive catalog records are not filtered by RLS; UI filtering is not a security boundary. | Decide whether inactive data must be hidden and enforce consistently in policies/RPCs. |
| Informational | `.env` is ignored by `.gitignore` and is not tracked; the client reads only the expected `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` names. No service-role key reference was found in client source. `.env` values were not inspected. A Vite `VITE_` variable is public to browsers; the anon key must rely on RLS, never be treated as secret. | Keep service-role credentials only in server/edge secrets; check live Vercel/Supabase settings separately. |

### Dependency audit

All 14 vulnerable packages are **transitive**; no direct dependency is reported vulnerable. `npm audit` marks a fix as available for each (`fixAvailable: true`); resolve with reviewed, lockfile-only/semver-compatible upgrades and rerun checks. No fixes were applied.

| Severity | Vulnerable package(s) |
|---|---|
| High (9) | `brace-expansion`, `browserslist`, `cross-spawn`, `flatted`, `glob`, `js-yaml`, `minimatch`, `picomatch`, `ws` |
| Moderate (4) | `@humanfs/node`, `ajv`, `postcss-selector-parser`, `yaml` |
| Low (1) | `@eslint/plugin-kit` |

Reported issue classes include ReDoS/CPU or memory exhaustion, prototype pollution, command injection in the `glob` CLI, and uninitialized-memory disclosure in `ws`. Most are in build/lint tooling dependency paths; verify each dependency path and deployment exposure before prioritizing beyond the high-severity fixes.

## D. Missing features

### P1 — Must-have

1. **Catalog master-data CRUD:** Add, edit, and deactivate products, raw materials, and vendors. Existing SQL tables and grants support this; `is_active=false` is the deactivation mechanism and there is no DELETE grant.
   - Add typed create/update payloads and list/create/update functions in `src/services/catalogService.ts` (or a catalog-specific vendor service).
   - Add product, raw-material, and vendor forms/modals and connect them to Catalog. Include a vendors view/tab; no vendor list or vendor types are currently in the UI.
   - Validate required text, SKU/code formats and uniqueness, positive pack size, nonnegative prices/stock/thresholds, allowed units/types, 10-digit phone, UPI format if supplied, and vendor supply selection. Mirror database constraints and return field-level errors.
   - Gate product/raw create-edit-deactivate controls to admins; vendor controls to admin and purchase. Current RLS/grants already match these permissions, so **no policy change is required** for intended writes. Add audit coverage for all mutations. Consider SELECT policy changes for inactive rows (see B/C).
2. Remove/rotate demo credentials and restrict edge-function CORS.
3. Address the high-severity dependency findings; verify lockfile changes and rerun typecheck, lint, build, and audit.
4. Verify production Auth redirect/site URL and edge-function deployment/secrets in Supabase; confirm Vercel environment variable names/values through the dashboard without exposing them.

### P2 — Should-have

- Add URL routing and configure Vercel SPA fallback before enabling deep links.
- Add branded favicon and social preview assets; remove Bolt/Vite starter metadata.
- Improve audit completeness, stable pagination, and actionable error detail.
- Improve modal focus management, select error announcements, loading announcements, and keyboard/screen-reader checks.
- Complete domain Hindi translations, especially seed product/category/descriptive text and operational terminology.
- Add explicit loading/error/empty states for Settings data and retry session/profile resolution.
- Add a real dashboard instead of “Coming soon” placeholders.

### P3 — Nice-to-have

- PWA manifest/service worker and install/offline behavior, only if operational needs justify them.
- Search/filter, pagination, and CSV export for catalog/staff/audit data.
- Charts and configurable dashboard widgets.

## E. Dehydration-business enhancements

- **Batch/yield tracking:** connect raw-material lots to production batches; record input weight, drying conditions, start/end timestamps, output weight, yield %, wastage, operator, and equipment.
- **Stock movements:** append-only receipts, production consumption/output, sales, adjustments, returns, and transfers; derive balances instead of editing stock totals directly.
- **Low-stock alerts:** configurable thresholds for raw and finished stock with in-app alerts and optional email/WhatsApp notifications.
- **Orders and GST invoices:** customer/order records, line items, tax rates, invoice numbering, payment status, credit notes, and printable GST-compliant invoices; validate requirements with an accountant.
- **Vendor payments:** purchase receipts linked to vendors, payable balances, payment dates/methods, and reconciliation.
- **Dashboard and exports:** sales/procurement/production/yield charts, aging/payables, stock valuation, and CSV exports with role-aware field access.

## F. Ordered fix plan

1. Remove demo credentials from production code/build; disable/rotate any matching accounts and confirm demo behavior is safe.
2. Restrict edge-function CORS, validate request shape/lengths, and make account creation/audit/rollback failures explicit and reconcilable.
3. Review the 14 vulnerable transitive packages; update compatible versions/lockfile without `npm audit fix` blind changes, then rerun the three checks and `npm audit`.
4. Add catalog types and service functions, then test admin product/raw CRUD and admin/purchase vendor CRUD against the existing RLS policies.
5. Add role-gated Add/Edit/Deactivate forms and vendor UI; validate schema constraints and add audit coverage. Decide and enforce inactive-row read policy consistently.
6. Add routing and Vercel fallback, branded metadata/favicon, then validate direct route refresh and sharing.
7. Improve dialog/form accessibility, error/retry states, localization, and stable audit pagination.
8. Implement business workflows incrementally: stock movements and lot tracking, production/yield, procurement/vendor payments, orders/GST invoices, then alerts/charts/exports.
9. Before release, verify Supabase Auth URL settings, deployed edge-function version and server-side secrets, Vercel environment configuration, and production behavior for each role.
