"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AICommandCenter, AICommandTrigger } from "@/components/ai/command-center";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [aiCommandOpen, setAiCommandOpen] = useState(false);

  useEffect(() => {
    // Check initial state
    const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    setCollapsed(isCollapsed);

    // Listen for sidebar toggle events
    const handleToggle = () => {
      const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
      setCollapsed(isCollapsed);
    };
    
    window.addEventListener("sidebarToggle", handleToggle);
    window.addEventListener("storage", handleToggle);
    
    return () => {
      window.removeEventListener("sidebarToggle", handleToggle);
      window.removeEventListener("storage", handleToggle);
    };
  }, []);

  // Keyboard shortcut for AI Command Center (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setAiCommandOpen(prev => !prev);
      }
      if (e.key === "Escape" && aiCommandOpen) {
        setAiCommandOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aiCommandOpen]);

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-zinc-950">
        <Sidebar />
        {/* Main content area */}
        <main 
          className={cn(
            "flex-1 overflow-y-auto transition-all duration-300",
            "pt-14 lg:pt-0",
            // ml-16 = 4rem = 64px (collapsed), ml-64 = 16rem = 256px (expanded)
            collapsed ? "lg:ml-16" : "lg:ml-64"
          )}
        >
          <div className="mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl">
            {children}
          </div>
        </main>

        {/* AI Command Center */}
        <AICommandCenter 
          isOpen={aiCommandOpen} 
          onClose={() => setAiCommandOpen(false)} 
        />
        
        {/* AI Floating Button */}
        <AICommandTrigger onClick={() => setAiCommandOpen(true)} />
      </div>
    </ErrorBoundary>
  );
}
