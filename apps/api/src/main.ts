import { fileURLToPath } from 'node:url';
import { createFakeEngine } from './adapters/fakeEngine.ts';
import { loadSampleFindings } from './adapters/sampleFindings.ts';
import { systemClock } from './adapters/systemClock.ts';
import { systemRandom } from './adapters/systemRandom.ts';
import { openDatabase } from './db/connection.ts';
import { seed } from './db/seed.ts';
import { DEFAULT_CONFIG } from './domain/config.ts';
import { buildApp } from './http/app.ts';
import { registerReviewRoutes } from './http/reviews.ts';
import { createReviewService, type ReviewService } from './services/reviewService.ts';
import { startRunner } from './services/runner.ts';
import { startSweeper } from './services/sweeper.ts';

const SAMPLES_DIR = fileURLToPath(new URL('../../../samples/', import.meta.url));
const DB_PATH = process.env.LEX_DB_PATH ?? fileURLToPath(new URL('../lex-poc.db', import.meta.url));
const HOST = process.env.API_HOST ?? '127.0.0.1';
const PORT = Number(process.env.API_PORT ?? 3001);

const config = DEFAULT_CONFIG;
const clock = systemClock;
const random = systemRandom;
const logger = { warn: (message: string) => console.warn(message) };

// A file, so that a review survives a restart and then expires by its deadline.
const db = openDatabase(DB_PATH);
seed(db, SAMPLES_DIR);

const engine = createFakeEngine({ clock, random, findingsByDocument: loadSampleFindings(SAMPLES_DIR) });

const service: ReviewService = createReviewService(
  { db, clock, random, config, logger },
  { onStarted: (review) => startRunner({ engine, logger }, service, review) },
);
startSweeper({ clock, config, logger }, service);

const app = buildApp();
registerReviewRoutes(app, service);
await app.listen({ port: PORT, host: HOST });
console.log(`API listening on http://${HOST}:${PORT}`);
