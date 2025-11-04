import { withContext } from "./withContext";
import { withErrorHandling } from "./withErrorHandling";
import { withNotifications } from "./withNotifications";
import { NodeMiddlewareFactory } from "./nodeMiddlewareFactory";

const _nodeMiddleware = new NodeMiddlewareFactory()
  .addMiddleware("context", withContext)
  .addMiddleware("notifications", withNotifications)
  .addMiddleware("errorHandling", withErrorHandling);

export const NodeMiddleware = _nodeMiddleware;