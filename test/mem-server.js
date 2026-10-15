/* local E2E test launcher: in-memory MongoDB, no Atlas needed */
const { MongoMemoryServer } = require('mongodb-memory-server');
(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('ccss_alumni');
  console.log('MEM URI', process.env.MONGODB_URI);
  require('../server/app').listen(4000, () => console.log('mem test server up on 4000'));
})().catch(e => { console.error(e); process.exit(1); });
