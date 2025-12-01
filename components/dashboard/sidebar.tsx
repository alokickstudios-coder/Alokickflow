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
} from "lucide-react";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "My Work", href: "/dashboard/my-work", icon: Briefcase },
  { name: "Deliveries", href: "/dashboard/deliveries", icon: Upload },
  { name: "Projects", href: "/dashboard/projects", icon: FolderOpen },
  { name: "Assignments", href: "/dashboard/assignments", icon: FolderPlus },
  { name: "QC Results", href: "/dashboard/qc", icon: FileCheck },
  { name: "Bulk QC", href: "/dashboard/qc/bulk", icon: Scan },
  { name: "Vendors", href: "/dashboard/vendors", icon: Users },
  { name: "Team", href: "/dashboard/team", icon: Users },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Billing", href: "/dashboard/pricing", icon: CreditCard },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Handle escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when mobile menu is open
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
              className="font-semibold text-white text-lg"
            >
              AlokickFlow
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
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-zinc-800/50 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/30 hover:text-white",
                isMobile && "py-3.5" // Larger touch targets on mobile
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
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
              {isActive && (
                <motion.div
                  layoutId={isMobile ? "mobileActiveIndicator" : "activeIndicator"}
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white"
                />
              )}
            </Link>
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
        <span className="font-semibold text-white">AlokickFlow</span>
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
