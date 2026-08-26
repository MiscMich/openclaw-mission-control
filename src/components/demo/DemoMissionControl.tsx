"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Activity, Bot, Check, ChevronRight, CircleAlert, Clock3, Gauge, LayoutDashboard,
  MessageSquare, Plus, Radio, RefreshCw, Search, Send, Settings, ShieldCheck, X,
} from "lucide-react";
import { demoAgents, initialAuditEvents, initialDemoRuns, initialMessages, type DemoRun } from "@/lib/demo/fixtures";
import styles from "./DemoMissionControl.module.css";

type Tab = "workflows" | "agents" | "messages" | "monitor" | "settings";

const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "workflows", label: "Workflows", icon: LayoutDashboard },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "monitor", label: "Monitor", icon: Gauge },
  { id: "settings", label: "Settings", icon: Settings },
];

const statusLabels = {
  done: "Done",
  running: "Running",
  retrying: "Retrying",
  needs_human: "Approval",
  waiting: "Waiting",
};

export function DemoMissionControl() {
  const [activeTab, setActiveTab] = useState<Tab>("workflows");
  const [runs, setRuns] = useState(initialDemoRuns);
  const [events, setEvents] = useState(initialAuditEvents);
  const [messages, setMessages] = useState(initialMessages);
  const [message, setMessage] = useState("");
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [runTitle, setRunTitle] = useState("");
  const [toast, setToast] = useState("Demo adapter connected");
  const [compactMode, setCompactMode] = useState(true);

  const activeLeases = useMemo(
    () => runs.flatMap((run) => run.steps).filter((step) => step.status === "running").length,
    [runs]
  );
  const pendingApprovals = useMemo(
    () => runs.flatMap((run) => run.steps).filter((step) => step.status === "needs_human").length,
    [runs]
  );

  function record(type: string, actor: string, text: string) {
    setEvents((current) => [
      { id: `audit-local-${current.length + 1}`, time: "09:20:00", actor, type, message: text },
      ...current,
    ]);
  }

  function resolveApproval(decision: "approve" | "retry") {
    setRuns((current) => current.map((run) => {
      if (run.id !== "run-001") return run;
      return {
        ...run,
        progress: decision === "approve" ? 100 : 45,
        steps: run.steps.map((step) => {
          if (step.id === "approve") return decision === "approve"
            ? { ...step, status: "done" as const, detail: "Approved by Operator" }
            : { ...step, status: "waiting" as const, detail: "Waiting for verification retry" };
          if (decision === "retry" && step.id === "verify") return {
            ...step,
            status: "running" as const,
            retryCount: 2,
            detail: "Retry 2 of 2 · lease owned by Reviewer",
            leaseUntil: "15 min",
          };
          return step;
        }),
      };
    }));
    if (decision === "approve") {
      record("human_approved", "Operator", "Release approval granted; run completed");
      setToast("Run approved and completed");
    } else {
      record("human_rejected", "Operator", "Approval returned to verification for retry 2 of 2");
      setToast("Changes requested; bounded retry started");
    }
  }

  function createRun(event: FormEvent) {
    event.preventDefault();
    const title = runTitle.trim();
    if (!title) return;
    const run: DemoRun = {
      id: `run-${String(runs.length + 1).padStart(3, "0")}`,
      title,
      workflow: "General workflow",
      created: "09:20",
      progress: 12,
      steps: [
        { id: "plan", label: "Plan work", owner: "Coordinator", status: "running", detail: "Lease owned by Coordinator", leaseUntil: "15 min" },
        { id: "execute", label: "Execute plan", owner: "Builder", status: "waiting", detail: "Waiting for plan" },
        { id: "verify", label: "Verify result", owner: "Reviewer", status: "waiting", detail: "Waiting for execution" },
        { id: "approve", label: "Operator approval", owner: "Operator", status: "waiting", detail: "Gate opens after verification" },
      ],
    };
    setRuns((current) => [run, ...current]);
    record("run_created", "Operator", `${title} created from deterministic local fixtures`);
    setRunTitle("");
    setNewRunOpen(false);
    setToast("New demo run started");
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = message.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: `message-${current.length + 1}`, from: "Operator", body, time: "09:20" }]);
    record("message_sent", "Operator", "Message sent to Coordinator");
    setMessage("");
    setToast("Message recorded in the demo audit trail");
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Primary navigation">
        <div className={styles.brand}>
          <div className={styles.mark}><Radio size={18} /></div>
          <div><strong>OpenClaw</strong><span>OpenClaw Mission Control</span></div>
        </div>
        <nav className={styles.nav}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={activeTab === tab.id ? styles.navActive : ""} onClick={() => setActiveTab(tab.id)}>
                <Icon size={17} /><span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className={styles.demoCard}>
          <span className={styles.liveDot} />
          <div><strong>Local demo</strong><span>No credentials required</span></div>
        </div>
      </aside>

      <main className={styles.main} id="main-content">
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>OPERATIONS WORKSPACE</p><h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1></div>
          <div className={styles.headerActions}>
            <button className={styles.iconButton} aria-label="Search demo data"><Search size={18} /></button>
            <div className={styles.connection}><span className={styles.liveDot} /> Fixture adapter</div>
            {activeTab === "workflows" && <button className={styles.primaryButton} onClick={() => setNewRunOpen(true)}><Plus size={17} /> New run</button>}
          </div>
        </header>

        <section className={styles.content}>
          {activeTab === "workflows" && (
            <>
              <div className={styles.statGrid}>
                <Stat label="Active runs" value={String(runs.length)} meta="2 workflow templates" icon={<Activity size={18} />} />
                <Stat label="Active leases" value={String(activeLeases)} meta="15 minute windows" icon={<Clock3 size={18} />} />
                <Stat label="Needs approval" value={String(pendingApprovals)} meta="Operator decision" icon={<ShieldCheck size={18} />} tone="warning" />
                <Stat label="Retry budget" value="1 / 2" meta="Bounded, never unending" icon={<RefreshCw size={18} />} />
              </div>

              <div className={styles.sectionHeading}><div><h2>Workflow runs</h2><p>Durable steps with leases, retry budgets, and approval gates.</p></div><button className={styles.textButton} onClick={() => setToast("Fixture data refreshed")}>Refresh <RefreshCw size={14} /></button></div>
              <div className={styles.runList}>
                {runs.map((run) => (
                  <article className={styles.runCard} key={run.id}>
                    <div className={styles.runTop}>
                      <div><div className={styles.runMeta}><span>{run.workflow}</span><span>{run.id}</span><span>{run.created}</span></div><h3>{run.title}</h3></div>
                      <div className={styles.progressBlock}><strong>{run.progress}%</strong><div className={styles.progressTrack}><span style={{ width: `${run.progress}%` }} /></div></div>
                    </div>
                    <div className={styles.stepTrack}>
                      {run.steps.map((step, index) => (
                        <div className={`${styles.step} ${styles[`step_${step.status}`]}`} key={step.id}>
                          <div className={styles.stepRail}><span>{step.status === "done" ? <Check size={13} /> : index + 1}</span>{index < run.steps.length - 1 && <i />}</div>
                          <div className={styles.stepBody}><div><strong>{step.label}</strong><span>{step.owner}</span></div><em>{statusLabels[step.status]}</em><p>{step.detail}{step.leaseUntil ? ` · ${step.leaseUntil}` : ""}</p></div>
                        </div>
                      ))}
                    </div>
                    {run.id === "run-001" && run.steps.some((step) => step.status === "needs_human") && (
                      <div className={styles.approvalBar}><div><ShieldCheck size={18} /><span><strong>Approval required</strong><small>Review passed with one bounded retry.</small></span></div><div><button className={styles.secondaryButton} onClick={() => resolveApproval("retry")}>Request changes</button><button className={styles.primaryButton} onClick={() => resolveApproval("approve")}><Check size={16} /> Approve</button></div></div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}

          {activeTab === "agents" && <AgentView />}
          {activeTab === "messages" && <MessagesView messages={messages} message={message} setMessage={setMessage} sendMessage={sendMessage} />}
          {activeTab === "monitor" && <MonitorView events={events} setToast={setToast} />}
          {activeTab === "settings" && <SettingsView compact={compactMode} setCompact={setCompactMode} setToast={setToast} />}
        </section>
      </main>

      <div className={styles.toast} role="status"><span className={styles.liveDot} />{toast}</div>

      {newRunOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setNewRunOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="new-run-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}><div><p className={styles.eyebrow}>DETERMINISTIC FIXTURE</p><h2 id="new-run-title">Start a workflow run</h2></div><button className={styles.iconButton} onClick={() => setNewRunOpen(false)} aria-label="Close"><X size={18} /></button></div>
            <form onSubmit={createRun}>
              <label>Run title<input autoFocus value={runTitle} onChange={(event) => setRunTitle(event.target.value)} placeholder="Example: Verify documentation release" maxLength={120} /></label>
              <label>Workflow<select defaultValue="general"><option value="general">General workflow</option><option value="release">Release readiness</option><option value="issue">Issue response</option></select></label>
              <div className={styles.fixtureNote}><CircleAlert size={16} /> Demo runs stay in browser memory and reset on refresh.</div>
              <div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={() => setNewRunOpen(false)}>Cancel</button><button type="submit" className={styles.primaryButton}>Start run <ChevronRight size={16} /></button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, meta, icon, tone }: { label: string; value: string; meta: string; icon: React.ReactNode; tone?: "warning" }) {
  return <div className={`${styles.stat} ${tone === "warning" ? styles.statWarning : ""}`}><div><span>{label}</span>{icon}</div><strong>{value}</strong><p>{meta}</p></div>;
}

function AgentView() {
  return <div><div className={styles.sectionHeading}><div><h2>Neutral fixture team</h2><p>Generic roles replace personal or themed agent rosters.</p></div></div><div className={styles.agentGrid}>{demoAgents.map((agent) => <article className={styles.agentCard} key={agent.id}><div className={styles.agentAvatar} style={{ background: agent.color }}>{agent.name[0]}</div><div><h3>{agent.name}</h3><p>{agent.role}</p></div><span>{agent.status}</span><div className={styles.agentMetrics}><small>Current lease</small><strong>{agent.id === "builder" ? "Apply changes" : agent.id === "reviewer" ? "Verify output" : "Available"}</strong></div></article>)}</div></div>;
}

function MessagesView({ messages, message, setMessage, sendMessage }: { messages: typeof initialMessages; message: string; setMessage: (value: string) => void; sendMessage: (event: FormEvent) => void }) {
  return <div className={styles.messagesLayout}><aside className={styles.threadList}><p className={styles.eyebrow}>AGENT THREADS</p>{demoAgents.map((agent, index) => <button className={index === 0 ? styles.threadActive : ""} key={agent.id}><span className={styles.agentAvatar} style={{ background: agent.color }}>{agent.name[0]}</span><span><strong>{agent.name}</strong><small>{index === 0 ? "Release run updates" : "No unread messages"}</small></span></button>)}</aside><section className={styles.conversation}><div className={styles.conversationHeader}><div className={styles.agentAvatar} style={{ background: "#7c6df2" }}>C</div><div><strong>Coordinator</strong><span>Demo channel · audit enabled</span></div></div><div className={styles.messageStream}>{messages.map((item) => <div className={`${styles.message} ${item.from === "Operator" ? styles.messageOwn : ""}`} key={item.id}><span>{item.from}</span><p>{item.body}</p><time>{item.time}</time></div>)}</div><form className={styles.composer} onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message Coordinator…" maxLength={500} aria-label="Message Coordinator"/><button className={styles.primaryButton} type="submit"><Send size={16} /> Send</button></form></section></div>;
}

function MonitorView({ events, setToast }: { events: typeof initialAuditEvents; setToast: (value: string) => void }) {
  return <div><div className={styles.monitorGrid}><Stat label="Fixture uptime" value="42m" meta="Local process" icon={<Activity size={18} />} /><Stat label="Event latency" value="18ms" meta="In-memory adapter" icon={<Gauge size={18} />} /><Stat label="Failed steps" value="0" meta="Last 24 fixture hours" icon={<ShieldCheck size={18} />} /></div><div className={styles.monitorColumns}><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Connection states</h2><p>Exercise transition messaging without a gateway.</p></div></div><div className={styles.connectionRows}><div><span className={styles.liveDot} /><div><strong>Fixture stream</strong><small>Connected · stable</small></div><button className={styles.secondaryButton} onClick={() => setToast("Reconnecting… transient streams remain healthy")}>Simulate reconnect</button></div><div><span className={styles.liveDot} /><div><strong>Workflow scheduler</strong><small>2 leases · 1 approval</small></div><button className={styles.secondaryButton} onClick={() => setToast("Scheduler check completed")}>Check now</button></div></div></section><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Audit events</h2><p>Append-only fixture activity.</p></div></div><div className={styles.auditList}>{events.map((event) => <div key={event.id}><time>{event.time}</time><span><strong>{event.type.replaceAll("_", " ")}</strong><p>{event.message}</p><small>{event.actor}</small></span></div>)}</div></section></div></div>;
}

function SettingsView({ compact, setCompact, setToast }: { compact: boolean; setCompact: (value: boolean) => void; setToast: (value: string) => void }) {
  return <div className={styles.settingsPanel}><div className={styles.sectionHeading}><div><h2>Local demo settings</h2><p>Safe defaults with no hidden credentials or remote services.</p></div></div><div className={styles.settingRow}><div><strong>Compact workflow steps</strong><p>Keep run details concise until an operator needs them.</p></div><button role="switch" aria-checked={compact} className={`${styles.switch} ${compact ? styles.switchOn : ""}`} onClick={() => setCompact(!compact)}><span /></button></div><div className={styles.settingRow}><div><strong>Credential status</strong><p>Convex and OpenClaw are intentionally disconnected in demo mode.</p></div><span className={styles.safeBadge}><ShieldCheck size={15} /> No secrets loaded</span></div><div className={styles.settingRow}><div><strong>Workspace access</strong><p>File APIs remain unavailable until an explicit root and authentication are configured.</p></div><span className={styles.safeBadge}>Fail closed</span></div><button className={styles.primaryButton} onClick={() => setToast("Demo preferences saved in memory")}>Save preferences</button></div>;
}
