export type Event = { type: string; payload?: unknown }

type InferPayload<E extends Event, Type> = E extends {
  type: Type
  payload: infer A extends E['payload']
}
  ? [payload: A]
  : [payload?: never]

type EmitFunction<E extends Event> = <
  T extends E['type'],
  const Payload extends InferPayload<E, T>,
>(
  event: T,
  ...payload: Payload
) => void

type SubscribeFunction<E extends Event> = <
  T extends E['type'],
  Payload extends InferPayload<E, T>,
  Fn extends E extends { type: T; payload: Payload[0] }
    ? (payload: Payload[0]) => void
    : VoidFunction,
>(
  event: T,
  fn: Fn,
) => () => void

export const createEventEmitter = <E extends Event>() => {
  const listeners: Record<string, Set<(payload: E['payload']) => void>> = {}

  const on: SubscribeFunction<E> = (event, fn) => {
    listeners[event] ??= new Set()
    listeners[event].add(fn)
    return () => {
      listeners[event].delete(fn)
    }
  }

  const once: SubscribeFunction<E> = (event, fn) => {
    const unsubscribe = on(event, ((payload: any) => {
      unsubscribe()
      ;(fn as any)(payload)
    }) as any)
    return unsubscribe
  }

  const emit: EmitFunction<E> = (event, ...payload) =>
    listeners[event]?.forEach((fn) => fn(payload[0]))

  const remove = (event: E['type']) => delete listeners[event]

  function clear() {
    Object.keys(listeners).forEach((key) => {
      listeners[key].clear()
    })
  }

  return { listeners, on, once, emit, clear, remove }
}
