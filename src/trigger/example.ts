import { task } from "@trigger.dev/sdk";

export const helloWorld = task({
  id: "hello-world",
  run: async (payload: { name: string }) => ({
    greeting: `hi ${payload.name}`,
  }),
});
