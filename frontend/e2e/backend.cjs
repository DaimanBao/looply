// Integration harness only: the normal backend entry point keeps its environment/database rules.
const { Client } = require('../../backend/node_modules/pg');
const { createBackend } = require('../../backend/src/bootstrap.ts');
const { loadConfig } = require('../../backend/src/config/environment.ts');
const { loadAuthConfig } = require('../../backend/src/config/auth-config.ts');
const {
  getTestDatabaseUrl,
  verifyTestDatabase,
} = require('../../backend/tests/helpers/test-database.ts');
const { seedProvinceCatalog } = require('../../backend/src/modules/user/province-catalog.ts');
const {
  createOtpInspector,
  inspectorConfig,
} = require('../../backend/src/development/otp-inspector.ts');

/** Runs real backend adapters on a verified test database, with the opt-in tool in a development process. */
async function main() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Development harness only');
  const databaseUrl = getTestDatabaseUrl();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await verifyTestDatabase(client);
  } finally {
    await client.end();
  }
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: databaseUrl });
  const backend = createBackend(config, loadAuthConfig(process.env, 'test'));
  // Only official reference data on looply_test; no migrations, reset or development writes.
  await backend.database.$transaction((tx) => seedProvinceCatalog(tx));
  const inspector = inspectorConfig('development', process.env);
  if (!inspector) throw new Error('Explicit inspector opt-in required');
  const tool = createOtpInspector('development', inspector, {
    store: backend.features.redis,
    sms: backend.features.providers.sms,
    email: backend.features.providers.email,
    pepper: process.env.AUTH_OTP_PEPPER,
  });
  let stopping = false;
  /** Stops only listeners and resources owned by this isolated harness. */
  async function stop() {
    if (stopping) return;
    stopping = true;
    tool.closeAllConnections();
    await new Promise((resolve) => tool.close(resolve));
    await backend.runtime.stop();
  }
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
  await backend.runtime.start();
  await new Promise((resolve, reject) => {
    tool.once('error', reject);
    tool.listen(inspector.port, '127.0.0.1', resolve);
  });
}
main().catch(() => {
  console.error('Isolated E2E backend startup failed');
  process.exit(1);
});
