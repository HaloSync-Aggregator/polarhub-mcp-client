import { test, expect } from '@playwright/test';
import { ChatPage } from './helpers/chat';
import { WsLogger } from './helpers/ws-logger';

test('EK Book Only — EN', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  await page.goto('/?locale=en');
  const chat = new ChatPage(page);
  await chat.waitForConnection();

  await chat.sendMessage('Search one-way flights from Seoul to Dubai on April 20, 1 adult, EK airline only');
  console.log('[en] Search done');

  await chat.sendMessage('Select the first offer');
  console.log('[en] Price done');

  await chat.sendMessage('Book with passenger GILDONG HONG, born 1990-05-15, male, passport M12345678 expiring 2030-12-31, email test@example.com, phone +821012345678');
  const bookResult = await chat.getLastAssistantMessage();

  const orderMatch = bookResult.match(/TSDEV-\d{8}-[a-f0-9]+/i);
  const orderId = orderMatch ? orderMatch[0] : 'NOT FOUND';
  console.log(`\n========================================`);
  console.log(`  OrderID: ${orderId}`);
  console.log(`========================================\n`);

  expect(orderId).not.toBe('NOT FOUND');
  await context.close();
});
