#!/usr/bin/env node
import { ensure, tables } from '../src/core/store.js';
ensure();
console.log(`Migrations complete. Ensured ${tables.length} local data tables.`);
