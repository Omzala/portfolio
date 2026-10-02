import { test, expect } from '@playwright/test';

// `?nointro` skips the launch countdown so each test starts on a settled page.
const HOME = '/?nointro';
const toSection = (page, id) => page.evaluate(id => window.scrollTo({ top: document.getElementById(id).getBoundingClientRect().top + window.scrollY, behavior: 'instant' }), id);

test('the intro counts down, then the 3D hero and every section render without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.preloader')).toBeVisible();
  await expect(page.locator('.preloader')).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Om Zala' })).toBeVisible();
  await expect(page.locator('.raccoon canvas')).toBeVisible();
  await expect(page.locator('.starfield canvas')).toHaveCount(1);
  await expect(page.locator('.is-fallback')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/desktop-hero.png' });
  await page.locator('.raccoon canvas').click();
  await expect(page.locator('.bubble')).toHaveText('Wheee! Barrel roll!');
  for (const id of ['about', 'work', 'arcade', 'contact']) {
    await toSection(page, id);
    await expect(page.locator(`#${id} .kicker`)).toBeVisible();
    await expect(page.locator(`#${id} .reveal-text .word`).first()).toHaveCSS('transform', /matrix\(1, 0, 0, 1, 0, 0\)|none/, { timeout: 5000 });
  }
  expect(errors).toEqual([]);
});

test('the toolbelt switches to zero gravity', async ({ page }) => {
  await page.goto(HOME);
  await toSection(page, 'about');
  const toggle = page.getByRole('switch', { name: 'Zero-G' });
  await expect(toggle).toBeEnabled();
  await expect(page.locator('.pill-box.live .pill')).toHaveCount(11);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('mission files filter, open in a detail view and step through projects', async ({ page }) => {
  await page.goto(HOME);
  await toSection(page, 'work');
  await page.getByRole('button', { name: /^AI & automation/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open AgentVisit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('AgentVisit');
  await expect(dialog.getByRole('link', { name: 'Visit project' })).toHaveAttribute('href', 'https://kagentvisit.vercel.app/');
  await expect(dialog.getByRole('button', { name: 'Close project' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.locator('#work').getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(9);
  // An off-screen card scrolls into view when it takes keyboard focus.
  await page.getByRole('button', { name: 'Open Travel CRM' }).focus();
  await expect(page.getByRole('button', { name: 'Open Travel CRM' })).toBeInViewport({ timeout: 5000 });
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Travel CRM');
  await expect(dialog).toContainText('Public demo unavailable');
  await dialog.getByRole('button', { name: 'Next project' }).click();
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Junohub');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('heading', { level: 3 })).toHaveText('Task Manager + MOM');
  await page.screenshot({ path: 'test-results/project-detail.png' });
  await dialog.getByRole('button', { name: 'Close project' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector('.work-sticky').scrollLeft)).toBe(0);
});

test('the arcade flies without a name, then lets the pilot claim a spot on the board', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(HOME);
  await toSection(page, 'arcade');
  const stage = page.locator('.game-stage');
  await expect(page.locator('.game-stage canvas')).toBeVisible();
  await expect(stage).toHaveAttribute('data-status', 'idle');
  const launch = page.getByRole('button', { name: /Launch/ });
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect(stage).toHaveAttribute('data-status', 'playing', { timeout: 10000 });
  await expect(stage).toBeFocused();
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: 'test-results/arcade-playing.png' });
  // Bandit coasts until the asteroid belt wins.
  await expect(stage).toHaveAttribute('data-status', 'over', { timeout: 150000 });
  await expect(page.getByText('Mission over')).toBeVisible();
  const score = await stage.getAttribute('data-score');
  const callsign = page.getByRole('textbox', { name: /Callsign/ });
  const claim = page.getByRole('button', { name: /Claim #|Save flight/ });
  await expect(claim).toBeEnabled();
  await callsign.fill('x');
  await claim.click();
  await expect(page.locator('#pilot-error')).toHaveText('Callsigns need at least 2 letters or numbers.');
  // Callsigns are unique on a shared board, so each run picks its own. Markup is stripped from names.
  const tag = String(Date.now()).slice(-5);
  const pilot = `Test ${tag}`;
  await callsign.fill(`  Test <${tag}>  `);
  await page.screenshot({ path: 'test-results/arcade-over.png' });
  await claim.click();
  await expect(stage).toHaveAttribute('data-status', 'claimed');
  await expect(page.getByText('On the board')).toBeVisible();
  const board = page.locator('.board-list');
  await expect(board.locator('li.me')).toContainText(pilot);
  await expect(board.locator('li.me .pts')).toHaveText(score.padStart(6, '0'));
  await page.screenshot({ path: 'test-results/arcade-claimed.png' });

  // Other boards and a reload still know this pilot.
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(board.locator('li.me')).toContainText(pilot);
  await page.reload();
  await toSection(page, 'arcade');
  await expect(page.locator('.board-list')).toContainText(pilot);
  await expect(page.getByText(`Welcome back, ${pilot}.`)).toBeVisible();
});

test('contact and socials have real destinations', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(HOME);
  await toSection(page, 'contact');
  await page.getByRole('button', { name: 'Copy email address' }).click();
  await expect(page.locator('.copy-status')).toHaveText('Email copied to clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('omzala635@gmail.com');
  const contact = page.locator('#contact');
  await expect(contact.locator('.email-pill a')).toHaveAttribute('href', 'mailto:omzala635@gmail.com');
  await expect(contact.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/Omzala');
  await expect(contact.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', 'https://www.linkedin.com/in/om-zala/');
  const downloadPromise = page.waitForEvent('download');
  await contact.getByRole('link', { name: /Résumé/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('OM_ZALA_.pdf');
  const pdf = await request.get('/OM_ZALA_.pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const form = page.locator('.contact-form');
  await form.getByLabel('Your name').fill('Ada');
  await form.getByLabel('Message').fill('Hello there');
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.locator('.form-note')).toContainText('Your email app should open');
});

test('mobile navigation works and nothing overflows sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(HOME);
  await expect(page.getByRole('heading', { level: 1, name: 'Om Zala' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: /Work/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('#work .kicker')).toBeInViewport({ timeout: 5000 });
  await page.getByRole('button', { name: 'Open Edushine' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 3 })).toHaveText('Edushine');
  await page.keyboard.press('Escape');
  for (const width of [320, 375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/mobile-hero.png' });
});

test('reduced motion skips the intro and smooth scrolling and keeps content visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.preloader')).toHaveCount(0);
  await expect(page.locator('.raccoon canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('lenis'))).toBe(false);
  await toSection(page, 'contact');
  await expect(page.locator('.contact-form')).toHaveCSS('opacity', '1');
  await expect(page.locator('.pill-box')).not.toHaveClass(/live/);
});

test('the page stays usable if WebGL is unavailable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto(HOME);
  await expect(page.locator('.raccoon.is-fallback svg')).toBeVisible();
  await toSection(page, 'arcade');
  await expect(page.locator('.game-stage')).toHaveAttribute('data-status', 'unsupported');
  await expect(page.locator('.game-fallback')).toContainText('grounded');
  await toSection(page, 'work');
  await page.getByRole('button', { name: 'Open AgentVisit' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { level: 3 })).toHaveText('AgentVisit');
  expect(errors).toEqual([]);
});
