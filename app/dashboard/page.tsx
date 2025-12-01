"use client";

import { BentoGrid } from "@/components/dashboard/bento-grid";
import { RecentDeliveries } from "@/components/dashboard/recent-deliveries";
import { FileUploadZone } from "@/components/upload/file-upload-zone";
import { DriveUploader } from "@/components/drive/drive-uploader";

export default function DashboardPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2">
          Dashboard
        </h1>
        <p className="text-sm sm:text-base text-zinc-400">
          Overview of your media supply chain
        </p>
      </div>

      {/* File Upload Zone */}
      <div className="glass border-zinc-800/50 rounded-lg p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-white">Upload Files</h2>
          <DriveUploader buttonText="Upload to Drive" buttonVariant="outline" />
        </div>
        <FileUploadZone />
      </div>

      {/* Bento Grid Metrics */}
      <BentoGrid />

      {/* Recent Deliveries - Full width on mobile */}
      <div className="grid gap-4 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <RecentDeliveries />
        </div>
        <div className="lg:col-span-3">
          {/* Quick Actions Card */}
          <div className="glass border-zinc-800/50 rounded-lg p-4 sm:p-6 h-full">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <a 
                href="/dashboard/qc/bulk" 
                className="block p-3 sm:p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
              >
                <p className="text-sm font-medium text-purple-300">Bulk QC Analysis</p>
                <p className="text-xs text-zinc-400 mt-1">Process multiple files at once</p>
              </a>
              <a 
                href="/dashboard/projects" 
                className="block p-3 sm:p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
              >
                <p className="text-sm font-medium text-blue-300">Manage Projects</p>
                <p className="text-xs text-zinc-400 mt-1">Create and organize projects</p>
              </a>
              <a 
                href="/dashboard/vendors" 
                className="block p-3 sm:p-4 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors"
              >
                <p className="text-sm font-medium text-green-300">Vendor Management</p>
                <p className="text-xs text-zinc-400 mt-1">Invite and manage vendors</p>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
