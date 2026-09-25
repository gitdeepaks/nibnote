import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
});

export const env = Env.parse(process.env);
