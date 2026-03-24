import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface ConversationEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
}

export class ChatPage {
  private conversation: ConversationEntry[] = [];

  constructor(private page: Page) {}

  /** Send a message and wait for the assistant to finish responding */
  async sendMessage(text: string): Promise<void> {
    // Record user message
    this.conversation.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });

    // Type into chat input
    const input = this.page.locator('textarea').first();
    await input.fill(text);
    await input.press('Enter');

    // Wait for assistant response to complete
    await this.waitForAssistantResponse();
  }

  /** Wait until loading indicator disappears (assistant done responding) */
  async waitForAssistantResponse(): Promise<string> {
    // Wait for loading dots to appear then disappear
    try {
      await this.page.locator('.loading-dots').first().waitFor({
        state: 'visible',
        timeout: 10_000,
      });
    } catch {
      // Loading may have already passed
    }

    // Wait for loading to finish
    await this.page.locator('.loading-dots').waitFor({
      state: 'hidden',
      timeout: 60_000,
    });

    // Small delay for DOM to settle
    await this.page.waitForTimeout(500);

    const msg = await this.getLastAssistantMessage();

    // Record assistant response
    this.conversation.push({
      role: 'assistant',
      content: msg,
      timestamp: new Date().toISOString(),
    });

    return msg;
  }

  /** Get the last assistant message text */
  async getLastAssistantMessage(): Promise<string> {
    const messages = this.page.locator('[class*="justify-start"] .prose');
    const count = await messages.count();
    if (count === 0) return '';
    return (await messages.nth(count - 1).textContent()) ?? '';
  }

  /** Get all messages currently in the DOM */
  async getAllMessages(): Promise<ConversationEntry[]> {
    return [...this.conversation];
  }

  /** Save conversation log to JSON file */
  async saveConversationLog(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const log = {
      scenario: path.basename(filePath, '.json'),
      timestamp: new Date().toISOString(),
      messages: this.conversation,
    };

    fs.writeFileSync(filePath, JSON.stringify(log, null, 2));
  }

  /** Wait for a specific tool call to appear */
  async waitForToolCall(toolName: string): Promise<void> {
    await this.page.locator(`[data-tool-name="${toolName}"]`).first().waitFor({
      state: 'visible',
      timeout: 60_000,
    });
  }

  /** Check if the page is connected (WebSocket) */
  async waitForConnection(): Promise<void> {
    // Wait for the connection indicator to show connected state (bg-halo-green-light)
    await this.page.waitForFunction(() => {
      const el = document.querySelector('[class*="halo-green"]');
      return !!el;
    }, { timeout: 30_000 });
  }
}
