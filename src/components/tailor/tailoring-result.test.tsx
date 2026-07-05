import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TailoringResultView } from "./tailoring-result";

const result = {
  fitScore: 78, summary: "Tailored summary here.",
  keywordGaps: ["Kubernetes", "gRPC"],
  tailoredBullets: [{ original: "Built API", tailored: "Designed a gRPC service" }],
  skillsToFeature: ["Go", "Postgres"], strengths: ["backend depth"], gaps: ["no k8s"],
};

it("renders every section of the result", () => {
  render(<TailoringResultView result={result} />);
  expect(screen.getByText("78")).toBeInTheDocument();           // fit score
  expect(screen.getByText("Tailored summary here.")).toBeInTheDocument();
  expect(screen.getByText("Kubernetes")).toBeInTheDocument();   // keyword gap
  expect(screen.getByText("Designed a gRPC service")).toBeInTheDocument(); // tailored bullet
  expect(screen.getByText("Go")).toBeInTheDocument();           // skill
  expect(screen.getByText("backend depth")).toBeInTheDocument();// strength
  expect(screen.getByText("no k8s")).toBeInTheDocument();       // gap
});

it("shows a None. fallback for empty strengths and gaps", () => {
  render(<TailoringResultView result={{ ...result, strengths: [], gaps: [] }} />);
  expect(screen.getAllByText("None.")).toHaveLength(2);
});
