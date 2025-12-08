import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Play, Shield, Zap, FileVideo, Users, BarChart3 } from "lucide-react";

// Mark as dynamic to prevent static generation issues with Supabase
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white">
            AlokickFlow
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-zinc-400 hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/50 border border-zinc-800/50 text-sm text-zinc-400 mb-8">
            <Zap className="h-4 w-4 text-yellow-400" />
            Automated Media Supply Chain
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            Streamline Your
            <br />
            <span className="bg-gradient-to-r from-zinc-400 to-zinc-200 bg-clip-text text-transparent">
              Post-Production
            </span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10">
            The all-in-one platform for post-production agencies to manage vendors,
            automate QC checks, and deliver quality content at scale.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="text-lg px-8">
                Start Free Trial
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8">
              <Play className="h-5 w-5 mr-2" />
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6 border-t border-zinc-800/50">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            Everything You Need
          </h2>
          <p className="text-zinc-400 text-center mb-12 max-w-2xl mx-auto">
            A complete solution for managing your media supply chain from upload to delivery.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileVideo,
                title: "Automated QC",
                description:
                  "AI-powered quality control checks for video, audio, and subtitles. Catch errors before delivery.",
              },
              {
                icon: Users,
                title: "Vendor Management",
                description:
                  "Onboard and manage vendors with ease. Track deliveries and maintain quality standards.",
              },
              {
                icon: Shield,
                title: "Secure Storage",
                description:
                  "Enterprise-grade security with encrypted storage and role-based access control.",
              },
              {
                icon: BarChart3,
                title: "Analytics",
                description:
                  "Real-time insights into your workflow. Track QC pass rates, delivery times, and more.",
              },
              {
                icon: Zap,
                title: "Fast Processing",
                description:
                  "Parallel processing for bulk QC checks. Process hundreds of files simultaneously.",
              },
              {
                icon: CheckCircle2,
                title: "Compliance",
                description:
                  "Ensure all deliverables meet industry standards and client specifications.",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
              >
                <feature.icon className="h-10 w-10 text-zinc-400 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-zinc-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6 border-t border-zinc-800/50">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-zinc-400 mb-8">
            Start free, upgrade when you're ready. No hidden fees.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
              <h3 className="text-lg font-semibold text-white mb-2">Free</h3>
              <p className="text-3xl font-bold text-white mb-4">$0</p>
              <p className="text-zinc-400 text-sm">Perfect for trying out</p>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-700/50 ring-2 ring-zinc-700/50">
              <h3 className="text-lg font-semibold text-white mb-2">Pro</h3>
              <p className="text-3xl font-bold text-white mb-4">$49/mo</p>
              <p className="text-zinc-400 text-sm">For growing teams</p>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
              <h3 className="text-lg font-semibold text-white mb-2">Enterprise</h3>
              <p className="text-3xl font-bold text-white mb-4">$199/mo</p>
              <p className="text-zinc-400 text-sm">For large operations</p>
            </div>
          </div>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg">Start Your Free Trial</Button>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 border-t border-zinc-800/50">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-xl text-zinc-400 mb-8">
            Join hundreds of post-production teams already using AlokickFlow.
          </p>
          <Link href="/register">
            <Button size="lg" className="text-lg px-8">
              Get Started Free
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-zinc-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-zinc-400 text-sm">
              © {new Date().getFullYear()} AlokickFlow. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-400">
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-white transition-colors">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
