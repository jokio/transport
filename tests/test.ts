import { nats } from '../deps.ts'
import { NatsTransport } from '../src/nats.transport.ts'
import { testSuite_01 } from './transport/01_connect.ts'
import { testSuite_02 } from './transport/02_publish.ts'
import { testSuite_03 } from './transport/03_execute.ts'

const transport = new NatsTransport({
  natsServerUrls: ['nats://localhost:4223'],
  StringCodec: nats.StringCodec,
  connect: nats.connect,
})

testSuite_01(transport)
testSuite_02(transport)
testSuite_03(transport)
