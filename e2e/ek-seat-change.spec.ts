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

const PROMPTS = {
  en: {
    retrieve: `Retrieve order ${EK_ORDER_ID}`,
    seats: 'Show me available seats',
    selectSeat: 'Select seat 23A',
    confirm: 'Yes, confirm the change',
  },
  ko: {
    retrieve: `주문 ${EK_ORDER_ID} 조회해줘`,
    seats: '좌석 보여줘',
    selectSeat: '23A 좌석 선택해줘',
    confirm: '네, 변경 확정해줘',
  },
};

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

    const prompts = PROMPTS[locale];

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

    // Step 3: Select Seat (triggers order_prepare)
    console.log(`[${locale}] Step 3: Select Seat`);
    await chat.sendMessage(prompts.selectSeat);

    const selectResult = await chat.getLastAssistantMessage();
    expect(selectResult.length).toBeGreaterThan(30);
    console.log(`[${locale}] Select: ${selectResult.substring(0, 100)}...`);

    // Step 4: Confirm Change (triggers order_confirm)
    console.log(`[${locale}] Step 4: Confirm`);
    await chat.sendMessage(prompts.confirm);

    const confirmResult = await chat.getLastAssistantMessage();
    expect(confirmResult).toMatch(/confirm|complete|success|23A|확정|완료|좌석/i);
    console.log(`[${locale}] Confirm: ${confirmResult.substring(0, 100)}...`);

    // Save logs
    await chat.saveConversationLog(`test-results/ek-seat-change-${locale}.json`);
    wsLog.saveLog(`test-results/ek-seat-change-${locale}-ws.json`);

    console.log(`[${locale}] ✅ EK Seat Change test completed`);

    await context.close();
  });
}
