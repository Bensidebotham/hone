import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GmailReconnectBanner } from "@/components/gmail/reconnect-banner";

vi.mock("@/lib/gmail/oauth", () => ({ connectGmail: vi.fn() }));

const SYNCED = new Date("2026-07-20T04:32:14Z");

describe("GmailReconnectBanner", () => {
  it("warns and offers a reconnect action when the grant is dead", () => {
    render(<GmailReconnectBanner status={{ state: "needs_reauth", lastSyncedAt: SYNCED }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/gmail/i);
    expect(screen.getByRole("button", { name: /reconnect gmail/i })).toBeInTheDocument();
  });

  // Without this the user can't tell a 5-minute blip from a month of silence.
  it("names the date sync last worked so the gap is obvious", () => {
    render(<GmailReconnectBanner status={{ state: "needs_reauth", lastSyncedAt: SYNCED }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/Jul 20, 2026/);
  });

  it("still warns when the connection has never completed a sync", () => {
    render(<GmailReconnectBanner status={{ state: "needs_reauth", lastSyncedAt: null }} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reconnect gmail/i })).toBeInTheDocument();
  });

  it("renders nothing while sync is healthy", () => {
    const { container } = render(
      <GmailReconnectBanner status={{ state: "connected", lastSyncedAt: SYNCED }} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  // A user who never connected Gmail must not be told to "reconnect" it.
  it("renders nothing for a user who never connected an inbox", () => {
    const { container } = render(
      <GmailReconnectBanner status={{ state: "disconnected", lastSyncedAt: null }} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
