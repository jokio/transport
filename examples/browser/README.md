## Transport - node.js

1. Install npm packages:
```
npm i jok_transport nats.ws
```

2. Browserify the script:
```
npx browserify basic.js > bundle.js
```

3. Open the html file and check logs
```
open index.html
```

Keep in mind that nats server should be started and ws should be enabled on default port 9090.
https://docs.nats.io/running-a-nats-service/configuration/websocket/websocket_conf