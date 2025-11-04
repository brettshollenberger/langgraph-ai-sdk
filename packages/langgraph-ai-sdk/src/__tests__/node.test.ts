import { describe, it, expect, vi } from 'vitest';
import { getNodeContext, withContext, withErrorHandling, ErrorReporters, NodeMiddleware } from '../testing/node';
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";

const getNodeName = () => {
    const context = getNodeContext();
    if (!context) throw new Error('No context found');
    return context.name;
};

describe('Node Core', () => {
  describe('Middlewares', () => {
    it('should decorate context', async () => {
      let nodeName: string | undefined;

      const node = NodeMiddleware.use(
        { notifications: { taskName: 'Test Task' } },
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

    it.only('should decorate notifications', async () => {
      const node = NodeMiddleware.wrap(
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

    it('should report errors', async () => {
      let nodeName: string | undefined;
      const spy = vi.spyOn(console, 'error');
        
      ErrorReporters.addReporter('console');

      const node = NodeMiddleware.wrap(
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
