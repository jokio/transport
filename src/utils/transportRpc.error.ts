import type { TransportFailedMessage } from '../transport.ts'

export class TransportRpcError extends Error {
  constructor(public transportMessage: TransportFailedMessage) {
    super('RPCError: ' + transportMessage.errorData.message)
  }
}
