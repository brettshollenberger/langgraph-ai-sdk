import { ChatAnthropic } from "@langchain/anthropic";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  type LLMAppConfig,
  type LLMConfig,
  type APIConfig,
  type LocalConfig,
  type LLMSkill,
  type LLMSpeed,
  type LLMCost,
  type ILLMManager,
  LLMNames,
} from "./types";

// API Keys
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!anthropicApiKey) {
  throw new Error("Anthropic API key (ANTHROPIC_API_KEY) is missing!");
}

// Individual Model Configurations
const HaikuConfig: APIConfig = {
  provider: "anthropic",
  model: "Haiku",
  modelCard: LLMNames.Haiku,
  temperature: 0,
  maxTokens: 180_000,
  apiKey: anthropicApiKey,
}

const SonnetConfig: APIConfig = {
  provider: "anthropic",
  model: "Sonnet",
  modelCard: LLMNames.Sonnet,
  temperature: 0,
  maxTokens: 180_000,
  apiKey: anthropicApiKey,
}

const GptOssConfig: LocalConfig = {
  provider: "ollama",
  model: "GptOss",
  modelCard: LLMNames.GptOss,
  temperature: 0,
  maxTokens: 128_000,
}

// Environment-specific configurations
const freeSlowConfig = {
  planning: SonnetConfig,
  writing: HaikuConfig,
  coding: SonnetConfig,
  reasoning: HaikuConfig,
};

const freeFastConfig = {
  planning: HaikuConfig,
  writing: HaikuConfig,
  coding: HaikuConfig,
  reasoning: HaikuConfig,
};

const paidSlowConfig = {
  planning: HaikuConfig,
  writing: HaikuConfig,
  coding: SonnetConfig,
  reasoning: SonnetConfig,
};

const paidFastConfig = {
  planning: SonnetConfig,
  writing: SonnetConfig,
  coding: SonnetConfig,
  reasoning: SonnetConfig,
};

export const coreLLMConfig: LLMAppConfig = {
  "free": {
    "fast": freeFastConfig,
    "slow": freeSlowConfig,
  },
  "paid": {
    "fast": paidFastConfig,
    "slow": paidSlowConfig,
  },
};

// Type guard for API configs
function hasApiKey(config: LLMConfig): config is APIConfig {
  return 'apiKey' in config;
}
class LLMManager implements ILLMManager {
  private llmInstances: Partial<Record<string, BaseChatModel>> = {};

  get(llmSkill: LLMSkill, llmSpeed: LLMSpeed, llmCost: LLMCost): BaseChatModel {
    const cacheKey = `${llmSkill}-${llmSpeed}-${llmCost}`;

    // Return cached instance if available
    if (this.llmInstances[cacheKey]) {
      return this.llmInstances[cacheKey]!;
    }

    console.log(`Initializing LLM for skill: ${llmSkill}, speed: ${llmSpeed} using ${llmCost} tier.`);

    // Get the specific config for the requested skill, speed, and tier
    const speedConfig = coreLLMConfig[llmCost]?.[llmSpeed];
    if (!speedConfig) {
      throw new Error(`LLM configuration not found for tier '${llmCost}' and speed '${llmSpeed}'.`);
    }

    const config: LLMConfig | undefined = speedConfig[llmSkill];
    if (!config) {
      throw new Error(`LLM configuration not found for skill '${llmSkill}' within tier '${llmCost}' and speed '${llmSpeed}'.`);
    }

    let modelInstance: BaseChatModel;

    // Instantiate based on provider
    switch (config.provider) {
      case "anthropic":
        if (!hasApiKey(config)) {
          throw new Error("Anthropic API key (ANTHROPIC_API_KEY) is missing!");
        }
        modelInstance = new ChatAnthropic({
          apiKey: config.apiKey,
          model: config.modelCard,
          temperature: config.temperature,
        });
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }

    this.llmInstances[cacheKey] = modelInstance;
    return modelInstance;
  }
}

/**
 * Get a core LLM instance based on skill and speed
 * This is used for development and production environments with real LLM providers
 */
export function getCoreLLM(
  llmSkill: LLMSkill,
  llmSpeed: LLMSpeed,
  llmCost: LLMCost = "free"
): BaseChatModel {
  return new LLMManager().get(llmSkill, llmSpeed, llmCost);
}
