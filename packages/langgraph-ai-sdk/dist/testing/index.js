import { z } from "zod";
import "@langchain/core/language_models/chat_models";
import "type-fest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { ChatAnthropic } from "@langchain/anthropic";

//#region src/testing/llm/types.ts
const LLMNames = {
	Haiku: "claude-4-5-haiku-latest",
	Sonnet: "claude-4-5-sonnet-latest",
	GptOss: "gpt-oss:20b",
	GeminiFlash: "gemini-1.5-flash-latest",
	LlamaInstant: "llama-3.1-8b-instant",
	Fake: "fake"
};
const temperatureSchema = z.number().min(0).max(1);

//#endregion
//#region src/testing/node/withContext.ts
const nodeContext = new AsyncLocalStorage();
function getNodeContext() {
	return nodeContext.getStore();
}
/**
* Wraps a node function with context that includes node name and graph name
* The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
*/
const withContext = (nodeFunction) => {
	return (state, config) => {
		const nodeName = config?.metadata?.langgraph_node;
		const graphName = config?.configurable?.thread_id || config?.configurable?.checkpoint_ns;
		return nodeContext.run({
			name: nodeName,
			graphName
		}, () => {
			return nodeFunction(state, config);
		});
	};
};

//#endregion
//#region src/testing/llm/test.ts
const FakeConfig = {
	provider: "fake",
	model: "Fake",
	modelCard: LLMNames.Fake,
	temperature: 0,
	maxTokens: 128e3
};
var TestLLMManager = class {
	responses = {};
	get(...args) {
		const nodeContext$1 = getNodeContext();
		const graphName = nodeContext$1?.graphName;
		const nodeName = nodeContext$1?.name;
		if (!graphName || !nodeName) throw new Error("Graph name or node name is missing! Cannot get test LLM without proper context.");
		const graphResponses = this.responses[graphName];
		if (!graphResponses || !graphResponses[nodeName]) throw new Error("No responses configured for this graph/node combination.");
		return new FakeListChatModel({ responses: graphResponses[nodeName] });
	}
};
const manager = new TestLLMManager();
/**
* Configure mock responses for specific nodes in test environment
* Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
*
* @example
* configureResponses({
*   "thread-123": {
*     nameProjectNode: ["project-paris"],
*     responseNode: ["```json { intro: 'It just works' }```"]
*   },
*   "thread-456": {
*     nameProjectNode: ["project-london"],
*     responseNode: ["```json { intro: 'Also works' }```"]
*   }
* })
*/
function configureResponses$1(responses) {
	manager.responses = responses;
}
/**
* Reset all configured responses
* Useful in afterEach hooks to clean up test state
*
* @example
* afterEach(() => {
*   resetLLMConfig();
* });
*/
function resetLLMConfig$1() {
	manager.responses = {};
}
/**
* Get a test LLM instance (FakeListChatModel) based on the current node context
* Returns null if no responses are configured for the current graph/node combination,
* allowing the main getLLM function to fall back to core LLM
*/
function getTestLLM(...args) {
	return manager.get(...args);
}
/**
* Check if test responses are configured for a specific graph and node
* Useful for conditional test logic
*/
function hasConfiguredResponses(graphName, nodeName) {
	return !!manager.responses[graphName]?.[nodeName];
}

//#endregion
//#region src/testing/llm/core.ts
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicApiKey) throw new Error("Anthropic API key (ANTHROPIC_API_KEY) is missing!");
const HaikuConfig = {
	provider: "anthropic",
	model: "Haiku",
	modelCard: LLMNames.Haiku,
	temperature: 0,
	maxTokens: 18e4,
	apiKey: anthropicApiKey
};
const SonnetConfig = {
	provider: "anthropic",
	model: "Sonnet",
	modelCard: LLMNames.Sonnet,
	temperature: 0,
	maxTokens: 18e4,
	apiKey: anthropicApiKey
};
LLMNames.GptOss;
const freeSlowConfig = {
	planning: SonnetConfig,
	writing: HaikuConfig,
	coding: SonnetConfig,
	reasoning: HaikuConfig
};
const freeFastConfig = {
	planning: HaikuConfig,
	writing: HaikuConfig,
	coding: HaikuConfig,
	reasoning: HaikuConfig
};
const paidSlowConfig = {
	planning: HaikuConfig,
	writing: HaikuConfig,
	coding: SonnetConfig,
	reasoning: SonnetConfig
};
const paidFastConfig = {
	planning: SonnetConfig,
	writing: SonnetConfig,
	coding: SonnetConfig,
	reasoning: SonnetConfig
};
const coreLLMConfig = {
	"free": {
		"fast": freeFastConfig,
		"slow": freeSlowConfig
	},
	"paid": {
		"fast": paidFastConfig,
		"slow": paidSlowConfig
	}
};
function hasApiKey(config) {
	return "apiKey" in config;
}
var LLMManager = class {
	llmInstances = {};
	get(llmSkill, llmSpeed, llmCost) {
		const cacheKey = `${llmSkill}-${llmSpeed}-${llmCost}`;
		if (this.llmInstances[cacheKey]) return this.llmInstances[cacheKey];
		console.log(`Initializing LLM for skill: ${llmSkill}, speed: ${llmSpeed} using ${llmCost} tier.`);
		const speedConfig = coreLLMConfig[llmCost]?.[llmSpeed];
		if (!speedConfig) throw new Error(`LLM configuration not found for tier '${llmCost}' and speed '${llmSpeed}'.`);
		const config = speedConfig[llmSkill];
		if (!config) throw new Error(`LLM configuration not found for skill '${llmSkill}' within tier '${llmCost}' and speed '${llmSpeed}'.`);
		let modelInstance;
		switch (config.provider) {
			case "anthropic":
				if (!hasApiKey(config)) throw new Error("Anthropic API key (ANTHROPIC_API_KEY) is missing!");
				modelInstance = new ChatAnthropic({
					apiKey: config.apiKey,
					model: config.modelCard,
					temperature: config.temperature
				});
				break;
			default: throw new Error(`Unsupported LLM provider: ${config.provider}`);
		}
		this.llmInstances[cacheKey] = modelInstance;
		return modelInstance;
	}
};
/**
* Get a core LLM instance based on skill and speed
* This is used for development and production environments with real LLM providers
*/
function getCoreLLM(llmSkill, llmSpeed, llmCost = "free") {
	return new LLMManager().get(llmSkill, llmSpeed, llmCost);
}

//#endregion
//#region src/testing/llm/llm.ts
const isTestEnvironment = process.env.NODE_ENV === "test";
const LLM_SPEED_DEFAULT = process.env.LLM_SPEED === "fast" ? "fast" : "slow";
const LLM_COST_DEFAULT = process.env.LLM_COST === "paid" ? "paid" : "free";
/**
* Get an LLM instance based on the current environment
*
* Behavior:
* - In test environment (NODE_ENV=test):
*   - If mock responses are configured for the current graph/node: Returns FakeListChatModel
*   - If no mock responses are configured: Falls back to core LLM (real implementation)
* - In development/production: Always returns core LLM instances (Anthropic, Ollama, etc.)
*
* This fallback behavior allows you to:
* 1. Mock specific nodes in tests while using real LLMs for others
* 2. Run tests without mocking everything upfront
* 3. Gradually add mocks as needed
*
* @param llmSkill - The skill needed (planning, writing, coding, reasoning)
* @param llmSpeed - Speed preference (fast or slow), defaults to LLM_SPEED env var
* @returns BaseChatModel instance
*/
function getLLM(llmSkill, llmSpeed = LLM_SPEED_DEFAULT, llmCost = LLM_COST_DEFAULT) {
	const nodeContext$1 = getNodeContext();
	const graphName = nodeContext$1?.graphName;
	const nodeName = nodeContext$1?.name;
	if (!graphName) throw new Error("No graph name found in context, configure it with .config({name: 'my-graph-name'})");
	if (isTestEnvironment && hasConfiguredResponses(graphName, nodeName)) return getTestLLM(llmSkill, llmSpeed, llmCost);
	return getCoreLLM(llmSkill, llmSpeed, llmCost);
}
/**
* Configure mock responses for test environment
* Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
*
* @example
* configureResponses({
*   "thread-123": {
*     nameProjectNode: ["project-paris"],
*     responseNode: ["```json { intro: 'It just works' }```"]
*   }
* })
*/
const configureResponses = configureResponses$1;
/**
* Reset all configured mock responses
* Use this in afterEach hooks to clean up test state
*
* @example
* afterEach(() => {
*   resetLLMConfig();
* });
*/
const resetLLMConfig = resetLLMConfig$1;

//#endregion
export { configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, withContext };