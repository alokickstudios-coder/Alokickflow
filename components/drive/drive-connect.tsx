"use client";

import { useState, useEffect } from "react";
import { HardDrive, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function DriveConnect() {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check if connected by trying to list files
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch("/api/google/drive/list");
      setConnected(response.ok);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const connect = () => {
    window.location.href = "/api/google/auth";
  };

  const disconnect = async () => {
    // Clear cookies by calling an API or just remove from browser
    document.cookie = "google_access_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "google_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setConnected(false);
    toast({
      title: "Disconnected",
      description: "Google Drive has been disconnected",
    });
  };

  return (
    <Card className="glass border-zinc-800/50">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Google Drive
        </CardTitle>
        <CardDescription>
          Connect your Google Drive to upload and share files directly
        </CardDescription>
      </CardHeader>
      <CardContent>
        {checking ? (
          <div className="h-10 bg-zinc-800/50 rounded animate-pulse" />
        ) : connected ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-400">
              <Check className="h-5 w-5" />
              <span>Connected to Google Drive</span>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Connect Google Drive to enable direct file uploads and sharing.
            </p>
            <Button onClick={connect}>
              <HardDrive className="h-4 w-4 mr-2" />
              Connect Google Drive
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

