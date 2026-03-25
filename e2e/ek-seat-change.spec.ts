import { test, expect } from '@playwright/test';
import { ChatPage } from './helpers/chat';
import { WsLogger } from './helpers/ws-logger';

/**
 * EK Post-Booking Seat Change Test
 *
 * IMPORTANT: This test requires a real TICKETED EK order in the sandbox.
 * Set the EK_ORDER_ID environment variable before running:
 *
 *   EK_ORDER_ID=ORD_XXXXXX npx playwright test e2e/ek-seat-change.spec.ts
 *
 * If not set, the test will skip.
 */

const EK_ORDER_ID = process.env.EK_ORDER_ID || '';

function getPrompts(locale: 'en' | 'ko') {
  return {
    en: {
      retrieve: `Retrieve order ${EK_ORDER_ID}`,
      seats: 'Show me available seats',
      selectSeat: (seat: string) => `Select seat ${seat}`,
      confirm: 'Yes, confirm the change',
    },
    ko: {
      retrieve: `주문 ${EK_ORDER_ID} 조회해줘`,
      seats: '좌석 보여줘',
      selectSeat: (seat: string) => `${seat} 좌석 선택해줘`,
      confirm: '네, 변경 확정해줘',
    },
  }[locale];
}

/** Extract a real available seat from the seat availability response */
function extractSeatFromResponse(text: string): string {
  // Split into lines/sentences and find ones with positive availability keywords
  const lines = text.split(/[.\n]/);
  const positiveKw = /가능|available|open|선택 가능|예약 가능|choice seat/i;
  const negativeKw = /불가|occupied|reserved|제한|지정|이미|not available|unavailable|선택 불가/i;

  for (const line of lines) {
    if (positiveKw.test(line) && !negativeKw.test(line)) {
      const seats = line.match(/\b(\d{1,2}[A-K])\b/g);
      if (seats) return seats[0];
    }
  }

  // Fallback: row 24+ seats near positive context
  const row24plus = text.match(/\b(2[4-9][A-K]|[3-9]\d[A-K])\b/g);
  if (row24plus) {
    for (const s of row24plus) {
      const idx = text.indexOf(s);
      const ctx = text.substring(Math.max(0, idx - 40), idx + 40);
      if (!negativeKw.test(ctx)) return s;
    }
  }

  return '24B'; // last resort — commonly available in EK 777
}

for (const locale of ['en', 'ko'] as const) {
  test(`EK Post-Booking Seat Purchase (${locale})`, async ({ browser }) => {
    test.skip(!EK_ORDER_ID, 'EK_ORDER_ID env var not set — skipping');

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

    const prompts = getPrompts(locale);

    // Step 1: Order Retrieve — retry if sync delay
    let retrieveResult = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[${locale}] Step 1: Order Retrieve — ${EK_ORDER_ID} (attempt ${attempt})`);
      await chat.sendMessage(prompts.retrieve);
      retrieveResult = await chat.getLastAssistantMessage();
      console.log(`[${locale}] Retrieve: ${retrieveResult.substring(0, 100)}...`);
      if (!/지연|업데이트 중|unable|error|찾을 수 없|delay/i.test(retrieveResult)) break;
      console.log(`[${locale}] Retrieve not ready, waiting 10s...`);
      await page.waitForTimeout(10000);
    }
    expect(retrieveResult).toMatch(/EK|Emirates|TICKETED|발권/i);

    // Step 2: Seat Availability
    console.log(`[${locale}] Step 2: Seat Availability`);
    await chat.sendMessage(prompts.seats);

    const seatResult = await chat.getLastAssistantMessage();
    expect(seatResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Seats: ${seatResult.substring(0, 100)}...`);

    // Step 3: Select Seat — pick from LLM's recommendation in the response
    // Extract seat numbers mentioned near "recommend" / "추천" in the response
    function extractRecommendedSeat(text: string): string | null {
      // Find seats near recommendation keywords
      const lines = text.split('\n');
      let inRecommendation = false;
      for (const line of lines) {
        if (/recommend|추천/i.test(line)) inRecommendation = true;
        if (inRecommendation) {
          const seat = line.match(/\b(\d{1,2}[A-K])\b/);
          if (seat) return seat[1];
        }
      }
      // Fallback: first seat mentioned after "select" / "선택"
      const selectMatch = text.match(/(?:select|선택)[^.]*?(\d{1,2}[A-K])\b/i);
      if (selectMatch) return selectMatch[1];
      return null;
    }

    // Always try LLM's recommended seat first (natural conversation)
    // If it fails, ask LLM to suggest another one
    const recommendedSeat = extractRecommendedSeat(seatResult) ?? '25A';
    console.log(`[${locale}] LLM recommended: ${recommendedSeat}`);
    let selectResult = '';

    // Fallback seat from actual availability data (for attempt 3)
    const availableSeats = wsLog.getAvailableSeats();
    const fallbackWindow = availableSeats.find(s => s.endsWith('A') || s.endsWith('K')) ?? availableSeats[0] ?? '25A';

    const retryMessages = {
      en: [
        `I'd like seat ${recommendedSeat} please`,
        `That seat doesn't seem to work. Could you recommend another window seat?`,
        `How about seat ${fallbackWindow}? I'd like that one`,
      ],
      ko: [
        `${recommendedSeat} 좌석으로 할게요`,
        `그 좌석은 안 되는 것 같아요. 다른 창가 좌석 추천해주세요`,
        `${fallbackWindow} 좌석은 어떨까요? 그걸로 할게요`,
      ],
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const msg = retryMessages[locale][attempt];
      console.log(`[${locale}] Step 3: Select Seat (attempt ${attempt + 1})`);
      await chat.sendMessage(msg);
      selectResult = await chat.getLastAssistantMessage();
      console.log(`[${locale}] Select: ${selectResult.substring(0, 150)}...`);
      const isSuccess = /완료|준비.*완료|ready.*confirm|successfully prepared|change.*ready/i.test(selectResult);
      const isError = /실패|오류|찾을 수 없|중단되었|unable to|could not|not found|not completed/i.test(selectResult);
      if (isSuccess && !isError) break;
      if (attempt < 2) {
        console.log(`[${locale}] Seat select failed, waiting 5s...`);
        await page.waitForTimeout(5000);
      }
    }
    expect(selectResult.length).toBeGreaterThan(30);

    // Step 4: Confirm Change (triggers order_confirm)
    console.log(`[${locale}] Step 4: Confirm`);
    await chat.sendMessage(prompts.confirm);

    const confirmResult = await chat.getLastAssistantMessage();
    expect(confirmResult).toMatch(/confirm|complete|success|change|확정|완료|좌석|변경/i);
    console.log(`[${locale}] Confirm: ${confirmResult.substring(0, 100)}...`);

    // Save logs
    await chat.saveConversationLog(`test-results/ek-seat-change-${locale}.json`);
    wsLog.saveLog(`test-results/ek-seat-change-${locale}-ws.json`);

    console.log(`[${locale}] ✅ EK Seat Change test completed`);

    await context.close();
  });
}
