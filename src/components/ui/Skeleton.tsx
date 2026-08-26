import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "default" | "text" | "circle";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = "default",
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "skeleton-base",
        variant === "circle" && "skeleton-circle",
        variant === "text" && "skeleton-text",
        className
      )}
      style={{
        width: width ? (typeof width === "number" ? `${width}px` : width) : undefined,
        height: height ? (typeof height === "number" ? `${height}px` : height) : undefined,
      }}
    />
  );
}

// Task Card Skeleton
export function TaskCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-task-card">
          <div className="flex items-center justify-between mb-2">
            <Skeleton width={120} height={14} />
            <Skeleton variant="circle" width={20} height={20} />
          </div>
          <Skeleton variant="text" width="90%" height={12} className="mb-1" />
          <Skeleton variant="text" width="75%" height={12} className="mb-3" />
          <div className="flex items-center gap-2">
            <Skeleton width={60} height={20} />
            <Skeleton width={60} height={20} />
          </div>
        </div>
      ))}
    </>
  );
}

// Activity Item Skeleton
export function ActivityItemSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-activity-item">
          <Skeleton variant="circle" width={32} height={32} />
          <div className="flex-1">
            <Skeleton variant="text" width="80%" height={12} className="mb-1" />
            <Skeleton variant="text" width="50%" height={10} />
          </div>
        </div>
      ))}
    </>
  );
}

// Stat Card Skeleton
export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-stat-card">
          <Skeleton variant="text" width={80} height={10} className="mb-2" />
          <Skeleton width={60} height={24} />
        </div>
      ))}
    </>
  );
}

// Agent Row Skeleton
export function AgentRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-agent-row">
          <Skeleton variant="circle" width={28} height={28} />
          <div className="flex-1">
            <Skeleton variant="text" width="60%" height={12} className="mb-1" />
            <Skeleton variant="text" width="40%" height={10} />
          </div>
          <Skeleton variant="circle" width={8} height={8} />
        </div>
      ))}
    </>
  );
}

// Agent Card Skeleton (for AgentGrid)
export function AgentCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: "140px",
            borderRadius: "12px",
          }}
        />
      ))}
    </>
  );
}

// Form Skeleton (for settings/forms)
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton width="25%" height={12} />
          <Skeleton width="100%" height={40} />
        </div>
      ))}
    </div>
  );
}

// Document Card Skeleton
export function DocumentCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-3 rounded-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--hairline)",
            opacity: 1 - i * 0.15,
          }}
        >
          <Skeleton height={16} width="66%" className="mb-2" />
          <div className="flex gap-2">
            <Skeleton height={12} width={60} />
            <Skeleton height={12} width={80} />
          </div>
        </div>
      ))}
    </>
  );
}

// Notification Card Skeleton
export function NotificationCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 rounded-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--hairline)",
            opacity: 1 - i * 0.15,
          }}
        >
          <Skeleton variant="circle" width={32} height={32} />
          <div className="flex-1 space-y-2">
            <Skeleton height={12} width="100%" />
            <Skeleton height={12} width="50%" />
          </div>
        </div>
      ))}
    </>
  );
}
