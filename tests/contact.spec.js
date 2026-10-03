import { test, expect } from '@playwright/test';

async function fillContact(page) {
  await page.goto('/?nointro');
  const form = page.locator('.contact-form');
  await form.scrollIntoViewIfNeeded();
  await form.getByLabel('Your name').fill('Ada Lovelace');
  await form.getByLabel('Your email').fill('ada@example.com');
  await form.getByLabel('Message', { exact: true }).fill('Hello Om, let’s build something together.');
  return form;
}

test('contact sends the form, prevents duplicate clicks and resets only after success', async ({ page }) => {
  const requests = [];
  let release;
  await page.route('**/api/contact', async route => {
    requests.push(route.request().postDataJSON());
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { ok: true } });
  });
  const form = await fillContact(page);
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  await expect(form.getByLabel('Your email')).toBeDisabled();
  await expect(form.getByLabel('Message', { exact: true })).toHaveValue('Hello Om, let’s build something together.');
  await form.evaluate(element => element.requestSubmit());
  expect(requests).toEqual([{ name: 'Ada Lovelace', from: 'ada@example.com', message: 'Hello Om, let’s build something together.', website: '' }]);
  release();
  await expect(form.getByRole('status')).toContainText('Message sent!');
  for (const label of ['Your name', 'Your email', 'Message']) await expect(form.getByLabel(label, { exact: true })).toHaveValue('');
  await expect(form.getByRole('button', { name: 'Send transmission' })).toBeEnabled();
});

test('contact preserves a failed message and allows retrying', async ({ page }) => {
  const requests = [];
  await page.route('**/api/contact', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill(requests.length === 1 ? { status: 503, json: { error: 'The contact form is temporarily unavailable. Please use WhatsApp.' } } : { json: { ok: true } });
  });
  const form = await fillContact(page);
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(form.getByLabel('Message', { exact: true })).toHaveValue('Hello Om, let’s build something together.');
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.getByRole('status')).toContainText('Message sent!');
  expect(requests[1]).toEqual(requests[0]);
});

test('contact handles a network failure or a non-API response without claiming success', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/contact', route => ++attempts === 1 ? route.abort('failed') : route.fulfill({ contentType: 'text/html', body: '<html>Not an API response</html>' }));
  const form = await fillContact(page);
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.getByRole('alert')).toContainText('Could not connect');
  await form.getByRole('button', { name: 'Send transmission' }).click();
  await expect(form.getByRole('alert')).toContainText('could not be sent');
  await expect(form.getByLabel('Your email')).toHaveValue('ada@example.com');
});

test('contact requires a reply address and the WhatsApp CTA fits mobile and desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const form = await fillContact(page);
  await form.getByLabel('Your email').fill('');
  expect(await form.evaluate(element => element.checkValidity())).toBe(false);
  const link = page.getByRole('link', { name: 'Chat on WhatsApp' });
  await expect(link).toHaveAttribute('href', 'https://wa.me/916351394635');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.locator('.whatsapp-contact')).toContainText('+91 63513 94635');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await link.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.locator('#contact').screenshot({ path: 'test-results/contact-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#contact').screenshot({ path: 'test-results/contact-mobile.png' });
});
