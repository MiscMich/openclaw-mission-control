import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OperationsPanel } from "./OperationsPanel";

vi.mock("@/components/settings/WorkersPanel", () => ({
  WorkersPanel: () => <div>WorkersPanelMock</div>,
}));

vi.mock("@/components/settings/CronJobsPanel", () => ({
  CronJobsPanel: () => <div>CronJobsPanelMock</div>,
}));

vi.mock("@/components/dashboard/CronCalendar", () => ({
  CronCalendar: () => <div>CronCalendarMock</div>,
}));

describe("OperationsPanel", () => {
  it("shows cron list by default", () => {
    render(<OperationsPanel />);
    expect(screen.getByText("WorkersPanelMock")).toBeInTheDocument();
    expect(screen.getByText("CronJobsPanelMock")).toBeInTheDocument();
    expect(screen.queryByText("CronCalendarMock")).not.toBeInTheDocument();
  });

  it("toggles between list and calendar views", () => {
    render(<OperationsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Calendar view" }));
    expect(screen.getByText("CronCalendarMock")).toBeInTheDocument();
    expect(screen.queryByText("CronJobsPanelMock")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByText("CronJobsPanelMock")).toBeInTheDocument();
    expect(screen.queryByText("CronCalendarMock")).not.toBeInTheDocument();
  });
});
