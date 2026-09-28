import { test, expect } from '@playwright/test';

test('desktop renders the 3D hero and resume content without browser errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Turning ideas');
  await expect(page.locator('.sculpture-canvas canvas')).toBeVisible();
  await expect(page.locator('.is-fallback')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('heading', { name: 'Junior Full Stack Developer' })).toHaveCount(1);
  await expect(page.locator('.project-card')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/desktop-hero.png' });
  for (const section of ['#work', '#about', '#experience', '#contact']) {
    await page.locator(section).scrollIntoViewIfNeeded();
    await expect(page.locator(`${section} .reveal`).first()).toHaveClass(/visible/);
  }
  await page.locator('#work').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/desktop-work.png' });
  await page.screenshot({ path: 'test-results/desktop-full.png', fullPage: true, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('project filters, expansion, detail dialogs and keyboard return work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'AI & automation', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  const trigger = page.getByRole('button', { name: 'View AgentVisit project details' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Visit project' })).toHaveAttribute('href', 'https://kagentvisit.vercel.app/');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'All work' }).click();
  await page.getByRole('button', { name: 'More things I’ve built' }).click();
  await expect(page.locator('.project-card')).toHaveCount(9);
  await page.getByRole('button', { name: 'View Travel CRM project details' }).click();
  await expect(page.getByRole('dialog')).toContainText('Public demo unavailable');
  await page.getByRole('button', { name: 'Close project' }).click();
  await page.getByRole('button', { name: 'Show selected projects' }).click();
  await expect(page.locator('.project-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Web experiences', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(3);
});

test('resume downloads and contact actions have real destinations', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download résumé' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Om_Zala_Resume_2026.pdf');
  const pdf = await request.get('/Om_Zala_Resume_2026.pdf');
  expect(pdf.ok()).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: 'Copy email address' }).click();
  await expect(page.getByRole('status')).toHaveText('Email copied to clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('omzala635@gmail.com');
  await expect(page.getByRole('link', { name: 'omzala635@gmail.com', exact: true })).toHaveAttribute('href', 'mailto:omzala635@gmail.com');
});

test('mobile navigation, project details, and layout work on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('navigation')).not.toBeVisible();
  await page.getByRole('button', { name: 'View Edushine project details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close project' }).click();
  for (const width of [320, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible')); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await page.screenshot({ path: 'test-results/mobile-hero.png', animations: 'disabled' });
  await page.screenshot({ path: 'test-results/mobile-full.png', fullPage: true, animations: 'disabled' });
});

test('reduced motion keeps content visible and pauses decorative CSS animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.sculpture-canvas canvas')).toBeVisible();
  expect(await page.locator('.ticker-track').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('.about-copy').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

test('the page remains usable if WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('.is-fallback .sculpture-fallback')).toBeVisible();
  await page.getByRole('button', { name: 'View AgentVisit project details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
