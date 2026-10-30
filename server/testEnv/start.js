// Runs the app against its own throwaway MongoDB on this machine, filled with dummy data (see seed.js).
// It never connects to the database in .env: MONGODB_URI is set here, and dotenv does not override it.
// Data is kept between runs in server/.testenv; start with --reset to begin from fresh dummy data.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server-core');
const seed = require('./seed');
const startFakeOnFact = require('./fakeOnFact');

const DATA_DIR = path.join(__dirname, '../.testenv');
const DB_DIR = path.join(DATA_DIR, 'db');

async function start() {
  if (process.argv.includes('--reset')) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DB_DIR, { recursive: true });

  const mongo = await MongoMemoryServer.create({ instance: { dbPath: DB_DIR, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = mongo.getUri('bespreekonline_test');
  process.env.PORT = process.env.TEST_ENV_PORT || '5002';
  process.env.JWT_SECRET = 'test-environment-only';
  process.env.CLIENT_URL = 'http://localhost:5174';
  process.env.UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

  // Always the simulated OnFact, even if .env holds real OnFact credentials
  const onfactPort = Number(process.env.PORT) + 1;
  process.env.ONFACT_BASE_URL = `http://localhost:${onfactPort}/v1/`;
  process.env.ONFACT_API_KEY = 'test-key';
  process.env.ONFACT_COMPANY_UUID = 'test-company';
  const fakeOnFact = startFakeOnFact({
    port: onfactPort,
    file: path.join(DATA_DIR, 'onfact-invoices.json'),
    apiKey: process.env.ONFACT_API_KEY,
    companyUuid: process.env.ONFACT_COMPANY_UUID,
  });

  await mongoose.connect(process.env.MONGODB_URI);
  await seed();
  require('../server');

  async function stop() {
    fakeOnFact.close();
    await mongoose.disconnect();
    await mongo.stop({ doCleanup: false }); // keep the data for the next run
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  console.log('\nTEST ENVIRONMENT - dummy data, separate database');
  console.log('Open the client with: cd client && npm run dev:test  ->  http://localhost:5174');
  console.log(`Admin:      ${seed.ADMIN_EMAIL} / ${seed.PASSWORD}`);
  console.log(`Consultant: ${seed.CONSULTANT_EMAIL} / ${seed.PASSWORD}`);
  console.log(`Invoices sent to the simulated OnFact: ${process.env.ONFACT_BASE_URL}invoices.json\n`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
