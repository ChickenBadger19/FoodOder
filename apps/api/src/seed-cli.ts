import { prepareStore, Store } from '@foodify/app';
import { sqliteDriver } from './server.js';

const file = process.env.FOODIFY_DB ?? 'data/foodify.sqlite';
const store = new Store(sqliteDriver(file));
await prepareStore(store, { demo: process.env.FOODIFY_DEMO === '1' });
console.log(`seeded ${file}`);
