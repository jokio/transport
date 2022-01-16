import { MetadataValidator } from '../transport.ts'
import { TransactionDurationError } from '../utils/transactionDuration.error.ts'

export function transactionDurationValidator(
  maxDuration: number,
  parseDate: (x: string) => number,
  dateNow: () => string,
): MetadataValidator {
  return (route, msg) => {
    const transactionStartedAt = msg.metadata
      .transactionStartedAt as number

    const start = transactionStartedAt

    const now = dateNow()
    const end = typeof now === 'number' ? now : parseDate(now)
    const duration = end - start
    if (!(start && end && duration <= maxDuration)) {
      const transactionId = <string>msg.metadata.transactionId

      throw new TransactionDurationError(
        transactionId,
        duration,
        route,
        <string[]>msg.metadata['callStack'] ?? [],
      )
    }
  }
}
