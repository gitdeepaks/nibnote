// The app's own build-time variables, so `process.env.EXPO_PUBLIC_*` can be read with the dot
// notation Expo needs to inline them. Values are still parsed with Zod in env.ts.
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_DIAGNOSTICS?: string;
    }
  }
}

export {};
