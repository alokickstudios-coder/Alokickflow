"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { cn } from "@/lib/utils";

const steps = [
  { id: 1, title: "Create First Project", completed: false },
  { id: 2, title: "Invite Team Members", completed: false },
  { id: 3, title: "Upload First File", completed: false },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projectData, setProjectData] = useState({ name: "", code: "" });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) throw new Error("No organization found");

      const { error } = await supabase.from("projects").insert({
        organization_id: profile.organization_id,
        code: projectData.code.toUpperCase().trim(),
        name: projectData.name.trim(),
        naming_convention_regex:
          "^([A-Z0-9_]+)[-_]?EP[_-]?(\\d{1,4})[_-]?([A-Za-z]+)[_-]?(.+)$",
      });

      if (error) throw error;

      toast({
        title: "Project Created",
        description: "Your first project has been created!",
        variant: "success",
      });

      setCurrentStep(2);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const skipOnboarding = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <Card className="glass border-zinc-800/50">
          <CardHeader>
            <div className="text-center mb-6">
              <h1 className="text-3xl font-semibold text-white mb-2">
                Welcome to AlokickFlow
              </h1>
              <p className="text-zinc-400">Let's get you set up in a few quick steps</p>
            </div>
            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                      currentStep > step.id
                        ? "bg-green-500/20 border-green-500/50 text-green-400"
                        : currentStep === step.id
                        ? "border-zinc-400 text-white"
                        : "border-zinc-800 text-zinc-600"
                    )}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-12 mx-2",
                        currentStep > step.id ? "bg-green-500/50" : "bg-zinc-800"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* Step 1: Create Project */}
            {currentStep === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <CardTitle className="text-white mb-4">
                  Create Your First Project
                </CardTitle>
                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="code">Project Code</Label>
                    <Input
                      id="code"
                      placeholder="PRT"
                      value={projectData.code}
                      onChange={(e) =>
                        setProjectData({ ...projectData, code: e.target.value })
                      }
                      required
                      maxLength={10}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                      id="name"
                      placeholder="My First Project"
                      value={projectData.name}
                      onChange={(e) =>
                        setProjectData({ ...projectData, name: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="flex gap-3 mt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={skipOnboarding}
                      className="flex-1"
                    >
                      Skip
                    </Button>
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? "Creating..." : "Continue"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Step 2: Invite Team */}
            {currentStep === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <CardTitle className="text-white mb-4">
                  Invite Team Members
                </CardTitle>
                <p className="text-zinc-400 mb-6 text-sm">
                  You can invite vendors and team members later from the Vendors page.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setCurrentStep(3)} className="flex-1">
                    Skip
                  </Button>
                  <Button onClick={() => router.push("/dashboard/vendors")} className="flex-1">
                    Invite Now
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Complete */}
            {currentStep === 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-2xl font-semibold text-white mb-2">
                  All Set!
                </h3>
                <p className="text-zinc-400 mb-6">
                  You're ready to start managing your media supply chain
                </p>
                <Button onClick={() => router.push("/dashboard")} size="lg">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

