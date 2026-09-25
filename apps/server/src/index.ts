import { app } from "./app";
import { env } from "./env";

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
console.log(`Nibnote API listening on ${server.url.href}`);
