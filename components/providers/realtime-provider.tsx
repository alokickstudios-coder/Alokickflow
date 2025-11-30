"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RealtimeProviderProps {
  children: React.ReactNode;
  organizationId?: string;
}

export function RealtimeProvider({ children, organizationId }: RealtimeProviderProps) {
  const { toast } = useToast();

  useEffect(() => {
    if (!organizationId) return;

    // Subscribe to deliveries changes
    const deliveriesChannel = supabase
      .channel("deliveries-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deliveries",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            toast({
              title: "New Delivery",
              description: "A new file has been uploaded",
            });
          } else if (payload.eventType === "UPDATE") {
            const newStatus = (payload.new as any).status;
            if (newStatus === "qc_passed") {
              toast({
                title: "QC Passed",
                description: "A file has passed QC checks",
                variant: "success",
              });
            } else if (newStatus === "qc_failed") {
              toast({
                title: "QC Failed",
                description: "A file has failed QC checks",
                variant: "destructive",
              });
            }
          }
        }
      )
      .subscribe();

    // Subscribe to projects changes
    const projectsChannel = supabase
      .channel("projects-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "projects",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          toast({
            title: "New Project",
            description: `Project "${(payload.new as any).name}" was created`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(deliveriesChannel);
      supabase.removeChannel(projectsChannel);
    };
  }, [organizationId, toast]);

  return <>{children}</>;
}

