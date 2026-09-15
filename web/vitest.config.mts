import path from "node:path";
import { defineConfig } from "vitest/config";

// `.mts`, not `.ts`: this file is ESM, and package.json has no `"type"`, so a
// `.ts` extension makes the loader treat it as CommonJS. Vitest 5 warns about
// that today and Vite's next major turns it into an error. The extension is the
// fix; `import.meta.dirname` (Node >= 20.11) then replaces `__dirname`, which
// does not exist in an ES module.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // See src/test/server-only-stub.ts — lets tests import server modules.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
