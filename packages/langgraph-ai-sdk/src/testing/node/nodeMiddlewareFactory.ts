import { NodeFunction, type NodeMiddlewareType, type MiddlewareConfigType } from "./types";

type InferMiddlewareConfig<T> = T extends (...args: any[]) => any
  ? Parameters<T>[1]
  : never;

type MiddlewareConfigMap<TRegistered extends string, TMiddlewares> = {
  [K in TRegistered]?: K extends keyof TMiddlewares 
    ? InferMiddlewareConfig<TMiddlewares[K]>
    : never;
};

type MiddlewareConfig<TRegistered extends string, TMiddlewares> = MiddlewareConfigMap<TRegistered, TMiddlewares> & {
  only?: TRegistered[];
  except?: TRegistered[];
};

export class NodeMiddlewareFactory<
  TRegistered extends string = never,
  TMiddlewares extends Record<string, (...args: any[]) => any> = {}
> {
  private middlewares: TMiddlewares;

  constructor() {
    this.middlewares = {} as TMiddlewares;
  }

  addMiddleware<
    TName extends string, 
    TMiddleware extends (...args: any[]) => any
  >(name: TName, middleware: TMiddleware) {
    (this.middlewares as any)[name] = middleware;
    return this as unknown as NodeMiddlewareFactory<TRegistered | TName, TMiddlewares & Record<TName, TMiddleware>>
  }

  use<TState extends Record<string, unknown>>(
    config: MiddlewareConfig<TRegistered, TMiddlewares> = {},
    node: NodeFunction<TState>,
  ): NodeFunction<TState> {
    const middlewaresToApply = this.getMiddlewaresToApply(config);

    return middlewaresToApply.reduceRight(
      (wrappedNode, [name, middleware]) => {
        const middlewareConfig = config[name];
        return middleware(wrappedNode, middlewareConfig);
      },
      node
    );
  }

  private getMiddlewaresToApply(
    config: MiddlewareConfig<TRegistered, TMiddlewares>
  ): [TRegistered, NodeMiddlewareType<any>][] {
    const allNames = Object.keys(this.middlewares) as TRegistered[];
    
    let selectedNames = allNames;
    
    if (config.only) {
      selectedNames = allNames.filter(name => config.only!.includes(name));
    }
    
    if (config.except) {
      selectedNames = selectedNames.filter(name => !config.except!.includes(name));
    }
    
    return selectedNames.map(name => [name, this.middlewares[name]!]);
  }
}
 