import type { Feedback } from "@aros/types";

export interface NotificationDriver {
  name: string;
  validateTarget(target: Record<string, unknown>): { valid: boolean; error?: string };
  send(
    event: "approved" | "revision_requested" | "rejected",
    deliverable: { review_id: string; title: string; revision_number: number },
    feedback: Feedback | null,
    target: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;
}

// Registry
const drivers = new Map<string, NotificationDriver>();
export function registerDriver(driver: NotificationDriver) { drivers.set(driver.name, driver); }
export function getDriver(name: string): NotificationDriver | undefined { return drivers.get(name); }
