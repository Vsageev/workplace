# Manual Browser Testing Workflow

Use inline Playwright scripts executed with `npx tsx`. Do not create test files.

## Sequence

1. Read the test request and inspect the relevant frontend code in `packages/frontend/src/`.
2. Launch a visible Chromium session with `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers`.
3. Navigate, interact, and log observations with focused scripts.
4. Save screenshots to `tests/e2e/screenshots/` at key steps.
5. Report what happened and whether behavior matched expectations.
6. Delete temporary screenshots after reporting.

## Execution pattern

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx tsx -e "
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();

  await page.goto('http://localhost:5173');
  await page.screenshot({ path: 'tests/e2e/screenshots/step1.png' });

  console.log('Loaded app');
  await browser.close();
})();
"
```

If the browser is missing, install it with:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-browsers npx playwright install chromium
```

Rules:

- Always use `headless: false`.
- Keep scripts small and task-specific.
- Always close the browser.
- Never create artifacts outside `tests/e2e/screenshots/`.
