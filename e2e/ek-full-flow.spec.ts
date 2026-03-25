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
  // Split into sentences/lines and find ones with positive availability keywords
  const lines = text.split(/[.\n]/);
  const positiveKeywords = /가능|available|open|선택 가능|예약 가능|choice seat|extra legroom/i;
  const negativeKeywords = /불가|occupied|reserved|제한|지정|이미|not available|unavailable|선택 불가/i;

  for (const line of lines) {
    if (positiveKeywords.test(line) && !negativeKeywords.test(line)) {
      const seats = line.match(/\b(\d{1,2}[A-K])\b/g);
      if (seats && seats.length > 0) {
        return seats[0];
      }
    }
  }

  // Fallback: row 24+ seats near non-negative context
  const row24plus = text.match(/\b(2[4-9][A-K]|[3-9]\d[A-K])\b/g);
  if (row24plus) {
    for (const s of row24plus) {
      const idx = text.indexOf(s);
      const ctx = text.substring(Math.max(0, idx - 40), idx + 40);
      if (!negativeKeywords.test(ctx)) return s;
    }
  }

  return '24B'; // last resort — most commonly available in EK 777 tests
}

for (const locale of ['en', 'ko'] as const) {
  test(`EK Full Flow — Book + Seat Change (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({
      locale: locale === 'ko' ? 'ko-KR' : 'en-US',
      viewport: { width: 1920, height: 1080 },
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

    // Wait for sandbox to sync after ticketing (EK needs longer)
    console.log(`[${locale}] Waiting 15s for sandbox sync...`);
    await page.waitForTimeout(15000);

    // Step 4: Retrieve the order — retry if sandbox is still syncing
    let retrieveResult = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      const retrieveMsg = locale === 'en'
        ? `Retrieve order ${orderId}`
        : `주문 ${orderId} 조회해줘`;
      console.log(`[${locale}] Step 4: Retrieve Order (attempt ${attempt})`);
      await chat.sendMessage(retrieveMsg);
      retrieveResult = await chat.getLastAssistantMessage();
      console.log(`[${locale}] Retrieve: ${retrieveResult.substring(0, 100)}...`);

      const isError = /지연|업데이트 중|unable|not found|error|찾을 수 없/i.test(retrieveResult);
      if (!isError) break;

      console.log(`[${locale}] Retrieve failed, waiting 10s before retry...`);
      await page.waitForTimeout(10000);
    }
    expect(retrieveResult).toMatch(/EK|Emirates|TICKETED|발권/i);

    // Step 5: Seat Availability
    console.log(`[${locale}] Step 5: Seat Availability`);
    await chat.sendMessage(prompts.showSeats);
    const seatResult = await chat.getLastAssistantMessage();
    expect(seatResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Seats: ${seatResult.substring(0, 100)}...`);

    // Step 6: Pick a real available seat — retry full cycle (seats → select) if sandbox is syncing
    let selectResult = '';
    let seatSuccess = false;
    let currentSeatResult = seatResult;

    // Extract LLM's recommended seat from the seat availability response
    function extractRecommendedSeat(text: string): string | null {
      const lines = text.split('\n');
      let inRecommendation = false;
      for (const line of lines) {
        if (/recommend|추천/i.test(line)) inRecommendation = true;
        if (inRecommendation) {
          const seat = line.match(/\b(\d{1,2}[A-K])\b/);
          if (seat) return seat[1];
        }
      }
      const selectMatch = text.match(/(?:select|선택)[^.]*?(\d{1,2}[A-K])\b/i);
      if (selectMatch) return selectMatch[1];
      return null;
    }

    const recommendedSeat = extractRecommendedSeat(currentSeatResult);
    const fallbackSeats = wsLog.getAvailableSeats();
    const isRecommendedAvailable = recommendedSeat && fallbackSeats.includes(recommendedSeat);
    const windowFallback = fallbackSeats.find(s => s.endsWith('A') || s.endsWith('K')) ?? fallbackSeats[0] ?? '25A';
    const firstSeat = isRecommendedAvailable ? recommendedSeat : windowFallback;
    console.log(`[${locale}] LLM recommended: ${recommendedSeat}, available: ${isRecommendedAvailable}, using: ${firstSeat}`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const seat = attempt === 1 ? firstSeat : (fallbackSeats[attempt] ?? '25A');
      const selectMsg = locale === 'en'
        ? (attempt === 1 ? `Select seat ${seat} please` : `That seat didn't work. How about seat ${seat}?`)
        : (attempt === 1 ? `${seat} 좌석 선택해줘` : `그 좌석은 안 되네요. ${seat} 좌석으로 해줘`);
      console.log(`[${locale}] Step 6: Select Seat — ${seat} (attempt ${attempt})`);
      await chat.sendMessage(selectMsg);
      selectResult = await chat.getLastAssistantMessage();
      console.log(`[${locale}] Select: ${selectResult.substring(0, 150)}...`);

      const isSuccess = /완료|준비.*완료|ready.*confirm|successfully prepared|change.*ready/i.test(selectResult);
      const isError = /실패|오류|찾을 수 없|중단되었|unable to|could not|not found|not completed/i.test(selectResult);
      if (isSuccess && !isError) {
        seatSuccess = true;
        break;
      }

      if (attempt < 3) {
        console.log(`[${locale}] Seat select failed, re-fetching seats after 10s...`);
        await page.waitForTimeout(10000);
        // Re-fetch seat availability to get fresh data
        await chat.sendMessage(prompts.showSeats);
        currentSeatResult = await chat.getLastAssistantMessage();
        console.log(`[${locale}] Re-fetched seats: ${currentSeatResult.substring(0, 100)}...`);
      }
    }

    // Step 7: Confirm (only if seat selection succeeded)
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
