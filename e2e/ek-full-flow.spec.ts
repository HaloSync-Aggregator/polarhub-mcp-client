import { test, expect } from '@playwright/test';
import { ChatPage } from './helpers/chat';
import { WsLogger } from './helpers/ws-logger';

/**
 * EK Full Flow: Book → Retrieve → Seat Change
 * Creates a fresh EK booking then changes the seat.
 * No pre-existing OrderID needed.
 */

const PROMPTS = {
  en: {
    search: 'Search one-way flights from Seoul to Dubai on April 20, 1 adult, EK airline only',
    selectOffer: 'Select the first offer',
    book: 'Book with passenger GILDONG HONG, born 1990-05-15, male, passport M12345678 expiring 2030-12-31, email test@example.com, phone +821012345678',
    showSeats: 'Show me available seats for this booking',
    confirm: 'Yes, confirm the seat change',
  },
  ko: {
    search: '서울에서 두바이 4월 20일 편도 성인 1명 EK 항공사로 검색해줘',
    selectOffer: '첫 번째 오퍼 선택해줘',
    book: '승객 홍길동 GILDONG HONG, 생년월일 1990-05-15, 남성, 여권 M12345678 만료 2030-12-31, 이메일 test@example.com, 전화 +821012345678로 예약해줘',
    showSeats: '이 예약의 좌석 보여줘',
    confirm: '네, 좌석 변경 확정해줘',
  },
};

/** Extract OrderID from booking response */
function extractOrderId(text: string): string | null {
  const match = text.match(/TSDEV-\d{8}-[a-f0-9]+/i);
  return match ? match[0] : null;
}

/** Extract a real available seat from the response */
function extractAvailableSeat(text: string): string {
  // Look for seats explicitly mentioned near "Available" / "가능" / "available"
  const availPattern = /(\d{1,2}[A-K])\s*(?:좌석은?|seat)?\s*(?:.*?)(?:available|가능|Available|선택 가능|예약 가능)/gi;
  let match: RegExpExecArray | null;
  while ((match = availPattern.exec(text)) !== null) {
    return match[1];
  }

  // Reverse pattern: "available" then seat
  const reversePattern = /(?:available|가능|Available|선택 가능)\s*(?:.*?)(\d{1,2}[A-K])\b/gi;
  while ((match = reversePattern.exec(text)) !== null) {
    return match[1];
  }

  // Fallback: just pick the first seat number mentioned
  const allSeats = text.match(/\b(\d{1,2}[A-K])\b/g);
  if (allSeats && allSeats.length > 0) {
    return allSeats[0];
  }
  return '24A'; // last resort
}

for (const locale of ['en', 'ko'] as const) {
  test(`EK Full Flow — Book + Seat Change (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({
      locale: locale === 'ko' ? 'ko-KR' : 'en-US',
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: 'test-results/' },
    });
    const page = await context.newPage();
    const wsLog = new WsLogger(page);

    await page.goto(`/?locale=${locale}`);
    const chat = new ChatPage(page);
    await chat.waitForConnection();

    const prompts = PROMPTS[locale];

    // ===== PART 1: Prime Booking =====

    // Step 1: Flight Search
    console.log(`[${locale}] Step 1: EK Flight Search`);
    await chat.sendMessage(prompts.search);
    const searchResult = await chat.getLastAssistantMessage();
    expect(searchResult.length).toBeGreaterThan(50);
    console.log(`[${locale}] Search: ${searchResult.substring(0, 100)}...`);

    // Step 2: Select Offer
    console.log(`[${locale}] Step 2: Select Offer`);
    await chat.sendMessage(prompts.selectOffer);
    const priceResult = await chat.getLastAssistantMessage();
    expect(priceResult.length).toBeGreaterThan(50);
    console.log(`[${locale}] Price: ${priceResult.substring(0, 100)}...`);

    // Step 3: Book
    console.log(`[${locale}] Step 3: Book`);
    await chat.sendMessage(prompts.book);
    const bookResult = await chat.getLastAssistantMessage();
    expect(bookResult).toMatch(/PNR|Order|booking|예약|확인/i);
    console.log(`[${locale}] Book: ${bookResult.substring(0, 150)}...`);

    // Extract OrderID for post-booking
    const orderId = extractOrderId(bookResult);
    console.log(`[${locale}] OrderID: ${orderId}`);
    expect(orderId).toBeTruthy();

    // ===== PART 2: Post-Booking Seat Change =====

    // Step 4: Retrieve the order we just created
    const retrieveMsg = locale === 'en'
      ? `Retrieve order ${orderId}`
      : `주문 ${orderId} 조회해줘`;
    console.log(`[${locale}] Step 4: Retrieve Order`);
    await chat.sendMessage(retrieveMsg);
    const retrieveResult = await chat.getLastAssistantMessage();
    expect(retrieveResult).toMatch(/EK|Emirates|order|주문|예약/i);
    console.log(`[${locale}] Retrieve: ${retrieveResult.substring(0, 100)}...`);

    // Step 5: Seat Availability
    console.log(`[${locale}] Step 5: Seat Availability`);
    await chat.sendMessage(prompts.showSeats);
    const seatResult = await chat.getLastAssistantMessage();
    expect(seatResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Seats: ${seatResult.substring(0, 100)}...`);

    // Step 6: Pick a real available seat
    const seat = extractAvailableSeat(seatResult);
    const selectMsg = locale === 'en'
      ? `Select seat ${seat}`
      : `${seat} 좌석 선택해줘`;
    console.log(`[${locale}] Step 6: Select Seat — ${seat}`);
    await chat.sendMessage(selectMsg);
    const selectResult = await chat.getLastAssistantMessage();
    console.log(`[${locale}] Select: ${selectResult.substring(0, 150)}...`);

    // Step 7: Confirm
    console.log(`[${locale}] Step 7: Confirm`);
    await chat.sendMessage(prompts.confirm);
    const confirmResult = await chat.getLastAssistantMessage();
    console.log(`[${locale}] Confirm: ${confirmResult.substring(0, 150)}...`);

    // Save logs
    await chat.saveConversationLog(`test-results/ek-full-flow-${locale}.json`);
    wsLog.saveLog(`test-results/ek-full-flow-${locale}-ws.json`);

    console.log(`[${locale}] ✅ EK Full Flow test completed`);
    await context.close();
  });
}
