// Metro serves this module in place of Zod's `z.locales` index (see metro.config.ts), so the app
// ships one error-message language instead of 64. Zod registers English itself, and users never
// see Zod's messages: the app shows its own copy.
export { default as en } from "zod/v4/locales/en.js";
