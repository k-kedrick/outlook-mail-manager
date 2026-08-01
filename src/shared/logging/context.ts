import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  actorId?: string;
  jobId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(context: RequestContext, action: () => T): T {
  return storage.run(context, action);
}

export function requestContext(): RequestContext | undefined {
  return storage.getStore();
}
