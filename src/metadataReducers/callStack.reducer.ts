import type { MetadataReducer } from '../transport.ts'

/**
 * Adds new `callStack` metadata
 */
export function callStackReducer(): MetadataReducer<CallStackMetadata> {
  const rule: MetadataReducer<CallStackMetadata> = x => {
    if (x?.route) {
      const callStack = (x.metadata?.callStack ?? []).concat([
        x.route,
      ])

      return { callStack }
    }

    return { callStack: [] }
  }

  return rule
}

export type CallStackMetadata = {
  callStack: string[]
}
