"use client";

import { memo } from "react";
import { Input, FormGroup } from "@/components/ui";

interface ProfileEditorProps {
  name: string;
  role: string;
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
}

export const ProfileEditor = memo(function ProfileEditor({
  name,
  role,
  onNameChange,
  onRoleChange,
}: ProfileEditorProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-sm font-semibold mb-4 uppercase tracking-wide"
          style={{ color: "var(--text-secondary)" }}
        >
          Agent Identity
        </h3>
        <FormGroup>
          <Input
            label="Agent Name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g., PLANNER"
            hint="Display name for this agent"
          />
        </FormGroup>
      </div>

      <div>
        <FormGroup>
          <Input
            label="Role Description"
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            placeholder="e.g., Executive Assistant"
            hint="Primary function or responsibility"
          />
        </FormGroup>
      </div>

      <div
        className="p-4 rounded-lg border"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)"
        }}
      >
        <div className="flex-1">
          <div
            className="font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {name || "Agent Name"}
          </div>
          <div
            className="text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {role || "Role Description"}
          </div>
        </div>
      </div>
    </div>
  );
});
