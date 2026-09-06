// Vercel serverless entry point.
// The Express app handles all /api/* routes; Vercel routes requests here
// via the rewrite rule in vercel.json.
export { app as default } from "../server/server.js";
