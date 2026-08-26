import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useQuery } from "convex/react";
import { AgentChat } from "./AgentChat";

const mockAgents = [
  { id: "operator", name: "Operator", lastSeen: Date.now() },
  { id: "builder", name: "Builder", lastSeen: Date.now() },
  { id: "verifier", name: "Verifier", lastSeen: Date.now() - 10_000 },
];

function mockQueryData(messages: Array<Record<string, unknown>>) {
  vi.mocked(useQuery).mockImplementation((_, args?: unknown) => {
    if (args && typeof args === "object" && "limit" in (args as Record<string, unknown>)) {
      return messages;
    }
    return mockAgents;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AgentChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/sessions") {
          return jsonResponse([]);
        }
        if (url.startsWith("/api/openclaw/chat/history")) {
          return jsonResponse({ ok: true, messages: [] });
        }
        return jsonResponse({ ok: true, dispatchErrors: [] });
      })
    );

    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  it("sends a direct message with task context", async () => {
    render(<AgentChat taskId="task-123" />);

    fireEvent.click(screen.getByRole("button", { name: /Builder/i }));

    const input = screen.getByPlaceholderText(/Message/i);
    fireEvent.change(input, { target: { value: "Ship this now @builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const body = JSON.parse((messageCall?.[1] as RequestInit).body as string);

    expect(body).toMatchObject({
      fromAgentId: "operator",
      toAgentId: "builder",
      content: "Ship this now @builder",
      taskId: "task-123",
    });
  });

  it("renders task links for task-scoped messages", () => {
    mockQueryData([
      {
        id: "msg-1",
        fromAgentId: "builder",
        toAgentId: "operator",
        content: "Done. See notes.",
        taskId: "task-42",
        createdAt: Date.now(),
      },
    ]);

    render(<AgentChat />);

    const taskLink = screen.getByRole("link", { name: /View Task/i });
    expect(taskLink).toHaveAttribute("href", "/tasks/task-42");
  });

  it("uploads selected files and includes attachment metadata in send payload", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, messages: [] });
      }
      if (url === "/api/openclaw/file") {
        return jsonResponse({ ok: true, path: "chat-attachments/2026-01-01/test-note.md" });
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat taskId="task-123" />);

    const fileInput = screen.getByLabelText(/Attach/i, { selector: "input[type='file']" });
    const file = new File(["hello"], "test-note.md", { type: "text/markdown" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/openclaw/file",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.change(screen.getByPlaceholderText(/Message/i), { target: { value: "Sharing notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/messages",
        expect.objectContaining({ method: "POST" })
      );
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const body = JSON.parse((messageCall?.[1] as RequestInit).body as string);
    expect(body.attachments).toEqual([
      expect.objectContaining({
        name: "test-note.md",
        path: expect.stringMatching(/^chat-attachments\/.+\/.*test-note\.md$/),
      }),
    ]);
  });

  it("allows sending attachment-only messages", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, messages: [] });
      }
      if (url === "/api/openclaw/file") {
        return jsonResponse({ ok: true, path: "chat-attachments/2026-01-01/only-file.txt" });
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat taskId="task-123" />);

    const fileInput = screen.getByLabelText(/Attach/i, { selector: "input[type='file']" });
    const file = new File(["note"], "only-file.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/openclaw/file",
        expect.objectContaining({ method: "POST" })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/messages",
        expect.objectContaining({ method: "POST" })
      );
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const body = JSON.parse((messageCall?.[1] as RequestInit).body as string);
    expect(body.content).toBe("");
    expect(body.attachments).toHaveLength(1);
  });

  it("renders sent attachments as clickable links", () => {
    mockQueryData([
      {
        id: "msg-2",
        fromAgentId: "builder",
        toAgentId: "operator",
        content: "Attached report.",
        attachments: [
          {
            name: "report.txt",
            path: "chat-attachments/reports/report.txt",
          },
        ],
        createdAt: Date.now(),
      },
    ]);

    render(<AgentChat />);

    const link = screen.getByRole("link", { name: /report.txt/i });
    expect(link).toHaveAttribute(
      "href",
      "/api/openclaw/file?path=chat-attachments%2Freports%2Freport.txt&raw=true"
    );
  });

  it("defaults external delivery on for telegram sessions and sends deliver=true", async () => {
    const sessionKey = "agent:builder:telegram:thread-1";

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([{ key: sessionKey, updatedAt: Date.now() }]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, messages: [] });
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat currentAgentId="builder" initialViewMode="thread" />);

    // Default session selection prefers `...:main`. Switch to the Telegram session explicitly.
    const telegramSessionButton = await screen.findByTitle(sessionKey);
    fireEvent.click(telegramSessionButton);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Deliver externally/i,
    });
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    fireEvent.change(screen.getByPlaceholderText(/Message/i), { target: { value: "Hello from OpenClaw Mission Control" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/openclaw/chat/send",
        expect.objectContaining({ method: "POST" })
      );
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const messageBody = JSON.parse((messageCall?.[1] as RequestInit).body as string);
    expect(messageBody).toMatchObject({
      sessionKey,
    });

    const sendCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/openclaw/chat/send");
    expect(sendCall).toBeDefined();

    const body = JSON.parse((sendCall?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      sessionKey,
      deliver: true,
    });
  });

  it("defaults external delivery off for non-telegram sessions and sends deliver=false", async () => {
    const sessionKey = "agent:builder:main";

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([{ key: sessionKey, updatedAt: Date.now() }]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, messages: [] });
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat currentAgentId="builder" initialViewMode="thread" />);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Deliver externally/i,
    });
    await waitFor(() => {
      expect(checkbox).not.toBeChecked();
    });

    fireEvent.change(screen.getByPlaceholderText(/Message/i), { target: { value: "Local send" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/openclaw/chat/send",
        expect.objectContaining({ method: "POST" })
      );
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const messageBody = JSON.parse((messageCall?.[1] as RequestInit).body as string);
    expect(messageBody).toMatchObject({
      sessionKey,
    });

    const sendCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/openclaw/chat/send");
    expect(sendCall).toBeDefined();

    const body = JSON.parse((sendCall?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      sessionKey,
      deliver: false,
    });
  });

  it("auto-loads gateway history for internal sessions", async () => {
    const sessionKey = "agent:builder:main:local:thread-99";

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([{ key: sessionKey, updatedAt: Date.now() }]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, cached: false, messages: [] });
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat currentAgentId="builder" initialViewMode="thread" />);

    await waitFor(() => {
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(([url]) => typeof url === "string" && url.startsWith("/api/openclaw/chat/history"))
      ).toBe(true);
    });
  });

  it("still stores the message when external delivery fails", async () => {
    const sessionKey = "agent:builder:telegram:thread-2";

    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/sessions") {
        return jsonResponse([{ key: sessionKey, updatedAt: Date.now() }]);
      }
      if (url.startsWith("/api/openclaw/chat/history")) {
        return jsonResponse({ ok: true, messages: [] });
      }
      if (url === "/api/openclaw/chat/send") {
        return jsonResponse({ ok: false, error: "dispatch failed" }, 400);
      }
      return jsonResponse({ ok: true, dispatchErrors: [] });
    });

    render(<AgentChat currentAgentId="builder" initialViewMode="thread" />);

    // Default session selection prefers `...:main`. Switch to the Telegram session explicitly.
    const telegramSessionButton = await screen.findByTitle(sessionKey);
    fireEvent.click(telegramSessionButton);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Deliver externally/i,
    });
    await waitFor(() => {
      expect(checkbox).toBeChecked();
    });

    fireEvent.change(screen.getByPlaceholderText(/Message/i), { target: { value: "Try deliver" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/messages",
        expect.objectContaining({ method: "POST" })
      );
    });

    const messageCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/messages");
    expect(messageCall).toBeDefined();

    const sendCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/openclaw/chat/send");
    expect(sendCall).toBeDefined();

    const sendBody = JSON.parse((sendCall?.[1] as RequestInit).body as string);
    expect(sendBody).toMatchObject({
      sessionKey,
      deliver: true,
    });
  });
});
