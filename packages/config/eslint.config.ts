import { nibnoteConfig } from "./eslint";

// fixtures/ holds deliberate violations; lint-contract.test.ts lints it on purpose
export default nibnoteConfig({ tsconfigRootDir: import.meta.dirname, ignores: ["fixtures/**"] });
