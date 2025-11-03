import { z } from "zod";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type ValueOf } from "type-fest";

// LLM Providers
export const LLMProviders = ["anthropic", "ollama", "openai", "groq", "google", "fake"] as const;
export type LLMProvider = typeof LLMProviders[number];

// LLM Speeds
export const LLMSpeeds = ["fast", "slow"] as const;
export type LLMSpeed = typeof LLMSpeeds[number];

// LLM Costs
export const LLMCosts = ["free", "paid"] as const;
export type LLMCost = typeof LLMCosts[number];

// LLM Model Names
export const LLMNames = {
    Haiku: "claude-4-5-haiku-latest" as const,
    Sonnet: "claude-4-5-sonnet-latest" as const,
    GptOss: "gpt-oss:20b" as const,
    GeminiFlash: "gemini-1.5-flash-latest" as const,
    LlamaInstant: "llama-3.1-8b-instant" as const,
    Fake: "fake" as const, // For testing
}
export type LLMName = keyof typeof LLMNames;
export type LLMModelCard = ValueOf<typeof LLMNames>;

// Temperature
export const temperatureSchema = z.number().min(0).max(1);
export type Temperature = z.infer<typeof temperatureSchema>;

// LLM Skills
export const LLMSkills = ["planning", "writing", "coding", "reasoning"] as const;
export type LLMSkill = typeof LLMSkills[number];

// Base Config Interfaces
export interface LocalConfig {
  provider: LLMProvider;
  model: LLMName;
  modelCard: LLMModelCard;
  temperature: Temperature;
  tags?: string[];
  maxTokens: number;
}

export interface APIConfig extends LocalConfig {
  apiKey: string;
}

// Union type for all configs
export type LLMConfig = APIConfig | LocalConfig;

// Environment Configuration
export interface LLMsConfig {
  planning: LLMConfig;
  writing: LLMConfig;
  coding: LLMConfig;
  reasoning: LLMConfig;
}

export interface LLMAppConfig {
  "free": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
  "paid": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
}

// Test Configuration Types
// graphName is extracted from config.configurable.thread_id or config.configurable.checkpoint_ns
export interface MockResponses {
  [graphName: string]: {
    [nodeName: string]: string[];
  };
}

// Cache Policy
export type CachePolicy = {
    ttl: number;
    keyFunc: (args: unknown[]) => string;
}
export interface ILLMManager {
  get(llmSkill: LLMSkill, llmSpeed: LLMSpeed, llmCost: LLMCost): BaseChatModel;
}