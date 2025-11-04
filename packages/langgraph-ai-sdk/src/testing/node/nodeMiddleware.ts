import { withContext } from "./withContext";
import { withErrorHandling } from "./withErrorHandling";
import { withNotifications } from "./withNotifications";
import { NodeMiddlewareFactory } from "./nodeMiddlewareFactory";

const NodeMiddleware = (new NodeMiddlewareFactory());

NodeMiddleware.addMiddleware("context", withContext)
              .addMiddleware("notifications", withNotifications)
              .addMiddleware("errorHandling", withErrorHandling);

export { NodeMiddleware };