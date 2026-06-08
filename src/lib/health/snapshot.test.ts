import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    healthScore: {
      findFirst: (...a: any[]) => findFirst(...a),
      create: (...a: any[]) => create(...a),
    },
  },
}));

import { snapshotHealth } from "@/lib/health/snapshot";

const stubData = {
  components: { resume: 80, linkedin: 60, site: null },
  composite: 70,
};

describe("snapshotHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a row when no snapshot exists today", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({});

    await snapshotHealth("u1", stubData);

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        resume: 80,
        linkedin: 60,
        site: null,
        composite: 70,
      },
    });
  });

  it("does NOT create a row when a snapshot already exists today", async () => {
    findFirst.mockResolvedValue({ id: "existing-row" });

    await snapshotHealth("u1", stubData);

    expect(create).not.toHaveBeenCalled();
  });
});
