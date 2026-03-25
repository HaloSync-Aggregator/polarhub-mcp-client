import { test, expect } from '@playwright/test';
import { ChatPage } from './helpers/chat';
import { WsLogger } from './helpers/ws-logger';

test('EK Book Only — KO', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'ko-KR',
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: 'test-results/' },
  });
  const page = await context.newPage();
  const wsLog = new WsLogger(page);

  await page.goto('/?locale=ko');
  const chat = new ChatPage(page);
  await chat.waitForConnection();

  // Step 1: Search
  console.log('[ko] Step 1: EK Flight Search');
  await chat.sendMessage('서울에서 두바이 4월 20일 편도 성인 1명 EK 항공사로 검색해줘');
  const searchResult = await chat.getLastAssistantMessage();
  expect(searchResult.length).toBeGreaterThan(50);
  console.log(`[ko] Search done`);

  // Step 2: Select first offer
  console.log('[ko] Step 2: Select Offer');
  await chat.sendMessage('첫 번째 오퍼 선택해줘');
  const priceResult = await chat.getLastAssistantMessage();
  expect(priceResult.length).toBeGreaterThan(50);
  console.log(`[ko] Price done`);

  // Step 3: Book
  console.log('[ko] Step 3: Book');
  await chat.sendMessage('승객 홍길동 GILDONG HONG, 생년월일 1990-05-15, 남성, 여권 M12345678 만료 2030-12-31, 이메일 test@example.com, 전화 +821012345678로 예약해줘');
  const bookResult = await chat.getLastAssistantMessage();
  console.log(`[ko] Book result:\n${bookResult.substring(0, 300)}`);

  // Extract OrderID
  const orderMatch = bookResult.match(/TSDEV-\d{8}-[a-f0-9]+/i);
  const orderId = orderMatch ? orderMatch[0] : 'NOT FOUND';
  console.log(`\n========================================`);
  console.log(`  OrderID: ${orderId}`);
  console.log(`========================================\n`);

  expect(orderId).not.toBe('NOT FOUND');

  await chat.saveConversationLog('test-results/ek-book-only-ko.json');
  wsLog.saveLog('test-results/ek-book-only-ko-ws.json');
  await context.close();
});
