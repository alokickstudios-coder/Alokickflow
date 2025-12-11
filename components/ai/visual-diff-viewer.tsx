"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Layers,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Share2,
  MessageSquare,
  Flag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FrameDifference {
  frame: number;
  timestamp: string;
  type: "visual" | "audio" | "subtitle" | "metadata";
  severity: "critical" | "major" | "minor";
  description: string;
  region?: { x: number; y: number; width: number; height: number };
}

interface VisualDiffViewerProps {
  sourceUrl: string;
  compareUrl: string;
  differences?: FrameDifference[];
  onClose?: () => void;
}

export function VisualDiffViewer({
  sourceUrl,
  compareUrl,
  differences = [],
  onClose,
}: VisualDiffViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewMode, setViewMode] = useState<"side-by-side" | "overlay" | "difference">("side-by-side");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [zoom, setZoom] = useState(100);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDiff, setSelectedDiff] = useState<FrameDifference | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; time: number; text: string; user: string }>>([]);

  const sourceRef = useRef<HTMLVideoElement>(null);
  const compareRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync playback between videos
  useEffect(() => {
    if (sourceRef.current && compareRef.current) {
      if (isPlaying) {
        sourceRef.current.play();
        compareRef.current.play();
      } else {
        sourceRef.current.pause();
        compareRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Sync time
  const handleTimeUpdate = () => {
    if (sourceRef.current) {
      setCurrentTime(sourceRef.current.currentTime);
    }
  };

  const seekTo = (time: number) => {
    if (sourceRef.current && compareRef.current) {
      sourceRef.current.currentTime = time;
      compareRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 24); // Assuming 24fps
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const jumpToNextDiff = () => {
    const nextDiff = differences.find(d => {
      const diffTime = parseTimestamp(d.timestamp);
      return diffTime > currentTime;
    });
    if (nextDiff) {
      seekTo(parseTimestamp(nextDiff.timestamp));
      setSelectedDiff(nextDiff);
    }
  };

  const jumpToPrevDiff = () => {
    const prevDiff = [...differences].reverse().find(d => {
      const diffTime = parseTimestamp(d.timestamp);
      return diffTime < currentTime - 0.5;
    });
    if (prevDiff) {
      seekTo(parseTimestamp(prevDiff.timestamp));
      setSelectedDiff(prevDiff);
    }
  };

  const parseTimestamp = (timestamp: string) => {
    const [mins, secs, frames] = timestamp.split(":").map(Number);
    return mins * 60 + secs + frames / 24;
  };

  // Get differences near current time
  const currentDiffs = differences.filter(d => {
    const diffTime = parseTimestamp(d.timestamp);
    return Math.abs(diffTime - currentTime) < 1;
  });

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 border-b border-zinc-800/50">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-purple-400" />
            Visual Diff Viewer
          </h2>
          <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 bg-purple-500/10">
            Frame-Accurate Comparison
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Selector */}
          <div className="flex items-center bg-zinc-800/50 rounded-lg p-1">
            {(["side-by-side", "overlay", "difference"] as const).map((mode) => (
              <Button
                key={mode}
                variant="ghost"
                size="sm"
                className={cn(
                  "text-xs px-3",
                  viewMode === mode && "bg-purple-500/20 text-purple-400"
                )}
                onClick={() => setViewMode(mode)}
              >
                {mode.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
              </Button>
            ))}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAnnotations(!showAnnotations)}
          >
            {showAnnotations ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Viewer Area */}
      <div className="flex-1 flex">
        {/* Video Comparison Area */}
        <div className="flex-1 relative overflow-hidden bg-zinc-950">
          {viewMode === "side-by-side" && (
            <div className="flex h-full">
              <div className="flex-1 relative border-r border-zinc-800">
                <div className="absolute top-4 left-4 z-10">
                  <Badge className="bg-zinc-900/80 text-zinc-300">Source</Badge>
                </div>
                <video
                  ref={sourceRef}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
                  muted
                >
                  <source src={sourceUrl || "/demo-video.mp4"} type="video/mp4" />
                </video>
              </div>
              <div className="flex-1 relative">
                <div className="absolute top-4 left-4 z-10">
                  <Badge className="bg-zinc-900/80 text-zinc-300">Compare</Badge>
                </div>
                <video
                  ref={compareRef}
                  className="w-full h-full object-contain"
                  muted
                >
                  <source src={compareUrl || "/demo-video-2.mp4"} type="video/mp4" />
                </video>
              </div>
            </div>
          )}

          {viewMode === "overlay" && (
            <div className="relative h-full">
              <video
                ref={sourceRef}
                className="absolute inset-0 w-full h-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
                muted
              >
                <source src={sourceUrl || "/demo-video.mp4"} type="video/mp4" />
              </video>
              <video
                ref={compareRef}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ opacity: overlayOpacity / 100 }}
                muted
              >
                <source src={compareUrl || "/demo-video-2.mp4"} type="video/mp4" />
              </video>
              
              {/* Overlay Opacity Slider */}
              <div className="absolute bottom-4 left-4 right-4 p-3 bg-zinc-900/80 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-zinc-400">Source</span>
                  <Slider
                    value={[overlayOpacity]}
                    onValueChange={([v]: number[]) => setOverlayOpacity(v)}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs text-zinc-400">Compare</span>
                </div>
              </div>
            </div>
          )}

          {viewMode === "difference" && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                  <Layers className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Pixel Difference Mode</h3>
                <p className="text-sm text-zinc-400 max-w-md">
                  AI-powered pixel-level comparison highlighting exact differences between frames.
                  This mode requires video processing and is available for uploaded files.
                </p>
              </div>
            </div>
          )}

          {/* Difference Annotations */}
          {showAnnotations && currentDiffs.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {currentDiffs.map((diff, i) => (
                diff.region && (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={cn(
                      "absolute border-2 rounded",
                      diff.severity === "critical" && "border-red-500",
                      diff.severity === "major" && "border-yellow-500",
                      diff.severity === "minor" && "border-blue-500"
                    )}
                    style={{
                      left: `${diff.region.x}%`,
                      top: `${diff.region.y}%`,
                      width: `${diff.region.width}%`,
                      height: `${diff.region.height}%`,
                    }}
                  >
                    <div className={cn(
                      "absolute -top-6 left-0 px-2 py-0.5 rounded text-[10px] font-medium",
                      diff.severity === "critical" && "bg-red-500 text-white",
                      diff.severity === "major" && "bg-yellow-500 text-black",
                      diff.severity === "minor" && "bg-blue-500 text-white"
                    )}>
                      {diff.description}
                    </div>
                  </motion.div>
                )
              ))}
            </div>
          )}
        </div>

        {/* Right Panel - Differences & Comments */}
        <div className="w-80 bg-zinc-900/90 border-l border-zinc-800/50 flex flex-col">
          {/* Differences List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                Differences ({differences.length})
              </h3>
            </div>
            <div className="p-2 space-y-2">
              {differences.map((diff, i) => (
                <motion.button
                  key={i}
                  onClick={() => {
                    seekTo(parseTimestamp(diff.timestamp));
                    setSelectedDiff(diff);
                  }}
                  className={cn(
                    "w-full p-3 rounded-lg text-left transition-colors",
                    selectedDiff === diff
                      ? "bg-purple-500/20 border border-purple-500/30"
                      : "bg-zinc-800/30 hover:bg-zinc-800/50"
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        diff.severity === "critical" && "border-red-500/30 text-red-400",
                        diff.severity === "major" && "border-yellow-500/30 text-yellow-400",
                        diff.severity === "minor" && "border-blue-500/30 text-blue-400"
                      )}
                    >
                      {diff.severity}
                    </Badge>
                    <span className="text-[10px] text-zinc-500 font-mono">{diff.timestamp}</span>
                  </div>
                  <p className="text-xs text-zinc-300">{diff.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] border-zinc-700/50">
                      {diff.type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-zinc-700/50">
                      Frame {diff.frame}
                    </Badge>
                  </div>
                </motion.button>
              ))}

              {differences.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No differences detected</p>
                </div>
              )}
            </div>
          </div>

          {/* Comments Section */}
          <div className="border-t border-zinc-800/50">
            <div className="p-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-400" />
                Frame Comments ({comments.length})
              </h3>
            </div>
            <div className="p-2">
              <Button variant="outline" size="sm" className="w-full text-xs border-zinc-700/50">
                <Flag className="h-3 w-3 mr-2" />
                Add Comment at {formatTime(currentTime)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="bg-zinc-900/90 border-t border-zinc-800/50 px-4 py-3">
        {/* Timeline */}
        <div className="relative mb-3">
          {/* Difference Markers */}
          <div className="absolute inset-x-0 top-0 h-2 pointer-events-none">
            {differences.map((diff, i) => {
              const position = (parseTimestamp(diff.timestamp) / duration) * 100;
              return (
                <div
                  key={i}
                  className={cn(
                    "absolute w-1 h-2 rounded-full transform -translate-x-1/2",
                    diff.severity === "critical" && "bg-red-500",
                    diff.severity === "major" && "bg-yellow-500",
                    diff.severity === "minor" && "bg-blue-500"
                  )}
                  style={{ left: `${position}%` }}
                />
              );
            })}
          </div>

          <Slider
            value={[currentTime]}
            onValueChange={([v]: number[]) => seekTo(v)}
            max={duration || 100}
            step={0.04} // ~1 frame at 24fps
            className="mt-3"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={jumpToPrevDiff}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="bg-purple-500 hover:bg-purple-600"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={jumpToNextDiff}>
              <SkipForward className="h-4 w-4" />
            </Button>
            
            <span className="text-xs text-zinc-400 font-mono ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(50, zoom - 25))}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-zinc-400 w-12 text-center">{zoom}%</span>
            <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(200, zoom + 25))}>
              <ZoomIn className="h-4 w-4" />
            </Button>

            <div className="w-px h-4 bg-zinc-700 mx-2" />

            <Button variant="ghost" size="sm" className="text-xs">
              <Download className="h-3 w-3 mr-2" />
              Export Report
            </Button>
            <Button variant="ghost" size="sm" className="text-xs">
              <Share2 className="h-3 w-3 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
