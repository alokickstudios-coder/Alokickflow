"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Upload,
  FileCheck,
  Settings,
  Users,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Scan,
  CreditCard,
  BarChart3,
  FolderPlus,
  Briefcase,
  Menu,
  X,
  Workflow,
  FileVideo,
  ClipboardCheck,
  GitBranch,
} from "lucide-react";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/utils";

// Navigation organized by workflow stages
const navigation = [
  // Core Workflow
  { 
    name: "Dashboard", 
    href: "/dashboard", 
    icon: LayoutDashboard,
    section: "overview",
    description: "Overview & quick actions"
  },
  { 
    name: "My Work", 
    href: "/dashboard/my-work", 
    icon: Briefcase,
    section: "workflow",
    description: "Your assigned tasks"
  },
  
  // Production Pipeline
  { 
    name: "Projects", 
    href: "/dashboard/projects", 
    icon: FolderOpen,
    section: "production",
    description: "Manage productions"
  },
  { 
    name: "Deliveries", 
    href: "/dashboard/deliveries", 
    icon: FileVideo,
    section: "production",
    description: "Track file deliveries"
  },
  { 
    name: "Assignments", 
    href: "/dashboard/assignments", 
    icon: GitBranch,
    section: "production",
    description: "Assign work to vendors"
  },
  
  // Quality Control
  { 
    name: "QC Hub", 
    href: "/dashboard/qc/bulk", 
    icon: Scan,
    section: "quality",
    description: "Automated QC analysis"
  },
  { 
    name: "QC Results", 
    href: "/dashboard/qc", 
    icon: ClipboardCheck,
    section: "quality",
    description: "View QC reports"
  },
  
  // Team & Resources
  { 
    name: "Vendors", 
    href: "/dashboard/vendors", 
    icon: Users,
    section: "team",
    description: "Manage vendors"
  },
  { 
    name: "Team", 
    href: "/dashboard/team", 
    icon: Users,
    section: "team",
    description: "Team members"
  },
  
  // Analytics & Admin
  { 
    name: "Analytics", 
    href: "/dashboard/analytics", 
    icon: BarChart3,
    section: "admin",
    description: "Insights & reports"
  },
  { 
    name: "Billing", 
    href: "/dashboard/pricing", 
    icon: CreditCard,
    section: "admin",
    description: "Subscription & billing"
  },
  { 
    name: "Settings", 
    href: "/dashboard/settings", 
    icon: Settings,
    section: "admin",
    description: "App settings"
  },
];

const sectionLabels: Record<string, string> = {
  overview: "",
  workflow: "",
  production: "Production",
  quality: "Quality",
  team: "Team",
  admin: "Admin",
};

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    if (saved) {
      setCollapsed(saved === "true");
    }
  }, []);

  const toggleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", String(newState));
    window.dispatchEvent(new Event("sidebarToggle"));
  };

  // Group navigation items by section
  const groupedNav = navigation.reduce((acc, item) => {
    const section = item.section;
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {} as Record<string, typeof navigation>);

  const sectionOrder = ["overview", "workflow", "production", "quality", "team", "admin"];

  const NavContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo/Header */}
      <div className={cn(
        "flex h-16 items-center border-b border-zinc-800/50 px-4",
        isMobile ? "justify-between" : "justify-between"
      )}>
        <AnimatePresence mode="wait">
          {(isMobile || !collapsed) && (
            <motion.div
              key="logo"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex items-center gap-2"
            >
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                <Workflow className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="font-semibold text-white text-lg">AlokickFlow</span>
                {!isMobile && (
                  <span className="block text-[10px] text-zinc-500 -mt-0.5">Media Workflow</span>
                )}
              </div>
            </motion.div>
          )}
          {collapsed && !isMobile && (
            <motion.div
              key="logo-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center mx-auto"
            >
              <Workflow className="h-4 w-4 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-1">
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            <>
              <NotificationBell />
              <button
                onClick={toggleCollapse}
                className="hidden lg:flex rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-white"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sectionOrder.map((sectionKey) => {
          const items = groupedNav[sectionKey];
          if (!items) return null;
          const label = sectionLabels[sectionKey];

          return (
            <div key={sectionKey} className="mb-4">
              {/* Section Label */}
              {label && (isMobile || !collapsed) && (
                <div className="px-3 mb-2">
                  <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">
                    {label}
                  </span>
                </div>
              )}
              {label && collapsed && !isMobile && (
                <div className="h-px bg-zinc-800/50 mx-3 mb-2" />
              )}
              
              {/* Section Items */}
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href || 
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => isMobile && setMobileOpen(false)}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-gradient-to-r from-purple-500/10 to-transparent text-white border-l-2 border-purple-500"
                          : "text-zinc-400 hover:bg-zinc-800/30 hover:text-white",
                        isMobile && "py-3",
                        collapsed && !isMobile && "justify-center px-2"
                      )}
                      title={collapsed && !isMobile ? item.name : undefined}
                    >
                      <Icon className={cn(
                        "h-5 w-5 shrink-0",
                        isActive ? "text-purple-400" : "text-zinc-500 group-hover:text-zinc-300"
                      )} />
                      <AnimatePresence>
                        {(isMobile || !collapsed) && (
                          <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="truncate"
                          >
                            {item.name}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer/User Section */}
      <div className="border-t border-zinc-800/50 p-4">
        <AnimatePresence>
          {(isMobile || !collapsed) ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <UserMenu />
            </motion.div>
          ) : (
            <div className="flex justify-center">
              <UserMenu />
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/50 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800/50 hover:text-white"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <Workflow className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-semibold text-white">AlokickFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
        </div>
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="lg:hidden fixed left-0 top-0 z-50 h-full w-72 bg-zinc-950 border-r border-zinc-800/50 flex flex-col"
          >
            <NavContent isMobile />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: collapsed ? "4rem" : "16rem",
        }}
        className={cn(
          "hidden lg:flex fixed left-0 top-0 z-40 h-screen border-r border-zinc-800/50 bg-zinc-950/50 backdrop-blur-xl flex-col"
        )}
      >
        <NavContent />
      </motion.aside>
    </>
  );
}
