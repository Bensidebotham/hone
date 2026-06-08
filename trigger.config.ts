import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: "proj_ryxwpthoilbvvysarfum",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  // Prisma 7 requires Node 20.19+/22.12+/24+. Trigger's default "node" image is
  // Node 21.x, which Prisma's preinstall rejects — pin to the Node 22 runtime.
  runtime: "node-22",
  build: {
    extensions: [
      prismaExtension({
        mode: "legacy",
        schema: "prisma/schema.prisma",
      }),
    ],
  },
});
