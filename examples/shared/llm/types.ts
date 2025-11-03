import { z } from "zod";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ChatAnthropic } from "@langchain/anthropic";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type ValueOf } from "type-fest";
import { getNodeContext } from "../node/withContext.js";

export const LLMProviders = ["anthropic", "fake"] as const;
export type LLMProvider = typeof LLMProviders[number];

export const LLMSpeeds = ["fast", "slow"] as const;
export type LLMSpeed = typeof LLMSpeeds[number];

export const LLMCosts = ["free", "paid"] as const;
export type LLMCost = typeof LLMCosts[number];

export const LLMNames = {
    Haiku: "claude-4-5-haiku-latest" as const,
    Sonnet: "claude-4-5-sonnet-latest" as const,
    Fake: "fake" as const,
}
export type LLMName = keyof typeof LLMNames;
export type LLMModelCard = ValueOf<typeof LLMNames>;

export const temperatureSchema = z.number().min(0).max(1);
export type Temperature = z.infer<typeof temperatureSchema>;

export interface LocalConfig {
  provider: LLMProvider;
  model: LLMName;
  modelCard: LLMModelCard;
  temperature: Temperature;
  tags?: string[];
  maxTokens: number;
}

interface APIConfig extends LocalConfig {
  apiKey: string;
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!anthropicApiKey) {
  throw new Error("Anthropic API key (ANTHROPIC_API_KEY) is missing!");
}

interface AnthropicConfig extends APIConfig {
  provider: "anthropic";
}

interface FakeConfig extends LocalConfig {
  provider: "fake";
}

type LLMConfig = AnthropicConfig | FakeConfig;

const HaikuConfig: AnthropicConfig = {
  provider: "anthropic",
  model: "Haiku",
  modelCard: LLMNames.Haiku,
  temperature: 0,
  maxTokens: 180_000,
  apiKey: anthropicApiKey,
}

const SonnetConfig: AnthropicConfig = {
  provider: "anthropic",
  model: "Sonnet",
  modelCard: LLMNames.Sonnet,
  temperature: 0,
  maxTokens: 180_000,
  apiKey: anthropicApiKey,
}

export const FreeConfig: FakeConfig = {
  provider: "fake",
  model: "Fake",
  modelCard: LLMNames.Fake,
  temperature: 0,
  maxTokens: 128_000,
}

export const configuredModels: LLMConfig[] = [HaikuConfig, SonnetConfig, FreeConfig];

interface LLMsConfig {
  planning: LLMConfig;
  writing: LLMConfig;
  coding: LLMConfig;
  reasoning: LLMConfig;
}

interface LLMAppConfig {
  "free": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
  "paid": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
}

export const LLMSkills = ["planning", "writing", "coding", "reasoning"] as const;
export type LLMSkill = typeof LLMSkills[number];

const freeSlowConfig: LLMsConfig = {
  planning: SonnetConfig,
  writing: HaikuConfig,
  coding: SonnetConfig,
  reasoning: HaikuConfig,
};

const freeFastConfig: LLMsConfig = {
  planning: HaikuConfig,
  writing: HaikuConfig,
  coding: HaikuConfig,
  reasoning: HaikuConfig,
};

const paidSlowConfig: LLMsConfig = {
  planning: HaikuConfig,
  writing: HaikuConfig,
  coding: SonnetConfig,
  reasoning: SonnetConfig,
};

const paidFastConfig: LLMsConfig = {
  planning: SonnetConfig,
  writing: SonnetConfig,
  coding: SonnetConfig,
  reasoning: SonnetConfig,
};

export const llmConfig: LLMAppConfig = {
  "free": {
    "fast": freeFastConfig,
    "slow": freeSlowConfig,
  },
  "paid": {
    "fast": paidFastConfig,
    "slow": paidSlowConfig,
  },
};

const llmPaid= process.env.LLM_PAID || "free";

const llmInstances: Partial<Record<string, BaseChatModel>> = {}; // Key format: "skill-speed"

// Lazy getter for the LLM instance, configurable via environment variables
const LLM_SPEED_DEFAULT = (process.env.LLM_SPEED === 'fast') ? "fast" : "slow";

// const nodeName = config?.metadata?.langgraph_node;
class LLMManager {
    responses: Record<string, string[]> = {};
}
const manager = new LLMManager();

function hasApiKey(config: LLMConfig): config is APIConfig & { provider: LLMProvider } {
  return 'apiKey' in config;
}

export function configureResponses(responses: Record<string, string[]>) {
    manager.responses = responses;
}

// getLLM ... consider which node is calling!
export function getLlm(
  llmSkill: LLMSkill,
  llmSpeed: LLMSpeed = LLM_SPEED_DEFAULT
): BaseChatModel {
  const llmPaidKey = (process.env.LLM_PAID === 'paid' ? "paid" : "free");

  console.log(`Initializing LLM for skill: ${llmSkill}, speed: ${llmSpeed} using ${llmPaidKey} tier.`);
  // Get the specific config for the requested skill, speed, and determined tier
  const speedConfig = llmConfig[llmPaidKey]?.[llmSpeed];
  if (!speedConfig) {
    throw new Error(`LLM configuration not found for tier '${llmPaidKey}' and speed '${llmSpeed}'.`);
  }
  const config: LLMConfig | undefined = speedConfig[llmSkill];
  if (!config) {
    throw new Error(`LLM configuration not found for skill '${llmSkill}' within tier '${llmPaidKey}' and speed '${llmSpeed}'.`);
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
        model: config.model,
        temperature: config.temperature,
      });
      break;
    case "fake":
      const nodeContext = getNodeContext();
      const nodeName = nodeContext?.name;
      if (!nodeName) {
        throw new Error("Node name is missing!");
      }
      if (!manager.responses[nodeName]) {
        throw new Error(`Must configure responses for node ${nodeName}`);
      }
      modelInstance = new FakeListChatModel({
        responses: manager.responses[nodeName],
      });
      break;
    default:
      throw new Error(`Unsupported LLM provider`);
  }

  return modelInstance;
}