"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.session) throw new Error("No session created");

      toast({
        title: "Welcome back!",
        description: "Redirecting to dashboard...",
        variant: "success",
      });

      // Small delay to ensure cookies are set, then hard redirect
      setTimeout(() => {
        window.location.replace("/dashboard");
      }, 500);
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-8 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="glass border-zinc-800/50">
          <CardHeader className="space-y-1 text-center px-4 sm:px-6 pt-6 sm:pt-8 pb-2">
            <CardTitle className="text-2xl sm:text-3xl font-semibold text-white mb-1 sm:mb-2">
              AlokickFlow
            </CardTitle>
            <CardDescription className="text-sm sm:text-base text-zinc-400">
              Sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-6 sm:pb-8">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 h-11 sm:h-10 text-base sm:text-sm"
                    autoCapitalize="off"
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-10 h-11 sm:h-10 text-base sm:text-sm"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 sm:h-10 text-base sm:text-sm" 
                disabled={loading}
              >
                {loading ? (
                  "Signing in..."
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm">
              <Link
                href="/forgot-password"
                className="text-zinc-400 hover:text-white transition-colors py-2 inline-block"
              >
                Forgot password?
              </Link>
            </div>
            <div className="mt-4 sm:mt-6 text-center text-sm">
              <span className="text-zinc-400">Don't have an account? </span>
              <Link
                href="/register"
                className="text-white hover:underline font-medium py-2 inline-block"
              >
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
        
        {/* Footer Links */}
        <div className="mt-6 flex justify-center gap-4 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
            Privacy
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">
            Terms
          </Link>
          <span>•</span>
          <Link href="/contact" className="hover:text-zinc-300 transition-colors">
            Contact
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
