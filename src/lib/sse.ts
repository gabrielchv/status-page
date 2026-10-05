import { EventEmitter } from "node:events";

export type StatusEvent = {
  type: string;
  [key: string]: unknown;
};

const hub = new EventEmitter();
hub.setMaxListeners(0);

export function subscribe(
  slug: string,
  listener: (event: StatusEvent) => void,
): () => void {
  hub.on(slug, listener);
  return () => {
    hub.off(slug, listener);
  };
}

export function publish(slug: string, event: StatusEvent): void {
  hub.emit(slug, event);
}
