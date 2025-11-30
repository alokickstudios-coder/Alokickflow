"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useState, useEffect } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(256); // 16rem = 256px

  useEffect(() => {
    // Check initial state
    const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    setSidebarWidth(isCollapsed ? 64 : 256);

    // Listen for sidebar toggle events
    const handleToggle = () => {
      const collapsed = localStorage.getItem("sidebarCollapsed") === "true";
      setSidebarWidth(collapsed ? 64 : 256);
    };
    
    window.addEventListener("sidebarToggle", handleToggle);
    window.addEventListener("storage", handleToggle);
    
    return () => {
      window.removeEventListener("sidebarToggle", handleToggle);
      window.removeEventListener("storage", handleToggle);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-zinc-950">
        <Sidebar />
        <main 
          className="flex-1 overflow-y-auto transition-all duration-300"
          style={{ marginLeft: `${sidebarWidth}px` }}
        >
          <div className="container mx-auto p-8 max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}

