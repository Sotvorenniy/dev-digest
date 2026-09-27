import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown: on SIGTERM/SIGINT close the server, which runs the
  // onClose hooks (drains in-flight requests/SSE, closes the postgres pool).
  // Guarded so a second signal during shutdown doesn't double-close.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info(`${signal} received — shutting down`);
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({ port: config.apiPort, host: '0.0.0.0' });
    app.log.info(`DevDigest API listening on http://localhost:${config.apiPort}`);

    // Warm the live price cache so the FIRST cost read already uses real
    // OpenRouter prices. `estimate()` is synchronous and refreshes in the
    // background, so without this the first request re-prices runs from the
    // static snapshot and later ones from live prices — the same run showing
    // two different costs. Fire-and-forget: `refresh()` never throws, and a
    // cold cache degrades to the snapshot rather than failing the boot.
    void app.container.priceBook.refresh();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
