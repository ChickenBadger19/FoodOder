import { prepareStore, Store } from '@foododer/app';
import { sqliteDriver } from './server.js';

const file = process.env.FOODODER_DB ?? 'data/foododer.sqlite';
const store = new Store(sqliteDriver(file));
await prepareStore(store, { demo: process.env.FOODODER_DEMO === '1' });
console.log(`seeded ${file}`);
