export type AtsProvider = "greenhouse" | "lever" | "ashby";

export interface BoardConfig {
  provider: AtsProvider;
  slug: string;
  company: string;
}

// Public board slugs. Grow this list freely.
export const BOARDS: BoardConfig[] = [
  { provider: "greenhouse", slug: "stripe", company: "Stripe" },
  { provider: "greenhouse", slug: "airbnb", company: "Airbnb" },
  { provider: "lever", slug: "outreach", company: "Outreach" },
  { provider: "ashby", slug: "ramp", company: "Ramp" },
];
