import { r as __toESM, t as __commonJS } from "../chunk-DUEDWNxO.js";
import { v7 } from "uuid";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { ChatAnthropic } from "@langchain/anthropic";
import { Annotation, END, START, StateGraph, messagesStateReducer } from "@langchain/langgraph";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { readFile, writeFile } from "fs/promises";

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
				return {
					raw: response,
					parsed: JSON.parse(stripped)
				};
			} catch (e) {
				return {
					raw: response,
					parsed: response.content
				};
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
const NodeMiddleware = new NodeMiddlewareFactory().addMiddleware("context", withContext).addMiddleware("notifications", withNotifications).addMiddleware("errorHandling", withErrorHandling);

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
//#region ../../node_modules/.pnpm/fast-json-stable-stringify@2.1.0/node_modules/fast-json-stable-stringify/index.js
var require_fast_json_stable_stringify = /* @__PURE__ */ __commonJS({ "../../node_modules/.pnpm/fast-json-stable-stringify@2.1.0/node_modules/fast-json-stable-stringify/index.js": ((exports, module) => {
	module.exports = function(data, opts) {
		if (!opts) opts = {};
		if (typeof opts === "function") opts = { cmp: opts };
		var cycles = typeof opts.cycles === "boolean" ? opts.cycles : false;
		var cmp = opts.cmp && (function(f) {
			return function(node) {
				return function(a, b) {
					return f({
						key: a,
						value: node[a]
					}, {
						key: b,
						value: node[b]
					});
				};
			};
		})(opts.cmp);
		var seen = [];
		return (function stringify$1(node) {
			if (node && node.toJSON && typeof node.toJSON === "function") node = node.toJSON();
			if (node === void 0) return;
			if (typeof node == "number") return isFinite(node) ? "" + node : "null";
			if (typeof node !== "object") return JSON.stringify(node);
			var i, out;
			if (Array.isArray(node)) {
				out = "[";
				for (i = 0; i < node.length; i++) {
					if (i) out += ",";
					out += stringify$1(node[i]) || "null";
				}
				return out + "]";
			}
			if (node === null) return "null";
			if (seen.indexOf(node) !== -1) {
				if (cycles) return JSON.stringify("__cycle__");
				throw new TypeError("Converting circular structure to JSON");
			}
			var seenIndex = seen.push(node) - 1;
			var keys = Object.keys(node).sort(cmp && cmp(node));
			out = "";
			for (i = 0; i < keys.length; i++) {
				var key = keys[i];
				var value = stringify$1(node[key]);
				if (!value) continue;
				if (out) out += ",";
				out += JSON.stringify(key) + ":" + value;
			}
			seen.splice(seenIndex, 1);
			return "{" + out + "}";
		})(data);
	};
}) });

//#endregion
//#region src/testing/prompts/toJSON.ts
var import_fast_json_stable_stringify = /* @__PURE__ */ __toESM(require_fast_json_stable_stringify(), 1);
const toJSON = (data) => {
	return (0, import_fast_json_stable_stringify.default)(data);
};

//#endregion
//#region ../../node_modules/.pnpm/xml-parser-xo@4.1.5/node_modules/xml-parser-xo/dist/cjs/index.js
var require_cjs$1 = /* @__PURE__ */ __commonJS({ "../../node_modules/.pnpm/xml-parser-xo@4.1.5/node_modules/xml-parser-xo/dist/cjs/index.js": ((exports, module) => {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.ParsingError = void 0;
	var ParsingError = class extends Error {
		constructor(message, cause) {
			super(message);
			this.cause = cause;
		}
	};
	exports.ParsingError = ParsingError;
	let parsingState;
	function nextChild() {
		return element(false) || text() || comment() || cdata() || processingInstruction();
	}
	function nextRootChild() {
		match(/\s*/);
		return element(true) || comment() || doctype() || processingInstruction();
	}
	function parseDocument() {
		const declaration = processingInstruction();
		const children = [];
		let documentRootNode;
		let child = nextRootChild();
		while (child) {
			if (child.node.type === "Element") {
				if (documentRootNode) throw new Error("Found multiple root nodes");
				documentRootNode = child.node;
			}
			if (!child.excluded) children.push(child.node);
			child = nextRootChild();
		}
		if (!documentRootNode) throw new ParsingError("Failed to parse XML", "Root Element not found");
		if (parsingState.xml.length !== 0) throw new ParsingError("Failed to parse XML", "Not Well-Formed XML");
		return {
			declaration: declaration ? declaration.node : null,
			root: documentRootNode,
			children
		};
	}
	function processingInstruction() {
		const m = match(/^<\?([\w-:.]+)\s*/);
		if (!m) return;
		const node = {
			name: m[1],
			type: "ProcessingInstruction",
			content: ""
		};
		const endMarkerIndex = parsingState.xml.indexOf("?>");
		if (endMarkerIndex > -1) {
			node.content = parsingState.xml.substring(0, endMarkerIndex).trim();
			parsingState.xml = parsingState.xml.slice(endMarkerIndex);
		} else throw new ParsingError("Failed to parse XML", "ProcessingInstruction closing tag not found");
		match(/\?>/);
		return {
			excluded: parsingState.options.filter(node) === false,
			node
		};
	}
	function element(matchRoot) {
		const m = match(/^<([^?!</>\s]+)\s*/);
		if (!m) return;
		const node = {
			type: "Element",
			name: m[1],
			attributes: {},
			children: []
		};
		const excluded = matchRoot ? false : parsingState.options.filter(node) === false;
		while (!(eos() || is(">") || is("?>") || is("/>"))) {
			const attr = attribute();
			if (attr) node.attributes[attr.name] = attr.value;
			else return;
		}
		if (match(/^\s*\/>/)) {
			node.children = null;
			return {
				excluded,
				node
			};
		}
		match(/\??>/);
		let child = nextChild();
		while (child) {
			if (!child.excluded) node.children.push(child.node);
			child = nextChild();
		}
		if (parsingState.options.strictMode) {
			const closingTag = `</${node.name}>`;
			if (parsingState.xml.startsWith(closingTag)) parsingState.xml = parsingState.xml.slice(closingTag.length);
			else throw new ParsingError("Failed to parse XML", `Closing tag not matching "${closingTag}"`);
		} else match(/^<\/[\w-:.\u00C0-\u00FF]+\s*>/);
		return {
			excluded,
			node
		};
	}
	function doctype() {
		const m = match(/^<!DOCTYPE\s+\S+\s+SYSTEM[^>]*>/) || match(/^<!DOCTYPE\s+\S+\s+PUBLIC[^>]*>/) || match(/^<!DOCTYPE\s+\S+\s*\[[^\]]*]>/) || match(/^<!DOCTYPE\s+\S+\s*>/);
		if (m) {
			const node = {
				type: "DocumentType",
				content: m[0]
			};
			return {
				excluded: parsingState.options.filter(node) === false,
				node
			};
		}
	}
	function cdata() {
		if (parsingState.xml.startsWith("<![CDATA[")) {
			const endPositionStart = parsingState.xml.indexOf("]]>");
			if (endPositionStart > -1) {
				const endPositionFinish = endPositionStart + 3;
				const node = {
					type: "CDATA",
					content: parsingState.xml.substring(0, endPositionFinish)
				};
				parsingState.xml = parsingState.xml.slice(endPositionFinish);
				return {
					excluded: parsingState.options.filter(node) === false,
					node
				};
			}
		}
	}
	function comment() {
		const m = match(/^<!--[\s\S]*?-->/);
		if (m) {
			const node = {
				type: "Comment",
				content: m[0]
			};
			return {
				excluded: parsingState.options.filter(node) === false,
				node
			};
		}
	}
	function text() {
		const m = match(/^([^<]+)/);
		if (m) {
			const node = {
				type: "Text",
				content: m[1]
			};
			return {
				excluded: parsingState.options.filter(node) === false,
				node
			};
		}
	}
	function attribute() {
		const m = match(/([^=]+)\s*=\s*("[^"]*"|'[^']*'|[^>\s]+)\s*/);
		if (m) return {
			name: m[1].trim(),
			value: stripQuotes(m[2].trim())
		};
	}
	function stripQuotes(val) {
		return val.replace(/^['"]|['"]$/g, "");
	}
	/**
	* Match `re` and advance the string.
	*/
	function match(re) {
		const m = parsingState.xml.match(re);
		if (m) {
			parsingState.xml = parsingState.xml.slice(m[0].length);
			return m;
		}
	}
	/**
	* End-of-source.
	*/
	function eos() {
		return 0 === parsingState.xml.length;
	}
	/**
	* Check for `prefix`.
	*/
	function is(prefix) {
		return 0 === parsingState.xml.indexOf(prefix);
	}
	/**
	* Parse the given XML string into an object.
	*/
	function parseXml(xml, options = {}) {
		xml = xml.trim();
		const filter = options.filter || (() => true);
		parsingState = {
			xml,
			options: Object.assign(Object.assign({}, options), {
				filter,
				strictMode: options.strictMode === true
			})
		};
		return parseDocument();
	}
	if (typeof module !== "undefined" && typeof exports === "object") module.exports = parseXml;
	exports.default = parseXml;
}) });

//#endregion
//#region ../../node_modules/.pnpm/xml-formatter@3.6.7/node_modules/xml-formatter/dist/cjs/index.js
var require_cjs = /* @__PURE__ */ __commonJS({ "../../node_modules/.pnpm/xml-formatter@3.6.7/node_modules/xml-formatter/dist/cjs/index.js": ((exports, module) => {
	var __importDefault = exports && exports.__importDefault || function(mod) {
		return mod && mod.__esModule ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	const xml_parser_xo_1 = __importDefault(require_cjs$1());
	function newLine(state) {
		if (!state.options.indentation && !state.options.lineSeparator) return;
		state.content += state.options.lineSeparator;
		let i;
		for (i = 0; i < state.level; i++) state.content += state.options.indentation;
	}
	function indent(state) {
		state.content = state.content.replace(/ +$/, "");
		let i;
		for (i = 0; i < state.level; i++) state.content += state.options.indentation;
	}
	function appendContent(state, content) {
		state.content += content;
	}
	function processNode(node, state, preserveSpace) {
		if (node.type === "Element") processElementNode(node, state, preserveSpace);
		else if (node.type === "ProcessingInstruction") processProcessingIntruction(node, state);
		else if (typeof node.content === "string") processContent(node.content, state, preserveSpace);
		else throw new Error("Unknown node type: " + node.type);
	}
	function processContent(content, state, preserveSpace) {
		if (!preserveSpace) {
			const trimmedContent = content.trim();
			if (state.options.lineSeparator) content = trimmedContent;
			else if (trimmedContent.length === 0) content = trimmedContent;
		}
		if (content.length > 0) {
			if (!preserveSpace && state.content.length > 0) newLine(state);
			appendContent(state, content);
		}
	}
	function isPathMatchingIgnoredPaths(path, ignoredPaths) {
		const fullPath = "/" + path.join("/");
		const pathLastPart = path[path.length - 1];
		return ignoredPaths.includes(pathLastPart) || ignoredPaths.includes(fullPath);
	}
	function processElementNode(node, state, preserveSpace) {
		state.path.push(node.name);
		if (!preserveSpace && state.content.length > 0) newLine(state);
		appendContent(state, "<" + node.name);
		processAttributes(state, node.attributes);
		if (node.children === null || state.options.forceSelfClosingEmptyTag && node.children.length === 0) appendContent(state, state.options.whiteSpaceAtEndOfSelfclosingTag ? " />" : "/>");
		else if (node.children.length === 0) appendContent(state, "></" + node.name + ">");
		else {
			const nodeChildren = node.children;
			appendContent(state, ">");
			state.level++;
			let nodePreserveSpace = node.attributes["xml:space"] === "preserve" || preserveSpace;
			let ignoredPath = false;
			if (!nodePreserveSpace && state.options.ignoredPaths) {
				ignoredPath = isPathMatchingIgnoredPaths(state.path, state.options.ignoredPaths);
				nodePreserveSpace = ignoredPath;
			}
			if (!nodePreserveSpace && state.options.collapseContent) {
				let containsTextNodes = false;
				let containsTextNodesWithLineBreaks = false;
				let containsNonTextNodes = false;
				nodeChildren.forEach(function(child, index) {
					if (child.type === "Text") {
						if (child.content.includes("\n")) {
							containsTextNodesWithLineBreaks = true;
							child.content = child.content.trim();
						} else if ((index === 0 || index === nodeChildren.length - 1) && !preserveSpace) {
							if (child.content.trim().length === 0) child.content = "";
						}
						if (child.content.trim().length > 0 || nodeChildren.length === 1) containsTextNodes = true;
					} else if (child.type === "CDATA") containsTextNodes = true;
					else containsNonTextNodes = true;
				});
				if (containsTextNodes && (!containsNonTextNodes || !containsTextNodesWithLineBreaks)) nodePreserveSpace = true;
			}
			nodeChildren.forEach(function(child) {
				processNode(child, state, preserveSpace || nodePreserveSpace);
			});
			state.level--;
			if (!preserveSpace && !nodePreserveSpace) newLine(state);
			if (ignoredPath) indent(state);
			appendContent(state, "</" + node.name + ">");
		}
		state.path.pop();
	}
	function processAttributes(state, attributes) {
		Object.keys(attributes).forEach(function(attr) {
			const escaped = attributes[attr].replace(/"/g, "&quot;");
			appendContent(state, " " + attr + "=\"" + escaped + "\"");
		});
	}
	function processProcessingIntruction(node, state) {
		if (state.content.length > 0) newLine(state);
		appendContent(state, "<?" + node.name);
		appendContent(state, " " + node.content.trim());
		appendContent(state, "?>");
	}
	/**
	* Converts the given XML into human readable format.
	*/
	function formatXml(xml, options = {}) {
		options.indentation = "indentation" in options ? options.indentation : "    ";
		options.collapseContent = options.collapseContent === true;
		options.lineSeparator = "lineSeparator" in options ? options.lineSeparator : "\r\n";
		options.whiteSpaceAtEndOfSelfclosingTag = options.whiteSpaceAtEndOfSelfclosingTag === true;
		options.throwOnFailure = options.throwOnFailure !== false;
		try {
			const parsedXml = (0, xml_parser_xo_1.default)(xml, {
				filter: options.filter,
				strictMode: options.strictMode
			});
			const state = {
				content: "",
				level: 0,
				options,
				path: []
			};
			if (parsedXml.declaration) processProcessingIntruction(parsedXml.declaration, state);
			parsedXml.children.forEach(function(child) {
				processNode(child, state, false);
			});
			if (!options.lineSeparator) return state.content;
			return state.content.replace(/\r\n/g, "\n").replace(/\n/g, options.lineSeparator);
		} catch (err) {
			if (options.throwOnFailure) throw err;
			return xml;
		}
	}
	formatXml.minify = (xml, options = {}) => {
		return formatXml(xml, Object.assign(Object.assign({}, options), {
			indentation: "",
			lineSeparator: ""
		}));
	};
	if (typeof module !== "undefined" && typeof exports === "object") module.exports = formatXml;
	exports.default = formatXml;
}) });

//#endregion
//#region src/testing/prompts/renderPrompt.ts
var import_cjs = /* @__PURE__ */ __toESM(require_cjs(), 1);
async function renderPrompt(input) {
	let content;
	if (typeof input === "string") content = input;
	else if (typeof input === "function") content = await input();
	else if (input && typeof input.then === "function") content = await input;
	else throw new Error("renderPrompt expects a string, a promise that returns a string, or a function that returns a string");
	return formatPromptContent(content);
}
function formatPromptContent(content) {
	content = content.trim();
	if (content.includes("<") && content.includes(">")) try {
		const fileElements = /* @__PURE__ */ new Map();
		let fileIndex = 0;
		let processedContent = content.replace(/<file\s+[^>]*>[\s\S]*?<\/file>/g, (match$1) => {
			const pathMatch = match$1.match(/path="([^"]*)"/);
			const path = pathMatch ? pathMatch[1] : "";
			const contentMatch = match$1.match(/<file[^>]*>([\s\S]*?)<\/file>/);
			let fileContent = contentMatch ? contentMatch[1] : "";
			fileContent = fileContent.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1");
			const placeholder = `__FILE_PLACEHOLDER_${fileIndex}__`;
			fileElements.set(placeholder, {
				path,
				content: fileContent
			});
			fileIndex++;
			return placeholder;
		});
		const cdataMap = /* @__PURE__ */ new Map();
		let cdataIndex = 0;
		processedContent = processedContent.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (match$1, cdataContent) => {
			const placeholder = `__CDATA_PLACEHOLDER_${cdataIndex}__`;
			cdataMap.set(placeholder, cdataContent);
			cdataIndex++;
			return placeholder;
		});
		const hasMultipleRoots = !processedContent.match(/^<([^>\s]+)[^>]*>[\s\S]*<\/\1>$/);
		let formatted = (0, import_cjs.default)(hasMultipleRoots ? `<root>${processedContent}</root>` : processedContent, {
			indentation: "  ",
			collapseContent: false,
			lineSeparator: "\n",
			whiteSpaceAtEndOfSelfclosingTag: true
		});
		if (hasMultipleRoots) formatted = formatted.replace(/^<root>\n?/, "").replace(/\n?<\/root>$/, "").split("\n").map((line) => line.startsWith("  ") ? line.substring(2) : line).join("\n");
		cdataMap.forEach((cdataContent, placeholder) => {
			formatted = formatted.replace(placeholder, cdataContent);
		});
		fileElements.forEach((fileData, placeholder) => {
			const placeholderIndex = formatted.indexOf(placeholder);
			if (placeholderIndex === -1) return;
			const lineStart = formatted.lastIndexOf("\n", placeholderIndex) + 1;
			const indent$1 = formatted.substring(lineStart, placeholderIndex);
			let fileElement;
			if (fileData.content.trim()) {
				const contentLines = fileData.content.split("\n");
				if (contentLines.length > 1) {
					const indentedContent = contentLines.map((line, i) => {
						if (i === 0) return line;
						return indent$1 + "    " + line;
					}).join("\n");
					fileElement = `<file path="${fileData.path}">\n${indent$1}    ${indentedContent}\n${indent$1}  </file>`;
				} else fileElement = `<file path="${fileData.path}">${fileData.content}</file>`;
			} else fileElement = `<file path="${fileData.path}"></file>`;
			formatted = formatted.replace(placeholder, fileElement);
		});
		content = formatted;
	} catch (e) {
		console.warn("XML formatting failed, using original content");
	}
	content = formatEmbeddedJson(content);
	content = addXmlSpacing(content);
	return content;
}
function formatEmbeddedJson(content) {
	return content.replace(/>(\s*[\[{][\s\S]*?[\]}]\s*)</g, (match$1, json) => {
		try {
			const parsed = JSON.parse(json);
			const formatted = JSON.stringify(parsed, null, 2);
			const lines = content.substring(0, content.indexOf(match$1)).split("\n");
			const indent$1 = lines[lines.length - 1].match(/^(\s*)/)?.[1] || "";
			return `>\n${indent$1}  ${formatted.split("\n").map((line, i) => i === 0 ? line : indent$1 + "  " + line).join("\n")}\n${indent$1}<`;
		} catch {
			return match$1;
		}
	});
}
function addXmlSpacing(content) {
	const lines = content.split("\n");
	const spacedLines = [];
	let previousWasClosingTag = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmedLine = line.trim();
		const isTopLevel = !line.startsWith("  ");
		const isOpeningTag = /^<[^\/]/.test(trimmedLine);
		const isClosingTag = /^<\//.test(trimmedLine);
		if (isTopLevel && isOpeningTag && previousWasClosingTag && spacedLines.length > 0) spacedLines.push("");
		spacedLines.push(line);
		previousWasClosingTag = isTopLevel && isClosingTag;
	}
	return spacedLines.join("\n");
}

//#endregion
//#region src/testing/prompts/message.ts
function isHumanMessage(msg) {
	return msg instanceof HumanMessage;
}

//#endregion
//#region src/testing/prompts/chatHistory.ts
/**
* The chatHistory function renders a <chat-history> tag,
* listing messages as <message> sub-elements with "role: content".
*
* @param messages - An array of message objects with "role" and "content".
*
* @example
* ```ts
* const messages = [
*   { role: 'system', content: 'You are a helpful AI assistant.' },
*   { role: 'user', content: 'Hello!' }
* ];
*
* chatHistory({ messages })
* ```
*/
async function chatHistoryPrompt({ messages }) {
	return renderPrompt(`<chat-history>${messages?.map((message) => {
		return `<message>${isHumanMessage(message) ? "human" : "assistant"}: ${JSON.stringify(message.content, null, 4)}</message>`;
	}).join("") || ""}</chat-history>`);
}

//#endregion
//#region src/testing/prompts/structuredOutput.ts
const structuredOutputPrompt = async ({ schema, tag = "structured-output" }) => {
	return renderPrompt(`
    <${tag}>
      ${StructuredOutputParser.fromZodSchema(schema).getFormatInstructions()}
    </${tag}>
  `);
};

//#endregion
//#region src/testing/agentTypes.ts
/**
* Schema for structured questions with intro, examples, and conclusion
*/
const agentStructuredQuestionSchema = z.object({
	type: z.literal("structuredQuestion"),
	intro: z.string().describe("A simple intro to the question"),
	examples: z.array(z.string()).describe(`List of examples to help the user understand what we're asking`),
	conclusion: z.string().optional().describe(`Conclusion of the question, restating exactly the information we want to the user to answer`)
});
/**
* Schema for simple text questions
*/
const agentSimpleQuestionSchema = z.object({
	type: z.literal("simpleQuestion"),
	content: z.string().describe("Simple question to ask the user")
});
/**
* Schema for finishing brainstorming
*/
const agentFinishBrainstormingSchema = z.object({
	type: z.literal("finishBrainstorming"),
	finishBrainstorming: z.literal(true).describe("Call to signal that the user has finished brainstorming")
});
/**
* Union schema for all agent output types
*/
const agentOutputSchema = z.discriminatedUnion("type", [
	agentSimpleQuestionSchema,
	agentStructuredQuestionSchema,
	agentFinishBrainstormingSchema
]);
/**
* Brainstorm topics
*/
const brainstormTopics = [
	"idea",
	"audience",
	"solution",
	"socialProof",
	"lookAndFeel"
];
/**
* State annotation for the brainstorm agent
*/
const BrainstormStateAnnotation = Annotation.Root({
	messages: Annotation({
		default: () => [],
		reducer: messagesStateReducer
	}),
	brainstorm: Annotation({
		default: () => ({}),
		reducer: (current, next) => ({
			...current,
			...next
		})
	}),
	remainingTopics: Annotation({
		default: () => [...brainstormTopics],
		reducer: (current, next) => next
	})
});

//#endregion
//#region src/testing/graphs/sampleAgent.ts
/**
* Helper function to write answers to a JSON file by key
* Merges new data with existing data in the file
* @param data - Object containing the answers keyed by topic
* @param filePath - Path to the JSON file (defaults to ./brainstorm-answers.json)
*/
async function writeAnswersToJSON(data, filePath = "./brainstorm-answers.json") {
	try {
		let existingData = {};
		try {
			const fileContent = await readFile(filePath, "utf-8");
			existingData = JSON.parse(fileContent);
		} catch (err) {}
		const mergedData = {
			...existingData,
			...data
		};
		await writeFile(filePath, JSON.stringify(mergedData, null, 2), "utf-8");
	} catch (error) {
		console.error("Error writing answers to JSON:", error);
		throw error;
	}
}
const TopicDescriptions = {
	idea: `The core business idea. What does the business do? What makes them different?`,
	audience: `The target audience. What are their pain points? What are their goals?`,
	solution: `How does the user's business solve the audience's pain points, or help them reach their goals?`,
	socialProof: `Social proof or testimonials to include on the landing page. Remember, anything can be social proof: the user's background, experience, beliefs, founder story, etc.`,
	lookAndFeel: `The look and feel of the landing page.`
};
const sortedTopics = (topics) => {
	return topics.sort((a, b) => brainstormTopics.indexOf(a) - brainstormTopics.indexOf(b));
};
const remainingTopics = (topics) => {
	return sortedTopics(topics).map((topic) => `${topic}: ${TopicDescriptions[topic]}`).join("\n\n");
};
const collectedData = (state) => {
	return Object.entries(state.brainstorm).filter(([_, value]) => value !== void 0 && value !== "");
};
const getPrompt = async (state, config) => {
	const lastHumanMessage = state.messages.filter(isHumanMessage).at(-1);
	if (!lastHumanMessage) throw new Error("No human message found");
	const [chatHistory, outputInstructions] = await Promise.all([chatHistoryPrompt({ messages: state.messages }), structuredOutputPrompt({ schema: agentOutputSchema })]);
	return renderPrompt(`
            <role>
                You are an expert marketer and strategist who specializes in helping businesses develop 
                HIGHLY PERSUASIVE marketing copy for their landing pages to differentiate their business ideas.
            </role>

            <task>
                Help the user brainstorm marketing copy for their landing page.
                Guide them through each question until you have enough context to generate effective marketing copy.
            </task>

            <collected_data>
                ${toJSON({ values: collectedData(state) })}
            </collected_data>

            ${chatHistory}

            <remaining_topics>
                ${remainingTopics(state.remainingTopics)}
            </remaining_topics>

            <decide_next_action>
                - If user's last message answered any of the remaining topics → call save_answers
                - If answer is off-topic/confused → provide clarification
                - If user asks for help → provide clarification
                - If no remaining topics → output finish_brainstorming
                - Otherwise → ask the user the next question, using the output format specified below
            </decide_next_action>

            <users_last_message>
                ${lastHumanMessage.content}
            </users_last_message>

            <workflow>
                1. Save any unsaved answers
                2. Decide next action based on user's last message
            </workflow>

            ${outputInstructions}
        `);
};
const SaveAnswersTool = (state, config) => {
	const description = `
        Tool for saving answers to the brainstorming session.

        CAPABILITIES:
        • Save multiple answers at once
    `;
	const saveAnswersInputSchema = z.object({ answers: z.array(z.object({
		topic: z.enum(brainstormTopics),
		answer: z.string()
	})) });
	z.object({ success: z.boolean() });
	async function saveAnswers(args) {
		const updates = args?.answers?.reduce((acc, { topic, answer }) => {
			if (!topic || !answer) return acc;
			acc[topic] = answer;
			return acc;
		}, {}) || {};
		await writeAnswersToJSON(updates);
		console.log("Saved answers:", updates);
		return { success: true };
	}
	return tool(saveAnswers, {
		name: "saveAnswers",
		description,
		schema: saveAnswersInputSchema
	});
};
/**
* Node that asks a question to the user during brainstorming mode
*/
const brainstormAgent = async (state, config) => {
	const prompt = await getPrompt(state, config);
	const tools = await Promise.all([SaveAnswersTool].map((tool$1) => tool$1(state, config)));
	let content = (await (await createAgent({
		model: getLLM().withConfig({ tags: ["notify"] }),
		tools,
		systemPrompt: prompt
	})).invoke(state, config)).messages.at(-1)?.content[0];
	const parser = StructuredOutputParser.fromZodSchema(agentOutputSchema);
	let textContent = content?.text;
	const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
	if (jsonMatch) textContent = jsonMatch[1];
	const structuredResult = await parser.parse(textContent);
	const aiMessage = new AIMessage({
		content: textContent,
		response_metadata: structuredResult
	});
	return { messages: [...state.messages || [], aiMessage] };
};
/**
* Simple test graph for the new brainstorm agent
* Usage: Load this in LangGraph Studio to test the agent
*/
function createSampleAgent(checkpointer, graphName = "sample") {
	return new StateGraph(BrainstormStateAnnotation).addNode("agent", withContext(brainstormAgent, {})).addEdge(START, "agent").addEdge("agent", END).compile({
		checkpointer,
		name: graphName
	});
}

//#endregion
export { BrainstormStateAnnotation, ErrorReporters, NodeMiddleware, NodeMiddlewareFactory, SampleGraphAnnotation, agentFinishBrainstormingSchema, agentOutputSchema, agentSimpleQuestionSchema, agentStructuredQuestionSchema, brainstormAgent, brainstormTopics, configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, createSampleAgent, createSampleGraph, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, nameProjectNode, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, responseNode, sampleMessageSchema, simpleMessageSchema, structuredMessageSchema, withContext, withErrorHandling, withNotifications };