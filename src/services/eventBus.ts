import type { EventBusEventMap, EventBusEventName } from '../types/m2Contracts';

type Handler<T extends EventBusEventName> = (payload: EventBusEventMap[T]) => void;

export class EventBus {
	private listeners = new Map<EventBusEventName, Set<Handler<EventBusEventName>>>();

	on<T extends EventBusEventName>(event: T, handler: Handler<T>): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(handler as Handler<EventBusEventName>);
		return () => {
			set?.delete(handler as Handler<EventBusEventName>);
		};
	}

	emit<T extends EventBusEventName>(event: T, payload: EventBusEventMap[T]): void {
		const set = this.listeners.get(event);
		if (!set) {
			return;
		}
		for (const handler of set) {
			handler(payload);
		}
	}
}
