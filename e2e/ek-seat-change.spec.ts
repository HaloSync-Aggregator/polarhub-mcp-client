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

/** Extract a real seat number from the seat availability response */
function extractSeatFromResponse(text: string): string {
  // Match patterns like "23A", "41K", "12F" etc.
  const matches = text.match(/\b(\d{1,2}[A-K])\b/g);
  if (matches && matches.length > 0) {
    // Pick a seat from the middle of the list (avoid first row edge cases)
    return matches[Math.min(3, matches.length - 1)];
  }
  return '30A'; // fallback
}

for (const locale of ['en', 'ko'] as const) {
  test(`EK Post-Booking Seat Purchase (${locale})`, async ({ browser }) => {
    test.skip(!EK_ORDER_ID, 'EK_ORDER_ID env var not set — skipping');

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

    const prompts = getPrompts(locale);

    // Step 1: Order Retrieve
    console.log(`[${locale}] Step 1: Order Retrieve — ${EK_ORDER_ID}`);
    await chat.sendMessage(prompts.retrieve);

    const retrieveResult = await chat.getLastAssistantMessage();
    expect(retrieveResult).toMatch(/EK|Emirates|order|주문|예약/i);
    console.log(`[${locale}] Retrieve: ${retrieveResult.substring(0, 100)}...`);

    // Step 2: Seat Availability
    console.log(`[${locale}] Step 2: Seat Availability`);
    await chat.sendMessage(prompts.seats);

    const seatResult = await chat.getLastAssistantMessage();
    expect(seatResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Seats: ${seatResult.substring(0, 100)}...`);

    // Step 3: Select Seat — pick a real seat from the response
    const seatNumber = extractSeatFromResponse(seatResult);
    console.log(`[${locale}] Step 3: Select Seat — picked ${seatNumber}`);
    await chat.sendMessage(prompts.selectSeat(seatNumber));

    const selectResult = await chat.getLastAssistantMessage();
    expect(selectResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Select: ${selectResult.substring(0, 100)}...`);

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
