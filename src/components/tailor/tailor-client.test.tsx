import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TailorClient } from "./tailor-client";

const okResult = { id: "t1", fitScore: 82, summary: "Tailored.", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] };

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

it("submits the JD and renders the result", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okResult }));
  render(<TailorClient hasResume initialJobDescription="Some JD" />);
  fireEvent.click(screen.getByRole("button", { name: /tailor/i }));
  await waitFor(() => expect(screen.getByText("82")).toBeInTheDocument());
  const body = JSON.parse((fetch as any).mock.calls[0][1].body);
  expect(body.jobDescription).toBe("Some JD");
});

it("shows an upload prompt when there is no résumé", () => {
  render(<TailorClient hasResume={false} />);
  expect(screen.getByText(/upload a résumé/i)).toBeInTheDocument();
});

it("surfaces a rate-limit error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => "30" }, json: async () => ({ error: "Too many requests" }) }));
  render(<TailorClient hasResume initialJobDescription="JD" />);
  fireEvent.click(screen.getByRole("button", { name: /tailor/i }));
  await waitFor(() => expect(screen.getByText(/too many requests/i)).toBeInTheDocument());
});

it("shows an upload prompt linking to /profile when the server reports no_resume", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "No résumé", code: "no_resume" }) }));
  render(<TailorClient hasResume initialJobDescription="JD" />);
  fireEvent.click(screen.getByRole("button", { name: /tailor/i }));
  await waitFor(() => expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile"));
});
