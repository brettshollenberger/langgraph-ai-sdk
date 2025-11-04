import { v7 } from "uuid";
import { AIMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { ChatAnthropic } from "@langchain/anthropic";
import { Annotation, END, START, StateGraph, messagesStateReducer } from "@langchain/langgraph";
import { StructuredOutputParser } from "@langchain/core/output_parsers";

//#region src/testing/node/withContext.ts
const nodeContext = new AsyncLocalStorage();
function getNodeContext() {
	return nodeContext.getStore();
}
/**
* Wraps a node function with context that includes node name and graph name
* The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
*/
const withContext = (nodeFunction, options) => {
	return (state, config) => {
		const nodeName = config?.metadata?.langgraph_node;
		const graphName = config?.context?.graphName;
		return nodeContext.run({
			name: nodeName,
			graphName
		}, () => {
			return nodeFunction(state, config);
		});
	};
};

//#endregion
//#region src/testing/llm/types.ts
const LLMNames = {
	Haiku: "claude-haiku-4-5",
	Sonnet: "claude-sonnet-4-5",
	GptOss: "gpt-oss:20b",
	GeminiFlash: "gemini-1.5-flash-latest",
	LlamaInstant: "llama-3.1-8b-instant",
	Fake: "fake"
};
const temperatureSchema = z.number().min(0).max(1);

//#endregion
//#region src/testing/llm/test.ts
var StructuredOutputAwareFakeModel = class extends FakeListChatModel {
	useStructuredOutput = false;
	withStructuredOutput(schema, config) {
		const clone = Object.create(Object.getPrototypeOf(this));
		Object.assign(clone, this);
		clone.useStructuredOutput = true;
		return clone;
	}
	async invoke(input, options) {
		const response = await super.invoke(input, options);
		if (this.useStructuredOutput && typeof response.content === "string") {
			const stripped = response.content.replace(/```json\n?/g, "").replace(/```/g, "").trim();
			try {
				return JSON.parse(stripped);
			} catch (e) {
				return response.content;
			}
		}
		return response;
	}
};
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
		return new StructuredOutputAwareFakeModel({ responses: graphResponses[nodeName] });
	}
};
const manager = new TestLLMManager();
/**
* Convert a response value to a string format suitable for FakeListChatModel
* - Objects are converted to ```json ... ``` format
* - Strings are returned as-is
*/
function normalizeResponse(response) {
	if (typeof response === "string") return response;
	return `\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``;
}
/**
* Configure mock responses for specific nodes in test environment
* Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
*
* Supports both string responses and object responses:
* - Strings are used as-is
* - Objects are automatically converted to ```json ... ``` format
*
* @example
* configureResponses({
*   "thread-123": {
*     nameProjectNode: ["project-paris"],
*     // Both formats work:
*     responseNode: [{ intro: 'It just works', examples: ['ex1'], conclusion: 'Done' }]
*     // Or: responseNode: ["```json { \"intro\": \"It just works\" }```"]
*   },
*   "thread-456": {
*     nameProjectNode: ["project-london"],
*     responseNode: [{ intro: 'Also works' }]
*   }
* })
*/
function configureResponses$1(responses) {
	const normalizedResponses = {};
	for (const [graphName, graphResponses] of Object.entries(responses)) {
		normalizedResponses[graphName] = {};
		for (const [nodeName, nodeResponses] of Object.entries(graphResponses)) normalizedResponses[graphName][nodeName] = nodeResponses.map(normalizeResponse);
	}
	manager.responses = normalizedResponses;
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
* Get a test LLM instance (StructuredOutputAwareFakeModel) based on the current node context
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
const LLM_SKILL_DEFAULT = "writing";
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
function getLLM(llmSkill = LLM_SKILL_DEFAULT, llmSpeed = LLM_SPEED_DEFAULT, llmCost = LLM_COST_DEFAULT) {
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
//#region src/testing/node/withErrorHandling.ts
const preconfiguredReporters = { console: (error) => console.error(error) };
var Reporters = class {
	reporters = [];
	addReporter(reporter) {
		if (typeof reporter === "string") {
			if (!preconfiguredReporters[reporter]) throw new Error(`Reporter ${reporter} not found`);
			this.reporters.push(preconfiguredReporters[reporter]);
		} else this.reporters.push(reporter);
		return this;
	}
	list() {
		return this.reporters;
	}
	report(error) {
		this.reporters.forEach((reporter) => reporter(error));
	}
};
const ErrorReporters = new Reporters();
/**
* Wraps a node function with error handling
*/
const withErrorHandling = (nodeFunction, options) => {
	return async (state, config) => {
		try {
			return await nodeFunction(state, config);
		} catch (error) {
			console.log(`caught error`);
			ErrorReporters.report(error);
			throw error;
		}
	};
};

//#endregion
//#region src/testing/node/withNotifications.ts
function notify(taskName, config, task) {
	if (!task || !config?.writer) return;
	if (!task.id) task.id = v7();
	config.writer({
		id: task.id,
		event: taskName,
		task
	});
}
/**
* Wraps a node function with error handling
*/
const withNotifications = (nodeFunction, options) => {
	return async (state, config) => {
		console.log("notify");
		const defaultName = getNodeContext()?.name;
		const task = { title: typeof options?.taskName === "function" ? await options.taskName(state, config) : typeof options?.taskName === "string" ? options.taskName : defaultName };
		try {
			notify("NOTIFY_TASK_START", config, task);
			const result = await nodeFunction(state, config);
			notify("NOTIFY_TASK_COMPLETE", config, task);
			return result;
		} catch (error) {
			notify("NOTIFY_TASK_ERROR", config, task);
			throw error;
		}
	};
};

//#endregion
//#region src/testing/node/nodeMiddlewareFactory.ts
var NodeMiddlewareFactory = class {
	middlewares;
	constructor() {
		this.middlewares = {};
	}
	addMiddleware(name, middleware) {
		this.middlewares[name] = middleware;
		return this;
	}
	use(config = {}, node) {
		return this.getMiddlewaresToApply(config).reduceRight((wrappedNode, [name, middleware]) => {
			const middlewareConfig = config[name];
			return middleware(wrappedNode, middlewareConfig);
		}, node);
	}
	getMiddlewaresToApply(config) {
		const allNames = Object.keys(this.middlewares);
		let selectedNames = allNames;
		if (config.only) selectedNames = allNames.filter((name) => config.only.includes(name));
		if (config.except) selectedNames = selectedNames.filter((name) => !config.except.includes(name));
		return selectedNames.map((name) => [name, this.middlewares[name]]);
	}
};

//#endregion
//#region src/testing/node/nodeMiddleware.ts
const _nodeMiddleware = new NodeMiddlewareFactory().addMiddleware("context", withContext).addMiddleware("notifications", withNotifications).addMiddleware("errorHandling", withErrorHandling);
const NodeMiddleware = _nodeMiddleware;

//#endregion
//#region src/testing/graphs/types.ts
/**
* Schema for structured messages with intro, examples, and conclusion
*/
const structuredMessageSchema = z.object({
	intro: z.string().describe("Introduction to the response"),
	examples: z.array(z.string()).describe("List of examples"),
	conclusion: z.string().describe("Conclusion of the response")
});
/**
* Schema for simple text messages
*/
const simpleMessageSchema = z.object({ content: z.string().describe("Content of the message") });
/**
* Union schema allowing either simple or structured messages
*/
const sampleMessageSchema = z.union([simpleMessageSchema, structuredMessageSchema]);
/**
* Graph state annotation for the sample graph
*/
const SampleGraphAnnotation = Annotation.Root({
	messages: Annotation({
		default: () => [],
		reducer: messagesStateReducer
	}),
	projectName: Annotation({
		default: () => void 0,
		reducer: (curr, next) => next ?? curr
	})
});

//#endregion
//#region src/testing/graphs/sampleGraph.ts
/**
* Node that generates a project name based on the user's message
* Only runs if projectName is not already set in state
*/
const nameProjectNode = NodeMiddleware.use({ notifications: { taskName: "Name Project" } }, async (state, config) => {
	if (state.projectName) return {};
	const userMessage = state.messages.find((m) => m._getType() === "human");
	if (!userMessage) return {};
	const prompt = `Based on this user message, generate a short, catchy project name (2-4 words max):

"${userMessage.content}"

Return ONLY the project name, nothing else.`;
	const schema = z.object({ projectName: z.string().describe("Project name") });
	let projectName;
	const llm = getLLM();
	try {
		projectName = (await llm.withStructuredOutput(schema).invoke(prompt)).projectName;
	} catch (e) {
		console.error(`failed to name project: ${e}`);
		return {};
	}
	return { projectName };
});
/**
* Node that generates a response to the user's message
* Uses the messageSchema to return either simple or structured messages
* Tagged with 'notify' for streaming support
*/
const responseNode = NodeMiddleware.use({ notifications: { taskName: "Generate Response" } }, async (state, config) => {
	const userPrompt = state.messages[state.messages.length - 1];
	if (!userPrompt) throw new Error("Need user prompt");
	const projectContext = state.projectName ? `Project: "${state.projectName}"\n\n` : "";
	const parser = StructuredOutputParser.fromZodSchema(sampleMessageSchema);
	const prompt = `${projectContext}
    <task>
      Answer the user's question
    </task>

    <message-history>
      ${state.messages.map((m) => {
		return `<role>${m.getType()}</role><content>${m.content}</content>`;
	}).join("\n")}
    </message-history>

    <question>
      ${userPrompt.content}
    </question>

    <choose>
      Choose whichever output format you think is most appropriate, given
      the answer you are about to provide.
    </choose>

    <output>
      ${parser.getFormatInstructions()}
    </output>
  `;
	const rawMessage = await getLLM().withConfig({ tags: ["notify"] }).invoke(prompt);
	let content = typeof rawMessage.content === "string" ? rawMessage.content : "";
	content = content.replace(/```json/g, "").replace(/```/g, "").trim();
	let structured;
	try {
		structured = sampleMessageSchema.parse(JSON.parse(content));
	} catch (e) {
		structured = { content: "I apologize, I had trouble formatting my response properly." };
	}
	return { messages: [new AIMessage({
		content,
		response_metadata: structured
	})] };
});
/**
* Creates a compiled sample graph with the given checkpointer
*
* Graph flow: START → nameProjectNode → responseNode → END
*
* @param checkpointer - Optional checkpointer for state persistence
* @param graphName - Name to identify the graph (default: 'sample')
* @returns Compiled LangGraph
*/
function createSampleGraph(checkpointer, graphName = "sample") {
	return new StateGraph(SampleGraphAnnotation).addNode("nameProjectNode", nameProjectNode).addNode("responseNode", responseNode).addEdge(START, "nameProjectNode").addEdge("nameProjectNode", "responseNode").addEdge("responseNode", END).compile({
		checkpointer,
		name: graphName
	});
}

//#endregion
export { ErrorReporters, NodeMiddleware, NodeMiddlewareFactory, SampleGraphAnnotation, configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, createSampleGraph, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, nameProjectNode, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, responseNode, sampleMessageSchema, simpleMessageSchema, structuredMessageSchema, withContext, withErrorHandling, withNotifications };