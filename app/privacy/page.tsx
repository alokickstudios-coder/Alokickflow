import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - AlokickFlow",
  description: "Privacy Policy for AlokickFlow media supply chain platform",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 py-20 px-6">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-zinc max-w-none">
          <p className="text-zinc-400 text-lg mb-8">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              1. Information We Collect
            </h2>
            <p className="text-zinc-400 mb-4">
              We collect information you provide directly, including:
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Account information (name, email, organization)</li>
              <li>Media files uploaded for QC processing</li>
              <li>Usage data and analytics</li>
              <li>Communication preferences</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              2. How We Use Your Information
            </h2>
            <p className="text-zinc-400 mb-4">
              We use collected information to:
            </p>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Provide and improve our services</li>
              <li>Process QC checks on uploaded media</li>
              <li>Send important notifications</li>
              <li>Ensure platform security</li>
              <li>Analyze usage patterns</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              3. Data Security
            </h2>
            <p className="text-zinc-400">
              We implement industry-standard security measures including encryption
              at rest and in transit, regular security audits, and role-based
              access control. Your media files are stored securely and only
              accessible to authorized personnel within your organization.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              4. Data Retention
            </h2>
            <p className="text-zinc-400">
              We retain your data for as long as your account is active or as
              needed to provide services. Media files are retained according to
              your subscription plan settings. You may request deletion of your
              data at any time.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              5. Your Rights
            </h2>
            <p className="text-zinc-400 mb-4">You have the right to:</p>
            <ul className="list-disc list-inside text-zinc-400 space-y-2">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Delete your data</li>
              <li>Export your data</li>
              <li>Opt-out of marketing communications</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">
              6. Contact Us
            </h2>
            <p className="text-zinc-400">
              For privacy-related inquiries, please contact us at
              privacy@alokickflow.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

