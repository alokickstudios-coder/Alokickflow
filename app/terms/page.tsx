import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - AlokickFlow",
  description: "Terms of Service for AlokickFlow media supply chain platform",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 py-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-zinc max-w-none">
          <p className="text-zinc-400 text-lg mb-8">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-zinc-400">
              By accessing and using AlokickFlow, you accept and agree to be
              bound by these Terms of Service. If you do not agree, please do
              not use our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              2. Description of Service
            </h2>
            <p className="text-zinc-400">
              AlokickFlow is a media supply chain management platform that
              provides automated quality control, vendor management, and file
              delivery tracking services for post-production agencies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              3. Account Responsibilities
            </h2>
            <p className="text-zinc-400 mb-4">You are responsible for:</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Maintaining account security</li>
              <li>All activities under your account</li>
              <li>Ensuring accurate account information</li>
              <li>Complying with applicable laws</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              4. Acceptable Use
            </h2>
            <p className="text-zinc-400 mb-4">You agree not to:</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Upload illegal or infringing content</li>
              <li>Attempt to breach security measures</li>
              <li>Use the service for unauthorized purposes</li>
              <li>Share access credentials</li>
              <li>Abuse or overload the system</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              5. Subscription and Payments
            </h2>
            <p className="text-zinc-400">
              Paid subscriptions are billed according to the selected plan.
              Payments are non-refundable except as required by law. We reserve
              the right to modify pricing with 30 days notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              6. Intellectual Property
            </h2>
            <p className="text-zinc-400">
              You retain ownership of content you upload. We retain ownership of
              the AlokickFlow platform, branding, and technology. You grant us a
              limited license to process your content for service provision.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              7. Service Level
            </h2>
            <p className="text-zinc-400">
              We strive for 99.9% uptime. The service is provided "as is" without
              warranties. We are not liable for indirect or consequential
              damages.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              8. Termination
            </h2>
            <p className="text-zinc-400">
              Either party may terminate the agreement with 30 days notice. We
              may suspend accounts for policy violations. Upon termination, your
              data will be available for export for 30 days.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              9. Changes to Terms
            </h2>
            <p className="text-zinc-400">
              We may update these terms with notice via email or in-app
              notification. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              10. Contact
            </h2>
            <p className="text-zinc-400">
              For questions about these terms, contact us at legal@alokickflow.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

