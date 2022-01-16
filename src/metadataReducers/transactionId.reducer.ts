import { MetadataReducer } from '../transport.ts'

/**
 * Adds new `transactionId` metadata
 * @param newId - function which will always return unique string
 */
export function transactionIdReducer(
  newId: () => string,
  dateNow: () => number,
): MetadataReducer<TransactionMetadata> {
  const rule: MetadataReducer<TransactionMetadata> = (
    ctx,
  ): TransactionMetadata => ({
    transactionId: ctx?.metadata?.transactionId ?? newId(),
    transactionStartedAt:
      ctx?.metadata?.transactionStartedAt ?? dateNow(),
  })

  return rule
}

export type TransactionMetadata = {
  transactionId: string
  transactionStartedAt: number
}
