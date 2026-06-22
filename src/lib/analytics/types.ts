export type Funnel = {
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
};

export type Conversion = {
  // null when the denominator is 0
  appliedToInterview: number | null; // percent 0-100
  interviewToOffer: number | null; // percent 0-100
};

export type TimeInStage = {
  appliedToResponseDays: number | null; // median; null when n < 3
  appliedToResponseN: number;
  interviewToDecisionDays: number | null;
  interviewToDecisionN: number;
};

export type PersonalAnalytics = {
  funnel: Funnel;
  conversion: Conversion;
  timeInStage: TimeInStage;
};

export type WeeklyPoint = { weekStart: string; count: number };
export type SalaryBucket = { label: string; count: number };
export type TechCount = { tag: string; count: number };

export type MarketAnalytics = {
  jobVolume: WeeklyPoint[];
  salary: { buckets: SalaryBucket[]; coveragePct: number | null }; // coverage = % of jobs listing salary
  topTech: TechCount[];
  remote: { remote: number; onsite: number };
};
