import { nats } from '../deps.ts'
import { NatsTransport } from '../src/nats.transport.ts'
import { Transport, TransportState } from '../src/transport.ts'
import { assertEquals } from './test.deps.ts'

export async function withTransport(
  transport: Transport,
  fn: () => void | Promise<void>,
) {
  await transport.init()
  assertEquals(transport.state, <TransportState>'INITIALISED')

  await transport.start()
  assertEquals(transport.state, <TransportState>'CONNECTED')

  await fn()

  await transport.stop()
  assertEquals(transport.state, <TransportState>'DISCONNECTED')

  await transport.dispose()
  assertEquals(transport.state, <TransportState>'DISCONNECTED')
}
