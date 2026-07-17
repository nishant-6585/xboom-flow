import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Unique id per production build. Baked into the bundle (__BUILD_ID__) AND
// emitted as /version.json so the running app can detect newer deploys and
// prompt users to refresh (see src/hooks/useVersionCheck.ts).
const buildId = Date.now().toString(36);

function emitVersionJson(): Plugin {
  return {
    name: "emit-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), mode === "development" && componentTagger(), emitVersionJson()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
