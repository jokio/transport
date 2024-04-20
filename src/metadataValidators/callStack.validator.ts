import type { MetadataValidator } from '../transport.ts'
import { RecursionCallError } from '../utils/recursion.error.ts'

export function callStackValidator(
  prefixesToCheck: string[] | 'all',
): MetadataValidator {
  return (route, msg) => {
    const callStack = <string[]>msg.metadata.callStack ?? []

    if (
      callStack.length &&
      (prefixesToCheck === 'all' ||
        prefixesToCheck.some(p => route.startsWith(p))) &&
      callStack.includes(route)
    ) {
      const transactionId = <string>msg.metadata.transactionId

      throw new RecursionCallError(transactionId, route, callStack)
    }
  }
}
