import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { env } from "./env.js";

/**
 * Resolution order:
 *   1. OPENROUTER_API_KEY — routes via OpenRouter (OpenAI-compatible API).
 *   2. ANTHROPIC_API_KEY  — direct Anthropic.
 *   3. OPENAI_API_KEY     — direct OpenAI.
 *
 * OpenRouter is preferred first when set because it's usually an explicit
 * opt-in (users set it to pick a specific routed model).
 */
export function getLLM(): BaseChatModel {
  if (env.OPENROUTER_API_KEY) {
    return new ChatOpenAI({
      model: env.OPENROUTER_MODEL,
      temperature: 0,
      apiKey: env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: env.OPENROUTER_BASE_URL,
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/solana-trading-bot",
          "X-Title": "Solana Trading Bot",
        },
      },
    });
  }

  if (env.ANTHROPIC_API_KEY) {
    return new ChatAnthropic({
      model: "claude-opus-4-7",
      temperature: 0,
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }

  return new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
    apiKey: env.OPENAI_API_KEY!,
  });
}
