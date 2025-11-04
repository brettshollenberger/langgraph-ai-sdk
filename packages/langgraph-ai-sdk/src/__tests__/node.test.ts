import { describe, it, expect, vi } from 'vitest';
import { getNodeContext, withContext, withErrorHandling, ErrorReporters, NodeMiddleware } from '../testing/node';
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { getLLM } from "../testing/llm/llm";
import { configureResponses } from "../testing/llm/test";

const getNodeName = () => {
    const context = getNodeContext();
    if (!context) throw new Error('No context found');
    return context.name;
};

describe('Node Core', () => {
  describe('Middlewares', () => {
    it('decorates context', async () => {
      let nodeName: string | undefined;

      const node = NodeMiddleware.use(
        {},
        async  (state: any, config: LangGraphRunnableConfig) => {
            nodeName = getNodeName();
            return {};
        }
      );

      const graph = new StateGraph(Annotation.Root({ }))
        .addNode('fancyPantsNode', node)
        .addEdge("__start__", "fancyPantsNode")
        .addEdge("fancyPantsNode", "__end__")
        .compile();

      await graph.invoke({});
        
      expect(nodeName).toBe('fancyPantsNode');
    });

    it('decorates notifications', async () => {
      let graphName = 'test-graph';
      let nodeName = 'notificationNode';      

      configureResponses({
        [graphName]: {
          [nodeName]: [{ projectName: "Project Alpha" }],
          responseNode: [
            {
              intro: 'Welcome to the project',
              examples: ['example1', 'example2'],
              conclusion: 'Get started today',
            },
          ],
        },
      });

      const node = NodeMiddleware.use(
        { notifications: { taskName: 'Any Task Name I Want' } },
        async (state: any, config: LangGraphRunnableConfig) => {
          await getLLM().invoke("Hello")
          return {}
        }
      )

      const graph = new StateGraph(Annotation.Root({ }))
        .addNode('notificationNode', node)
        .addEdge("__start__", "notificationNode")
        .addEdge("notificationNode", "__end__")
        .compile({ name: graphName });

      const stream = await graph.stream({}, { 
        context: {
          graphName: graphName,
        },
        streamMode: ['custom'] 
      });

      let collectedEvents = []
      for await (const chunk of stream) {
        const chunkArray = chunk as [string, any];
        let kind: string;
        let data: any;
        [kind, data] = chunkArray;
        if (kind === "custom") {
          collectedEvents.push(data);
        }
      }

      expect(collectedEvents).toEqual([
        {
          id: expect.any(String),
          event: "NOTIFY_TASK_START",
          task: {
            id: expect.any(String),
            title: "Any Task Name I Want",
          },
        },
        {
          id: expect.any(String),
          event: "NOTIFY_TASK_COMPLETE",
          task: {
            id: expect.any(String),
            title: "Any Task Name I Want",
          },
        },
      ]);
    });

    it('reports errors', async () => {
      let nodeName: string | undefined;
      const spy = vi.spyOn(console, 'error');
        
      ErrorReporters.addReporter('console');

      const node = NodeMiddleware.use(
        { },
        async (state: any, config: LangGraphRunnableConfig) => {
            nodeName = getNodeName();
            throw new Error('Test error');
        }
      )

      const graph = new StateGraph(Annotation.Root({ }))
        .addNode('errorNode', node)
        .addEdge("__start__", "errorNode")
        .addEdge("errorNode", "__end__")
        .compile();

      await expect(graph.invoke({})).rejects.toThrow('Test error');

      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Test error' }));

      expect(nodeName).toBe('errorNode');
    });

  });
});
