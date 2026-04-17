import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL("./src/test/vscode.mock.ts", import.meta.url)),
    },
  },
});

