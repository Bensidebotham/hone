import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db", () => ({
  prisma: { applicationEvent: { create: (...a: any) => create(...a) } },
}));

import { recordApplicationEvent } from "@/lib/applications/events";

beforeEach(() => create.mockClear());

describe("recordApplicationEvent", () => {
  it("creates a created event with a default summary", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "created",
      toStatus: "saved",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        applicationId: "a1",
        userId: "u1",
        type: "created",
        fromStatus: undefined,
        toStatus: "saved",
        summary: "Added to tracker",
      },
    });
  });

  it("creates a status_change event with a 'Moved to X' summary", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "status_change",
      fromStatus: "applied",
      toStatus: "interviewing",
    });
    const [args] = create.mock.calls;
    expect(args[0].data.type).toBe("status_change");
    expect(args[0].data.fromStatus).toBe("applied");
    expect(args[0].data.toStatus).toBe("interviewing");
    expect(args[0].data.summary).toBe("Moved to Interviewing");
  });

  it("prefers an explicit summary when provided", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "status_change",
      toStatus: "offer",
      summary: "Custom",
    });
    const [args] = create.mock.calls;
    expect(args[0].data.summary).toBe("Custom");
  });
});
