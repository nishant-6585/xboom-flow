export type UrgencyLevel = "low" | "medium" | "high" | "critical";

// SLA hours by urgency level
export const SLA_HOURS: Record<UrgencyLevel, number> = {
  critical: 3,
  high: 6,
  medium: 9,
  low: 24,
};

export function getSlaDeadline(createdAt: Date, urgency: UrgencyLevel): Date {
  const deadline = new Date(createdAt);
  deadline.setHours(deadline.getHours() + SLA_HOURS[urgency]);
  return deadline;
}

export function isWithinSla(
  createdAt: Date,
  respondedAt: Date | null,
  urgency: UrgencyLevel
): boolean {
  const deadline = getSlaDeadline(createdAt, urgency);
  const checkTime = respondedAt || new Date();
  return checkTime <= deadline;
}

export function getSlaStatus(
  createdAt: Date,
  respondedAt: Date | null,
  urgency: UrgencyLevel,
  isResponded: boolean
): "on_track" | "at_risk" | "breached" | "met" | "delayed" {
  const deadline = getSlaDeadline(createdAt, urgency);
  const now = new Date();

  if (isResponded && respondedAt) {
    return respondedAt <= deadline ? "met" : "delayed";
  }

  // Not yet responded
  if (now > deadline) {
    return "breached";
  }

  // Check if within 1 hour of deadline
  const oneHourBefore = new Date(deadline);
  oneHourBefore.setHours(oneHourBefore.getHours() - 1);
  
  if (now >= oneHourBefore) {
    return "at_risk";
  }

  return "on_track";
}

export function getTimeRemaining(createdAt: Date, urgency: UrgencyLevel): {
  hours: number;
  minutes: number;
  isOverdue: boolean;
} {
  const deadline = getSlaDeadline(createdAt, urgency);
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  
  const isOverdue = diff < 0;
  const absDiff = Math.abs(diff);
  
  const hours = Math.floor(absDiff / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes, isOverdue };
}

export function getTimeRemainingString(createdAt: Date, urgency: UrgencyLevel): string {
  const { hours, minutes, isOverdue } = getTimeRemaining(createdAt, urgency);
  if (isOverdue) {
    return `${hours}h ${minutes}m overdue`;
  }
  return `${hours}h ${minutes}m`;
}
