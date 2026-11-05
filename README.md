# SEO Automation Dashboard

Automated website SEO audits. An admin starts an audit, or a monthly schedule does. A background job crawls the site, collects signals, asks Claude for a structured report, saves it, makes a PDF and delivers it. The client signs in to read their own report.

**Live app:** Added when deployed

## Test logins

Passwords aren't stored in this public repository. They come with the submission email.

| Role | Email |
|---|---|
| Admin | admin@demo.test |
| Client: Example Dental Clinic | client@demo.test |
| Client: Demo Client | client2@demo.test |
| Client: Overdue Dental | client3@demo.test |

Clients share one password in this demo.

## How it works

```
Admin clicks Run audit, or the monthly schedule fires
        |
POST /api/audit creates the Audit row, adds a job to seo-audit-jobs, replies 202 at once
        |
Runner takes the job and runs the steps in the spec's order:
  1 crawl   2 PageSpeed*   3 Search Console*   4 Schema.org check
  5 on-page analysis   6 robots.txt and sitemap   7 DataForSEO*
  8 Claude analysis   9 save to Postgres   10 PDF   11 WhatsApp* and email*
        |
The admin page polls GET /api/audit/[id] every 2 seconds and shows each step
```

`*` means mocked, as the assessment asks.

| Part | Technology |
|---|---|
| Portals and API | Next.js 14 App Router, Tailwind CSS, shadcn/ui, JavaScript |
| Queue | BullMQ on Upstash Redis, queue `seo-audit-jobs` |
| Database | Prisma 6 on Neon Postgres |
| AI | Anthropic SDK with structured outputs, `claude-sonnet-4-6` |
| Crawl | Node HTTP with SSRF guards, parsed by Cheerio |
| PDF | Puppeteer, with `@sparticuz/chromium` on Vercel |
| Hosting | Vercel, with cron-job.org calling the cron route every minute |

### Where the worker runs

Production runs one job per call inside a Vercel function. `POST /api/audit` starts it at once with `waitUntil`, and the cron route is the safety net. Every route still replies quickly. `worker/index.js` is the long-running BullMQ worker, for local use or a separate host. Both call the same pipeline code.

This was chosen because an idle BullMQ worker polls Redis continuously and Upstash's free plan averages about 11.6 commands a minute, and no dependable free always-on host was found. The assessment's 10-second figure for Vercel Hobby is out of date: Vercel's documentation now gives 300 seconds.

## Real and mocked integrations

One flag, `USE_MOCKS`, controls all mock behaviour.

| Integration | With `USE_MOCKS=true` |
|---|---|
| Postgres, Redis, cron-job.org | Real |
| Claude | Real if `ANTHROPIC_API_KEY` is set, otherwise a labelled sample analysis |
| PageSpeed, Search Console, DataForSEO | Mock files, exactly as supplied |
| WhatsApp | Mock file, exactly as supplied, logs to the console |
| Email, report storage | Added mocks in the same style |

The app labels sample data and sample analysis wherever they appear, including the PDF.

**Using real keys:** set `USE_MOCKS=false`, then fill in the real branch of `src/crawlers/pagespeed.js`, `gsc.js`, `dataforseo.js`, `src/delivery/whatsapp.js`, `email.js` and `src/reports/storage.js`. Until then, each throws a clear "not configured" error.

## Run it locally

You need Node 24 and free Neon and Upstash databases.

```bash
npm ci
```

Copy `.env.example` to `.env` and fill it in. Passwords go in as base64-encoded bcrypt hashes, because bcrypt hashes contain `$`, which Next.js would try to expand.

```bash
npx prisma db push
```

```bash
npm run db:seed
```

```bash
npm run build
```

```bash
npm start
```

Locally, set `CHROME_EXECUTABLE_PATH` to your installed Chrome so PDFs can render. `npm start` and `npm run dev` listen on 127.0.0.1 only.

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

`npm test` runs without a network or any cost, and real Chrome is used for the renderer tests when it is installed. `npm run test:e2e` needs the demo passwords in a local `.env.test-logins` file (`E2E_ADMIN_PASSWORD`, `E2E_CLIENT_PASSWORD`). It drives the app in Chrome and uses your configured database, so run it against a test database or a demo you don't mind adding audits to.

## CI/CD

`.github/workflows/ci-cd.yml` runs on every pull request and every push to `main`:

1. **Test:** install, lint, unit tests and a production build, on Node 24.
2. **Deploy:** on a push to `main`, only if the tests pass, deploy to Vercel production.
3. **Check:** if the `PRODUCTION_URL` variable is set, confirm `/api/health` responds.

Vercel builds the code itself, because Prisma's engine must match Vercel's runtime. Automatic Git deployments are off in `vercel.json`, so a failing commit can't reach production.

Repository settings needed: secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, and optionally the variable `PRODUCTION_URL`. The renderer tests need Chrome, so they run locally and are skipped in CI.

## Security

| Risk | What the app does |
|---|---|
| Crawler tricked into fetching internal addresses (SSRF) | Blocks private ranges and non-web ports, checks every redirect, and connects only to the address it validated |
| Hostile page content in the PDF | Escapes every value, and renders with JavaScript off and all outside requests blocked |
| Prompt injection from a crawled page | Sends only short, capped fields as JSON, never the page body. Claude has no tools, and its output must match a schema |
| One client reading another's data | Checks ownership on every route, not only in middleware |
| Strangers spending Claude credit | Audits are admin-only, with one active audit per client and a daily cap, after which the labelled sample is used |
| Public cron route | Constant-time secret check |

**Known issue:** Next.js 14.2.35, the newest 14.x and the version the assessment names, has unpatched security advisories, including critical ones in the image optimizer and on Windows-hosted servers. The fixes require a later major version. To reduce the exposure, the image optimizer is off, `next/image`, Server Actions and rewrites aren't used, and local servers listen on 127.0.0.1 only. Denial-of-service advisories for Server Components remain. A real production system should move to a supported major version.

## Where this differs from the assessment

- **Extra table, `AuditReport`:** holds the PDF bytes, because `/tmp/reports` isn't shared between Vercel function calls and downloads would fail. The spec's tables and columns are unchanged, and `pdfPath` is still set.
- **Extra mocks:** `crawl.mock.js`, `claude.mock.js`, `email.mock.js` and `storage.mock.js`. The five files the spec supplies are byte-identical, and a test checks them. `crawl.mock.js` exists because the spec's sample site, `example-dental-clinic.com`, doesn't resolve, so step 1 could never succeed without it.
- **Prisma is pinned to 6.19.3:** the spec's schema is rejected by Prisma 7, and npm's `latest` tag is an 8.0 release candidate.
- **Added sign-in:** the sample route has no auth, which isn't safe on a public URL. Sessions are signed cookies, and the spec's schema has no user table, so no column was added.
- **"Real-time notifications":** progress updates by polling every 2 seconds, as section 6.1 describes, with toasts and a notification list.
- **Cut for time:** score trend, client report history, multi-page crawl (the crawl reads the homepage), and the audits list page.

## Known limitations

- Clients share one demo password. Production needs a user table and individual passwords.
- There is no login rate limiting.
- The crawler doesn't run JavaScript, so JavaScript-rendered sites look thin.
- Performance, Search Console and ranking figures are samples, so only the seeded dental client gives a fully coherent report.
- The Schema.org check is a rule-based test of common business types, not Google's Rich Results Test.
