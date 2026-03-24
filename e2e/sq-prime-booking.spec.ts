import { test, expect } from '@playwright/test';
import { ChatPage } from './helpers/chat';
import { WsLogger } from './helpers/ws-logger';

const PROMPTS = {
  en: {
    search: 'Search one-way flights from Seoul to Singapore on April 25, 1 adult, SQ airline only',
    selectOffer: 'Select the first offer',
    book: 'Book with passenger GILDONG HONG, born 1990-05-15, male, passport M12345678 expiring 2030-12-31, email test@example.com, phone +821012345678',
  },
  ko: {
    search: '서울에서 싱가포르 4월 25일 편도 성인 1명 SQ 항공사로 검색해줘',
    selectOffer: '첫 번째 오퍼 선택해줘',
    book: '승객 홍길동 GILDONG HONG, 생년월일 1990-05-15, 남성, 여권 M12345678 만료 2030-12-31, 이메일 test@example.com, 전화 +821012345678로 예약해줘',
  },
};

for (const locale of ['en', 'ko'] as const) {
  test(`SQ Prime Booking — instant ticketing (${locale})`, async ({ page, context }) => {
    // Set browser locale
    await context.grantPermissions([]);

    const wsLog = new WsLogger(page);

    // Navigate with locale
    await page.goto(`/?locale=${locale}`);
    const chat = new ChatPage(page);
    await chat.waitForConnection();

    const prompts = PROMPTS[locale];

    // Step 1: Flight Search
    console.log(`[${locale}] Step 1: Flight Search`);
    await chat.sendMessage(prompts.search);

    // Verify search results contain flight info
    const searchResult = await chat.getLastAssistantMessage();
    expect(searchResult.length).toBeGreaterThan(50);
    console.log(`[${locale}] Search result: ${searchResult.substring(0, 100)}...`);

    // Step 2: Select first offer (triggers flight_price)
    console.log(`[${locale}] Step 2: Select Offer`);
    await chat.sendMessage(prompts.selectOffer);

    const priceResult = await chat.getLastAssistantMessage();
    expect(priceResult.length).toBeGreaterThan(50);
    console.log(`[${locale}] Price result: ${priceResult.substring(0, 100)}...`);

    // Step 3: Book with passenger info (triggers flight_book)
    console.log(`[${locale}] Step 3: Book`);
    await chat.sendMessage(prompts.book);

    const bookResult = await chat.getLastAssistantMessage();
    // Should contain PNR or OrderID or booking confirmation
    expect(bookResult).toMatch(/PNR|Order|booking|예약|확인/i);
    console.log(`[${locale}] Book result: ${bookResult.substring(0, 150)}...`);

    // Save logs
    await chat.saveConversationLog(`test-results/sq-prime-booking-${locale}.json`);
    wsLog.saveLog(`test-results/sq-prime-booking-${locale}-ws.json`);

    console.log(`[${locale}] ✅ SQ Prime Booking test completed`);
  });
}
