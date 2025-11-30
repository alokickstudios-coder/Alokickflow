"use client";

import { BentoGrid } from "@/components/dashboard/bento-grid";
import { RecentDeliveries } from "@/components/dashboard/recent-deliveries";
import { FileUploadZone } from "@/components/upload/file-upload-zone";
import { DriveUploader } from "@/components/drive/drive-uploader";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold text-white mb-2">
          Dashboard
        </h1>
        <p className="text-zinc-400">
          Overview of your media supply chain
        </p>
      </div>

      {/* File Upload Zone */}
      <div className="glass border-zinc-800/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Upload Files</h2>
          <DriveUploader buttonText="Upload to Google Drive" buttonVariant="outline" />
        </div>
        <FileUploadZone />
      </div>

      {/* Bento Grid Metrics */}
      <BentoGrid />

      {/* Recent Deliveries */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <RecentDeliveries />
        </div>
        <div className="lg:col-span-3">
          {/* Placeholder for additional content */}
        </div>
      </div>
    </div>
  );
}
