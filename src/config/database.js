import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

const SRV_DNS_ERRORS = ['ECONNREFUSED', 'ETIMEOUT', 'ESERVFAIL'];

// Рядок mongodb+srv:// потребує SRV-запиту до DNS. Локальний DNS-проксі (VPN тощо)
// може його відхилити, хоча сама система адресу розв'язує.
const isSrvLookupFailure = err =>
  err.syscall === 'querySrv' && SRV_DNS_ERRORS.includes(err.code);

export async function connectDB(uri = env.mongoUri) {
  if (!uri) {
    throw new Error('Не задано MONGODB_URI. Скопіюйте .env.example у .env і вкажіть рядок підключення');
  }
  const options = { serverSelectionTimeoutMS: 10_000 };

  try {
    await mongoose.connect(uri, options);
  } catch (err) {
    if (!isSrvLookupFailure(err)) throw err;

    console.warn(`DNS ${dns.getServers().join(', ')} відхилив SRV-запит, повтор через ${env.dnsServers.join(', ')}`);
    dns.setServers(env.dnsServers);
    await mongoose.connect(uri, options);
  }
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
