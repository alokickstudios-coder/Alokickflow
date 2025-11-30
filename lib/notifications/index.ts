/**
 * Real-time Notification System
 * Uses Supabase Realtime for push notifications
 */

import { supabase } from "@/lib/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface Notification {
  id: string;
  type: "qc_complete" | "qc_failed" | "assignment_new" | "assignment_update" | "delivery_new" | "system";
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  created_at: string;
  user_id: string;
  organization_id: string;
}

export type NotificationHandler = (notification: Notification) => void;

let channel: RealtimeChannel | null = null;
const handlers: Set<NotificationHandler> = new Set();

/**
 * Subscribe to real-time notifications
 */
export async function subscribeToNotifications(
  userId: string,
  organizationId: string
): Promise<() => void> {
  // Unsubscribe from existing channel
  if (channel) {
    await channel.unsubscribe();
  }

  // Subscribe to notifications table changes
  channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const notification = payload.new as Notification;
        handlers.forEach((handler) => handler(notification));
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        const notification = payload.new as Notification;
        // Only notify if it's a broadcast or for this user
        if (!notification.user_id || notification.user_id === userId) {
          handlers.forEach((handler) => handler(notification));
        }
      }
    )
    // Subscribe to delivery status changes
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "deliveries",
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        const delivery = payload.new as any;
        const oldDelivery = payload.old as any;
        
        // Notify on QC status changes
        if (delivery.status !== oldDelivery?.status) {
          if (delivery.status === "qc_passed" || delivery.status === "qc_failed") {
            const notification: Notification = {
              id: `delivery-${delivery.id}-${Date.now()}`,
              type: delivery.status === "qc_passed" ? "qc_complete" : "qc_failed",
              title: delivery.status === "qc_passed" ? "QC Passed" : "QC Failed",
              message: `${delivery.file_name} has ${delivery.status === "qc_passed" ? "passed" : "failed"} QC`,
              data: { deliveryId: delivery.id },
              read: false,
              created_at: new Date().toISOString(),
              user_id: userId,
              organization_id: organizationId,
            };
            handlers.forEach((handler) => handler(notification));
          }
        }
      }
    )
    // Subscribe to assignment changes
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "drive_assignments",
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        const assignment = payload.new as any;
        const notification: Notification = {
          id: `assignment-${assignment.id}`,
          type: "assignment_new",
          title: "New Assignment",
          message: `New work assigned: ${assignment.display_name}`,
          data: { assignmentId: assignment.id },
          read: false,
          created_at: new Date().toISOString(),
          user_id: assignment.vendor_id,
          organization_id: organizationId,
        };
        
        if (assignment.vendor_id === userId) {
          handlers.forEach((handler) => handler(notification));
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
  };
}

/**
 * Add notification handler
 */
export function addNotificationHandler(handler: NotificationHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/**
 * Remove notification handler
 */
export function removeNotificationHandler(handler: NotificationHandler): void {
  handlers.delete(handler);
}

/**
 * Send a notification (stores in database)
 */
export async function sendNotification(notification: Omit<Notification, "id" | "created_at" | "read">): Promise<boolean> {
  try {
    const { error } = await supabase.from("notifications").insert({
      ...notification,
      read: false,
    });

    return !error;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    return !error;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return false;
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    return !error;
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return false;
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    return error ? 0 : count || 0;
  } catch (error) {
    console.error("Error getting unread count:", error);
    return 0;
  }
}

/**
 * Get recent notifications
 */
export async function getNotifications(
  userId: string,
  limit: number = 20
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    return error ? [] : data || [];
  } catch (error) {
    console.error("Error getting notifications:", error);
    return [];
  }
}

