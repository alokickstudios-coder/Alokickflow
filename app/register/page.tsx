"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, User, Building2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    organizationName: "",
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Use API route which has service role access
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          organizationName: formData.organizationName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      // Sign in the user after successful registration
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) throw signInError;

      toast({
        title: "Account Created",
        description: "Your account has been created successfully.",
        variant: "success",
      });

      router.push("/onboarding");
      router.refresh();
    } catch (error: any) {
      // Check for server configuration error
      const isConfigError = error.message?.includes("Server configuration") || 
                            error.message?.includes("SUPABASE_SERVICE_ROLE_KEY");
      
      toast({
        title: isConfigError ? "Server Configuration Required" : "Registration Failed",
        description: isConfigError 
          ? "The server is not properly configured. Please add SUPABASE_SERVICE_ROLE_KEY to your .env.local file. See README.md for instructions."
          : (error.message || "Failed to create account"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="glass border-zinc-800/50">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-semibold text-white mb-2">
              Create Account
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Sign up for AlokickFlow
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationName">Organization Name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="organizationName"
                    type="text"
                    placeholder="My Production Company"
                    value={formData.organizationName}
                    onChange={(e) =>
                      setFormData({ ...formData, organizationName: e.target.value })
                    }
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    minLength={6}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-zinc-500">
                  Must be at least 6 characters
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  "Creating account..."
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Account
                  </>
                )}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm">
              <span className="text-zinc-400">Already have an account? </span>
              <Link
                href="/login"
                className="text-white hover:underline font-medium"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

