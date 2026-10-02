import { test, expect } from '@playwright/test';

async function openChat(page) {
  await page.goto('/?nointro');
  await page.locator('.terminal').scrollIntoViewIfNeeded();
  await expect(page.getByRole('textbox', { name: 'Ask Om a question' })).toBeVisible();
}

test('chat sends questions and follow-ups, shows loading, and starts a new conversation', async ({ page }) => {
  const requests = [];
  let answer;
  await page.route('**/api/chat', async route => {
    requests.push(route.request().postDataJSON());
    await new Promise(resolve => { answer = resolve; });
    await route.fulfill({ json: { reply: requests.length === 1 ? 'I built AgentVisit using Gemini and the MERN stack.' : 'I used Gemini to generate field visit reports.' } });
  });
  await openChat(page);
  const input = page.getByRole('textbox', { name: 'Ask Om a question' });
  const log = page.getByRole('log', { name: 'Chat with Om' });
  await page.getByRole('button', { name: 'What have you built?' }).click();
  await expect(log.getByRole('status')).toContainText('Thinking');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
  await input.press('Enter');
  expect(requests).toEqual([{ message: 'What have you built?', history: [] }]);
  answer();
  await expect(log).toContainText('I built AgentVisit');
  await input.fill('How did you use AI in that?');
  await input.press('Enter');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].history).toEqual([
    { role: 'user', text: 'What have you built?' },
    { role: 'model', text: 'I built AgentVisit using Gemini and the MERN stack.' },
  ]);
  answer();
  await expect(log).toContainText('I used Gemini');
  await page.getByRole('button', { name: 'Start a new chat' }).click();
  await expect(log.locator('.chat-message')).toHaveCount(1);
  await input.fill('Where did you study?');
  await input.press('Enter');
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].history).toEqual([]);
  answer();
  await expect(page.getByRole('status').filter({ hasText: 'Thinking' })).toHaveCount(0);
});

test('chat retries an unavailable response without duplicating the question and renders text safely', async ({ page }) => {
  let count = 0;
  const requests = [];
  await page.route('**/api/chat', route => {
    count += 1;
    requests.push(route.request().postDataJSON());
    return route.fulfill(count === 1 ? { status: 503, json: { error: 'My AI chat is temporarily unavailable.' } } : { json: { reply: 'I build React apps. <img src=x onerror="alert(1)">' } });
  });
  await openChat(page);
  await page.getByRole('button', { name: 'Tell me about yourself' }).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  const log = page.getByRole('log', { name: 'Chat with Om' });
  await expect(log).toContainText('I build React apps. <img');
  await expect(log.locator('img')).toHaveCount(0);
  await expect(log.locator('.chat-user')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests[0]).toEqual(requests[1]);
});

test('chat reset cancels a pending reply', async ({ page }) => {
  let release;
  let started = false;
  await page.route('**/api/chat', async route => {
    started = true;
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { reply: 'This reply belongs to the old conversation.' } }).catch(() => {});
  });
  await openChat(page);
  await page.getByRole('button', { name: 'Tell me about yourself' }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Start a new chat' }).click();
  release();
  await expect(page.locator('.chat-thinking')).toHaveCount(0);
  await expect(page.getByRole('log').locator('.chat-message')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Tell me about yourself' })).toBeVisible();
  await expect(page.getByRole('log')).not.toContainText('old conversation');
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`chat allows page scrolling over an empty transcript and at both edges (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.route('**/api/chat', route => route.fulfill({ json: { reply: Array.from({ length: 28 }, (_, index) => `Project detail ${index + 1}: I build full-stack applications with React, Node.js, and MongoDB.`).join('\n\n') } }));
    await openChat(page);
    const log = page.getByRole('log', { name: 'Chat with Om' });
    await log.hover();
    const initialY = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 250);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(initialY + 50);

    await page.locator('.terminal').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'What have you built?' }).click();
    await expect(log).toContainText('Project detail 28');
    // Let Lenis refresh its cached nested-scroll dimensions after the answer appears.
    await page.waitForTimeout(2100);
    await log.evaluate(element => { element.scrollTop = 200; });
    await log.hover();
    const beforeInternal = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 150);
    await expect.poll(() => log.evaluate(element => element.scrollTop)).toBeGreaterThan(250);
    expect(Math.abs((await page.evaluate(() => scrollY)) - beforeInternal)).toBeLessThan(5);

    await log.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.mouse.wheel(0, 250);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeInternal + 50);
    await page.locator('.terminal').scrollIntoViewIfNeeded();
    await log.evaluate(element => { element.scrollTop = 0; });
    await log.hover();
    const beforeUp = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -250);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(beforeUp - 50);
  });
}

test('chat fits mobile screens and keeps the send button usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChat(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.terminal-screen').evaluate(element => element.clientHeight)).toBeGreaterThan(70);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.terminal').screenshot({ path: 'test-results/chat-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.terminal').screenshot({ path: 'test-results/chat-desktop.png' });
});
