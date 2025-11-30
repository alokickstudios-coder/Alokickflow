/**
 * Analytics tracking for AlokickFlow
 * Integrates with PostHog, Mixpanel, or custom analytics
 */

export const analytics = {
  track: (eventName: string, properties?: Record<string, any>) => {
    if (typeof window === "undefined") return;

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Analytics]", eventName, properties);
    }

    // Add your analytics provider here (PostHog, Mixpanel, etc.)
    // Example: posthog.capture(eventName, properties);
  },

  identify: (userId: string, traits?: Record<string, any>) => {
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV === "development") {
      console.log("[Analytics] Identify:", userId, traits);
    }

    // Example: posthog.identify(userId, traits);
  },

  page: (pageName: string, properties?: Record<string, any>) => {
    if (typeof window === "undefined") return;

    if (process.env.NODE_ENV === "development") {
      console.log("[Analytics] Page:", pageName, properties);
    }

    // Example: posthog.capture('$pageview', { ...properties, page: pageName });
  },
};

// Event tracking helpers
export const trackEvent = {
  fileUploaded: (fileName: string, fileSize: number, projectId: string) => {
    analytics.track("File Uploaded", { fileName, fileSize, projectId });
  },

  projectCreated: (projectCode: string, projectName: string) => {
    analytics.track("Project Created", { projectCode, projectName });
  },

  qcCompleted: (deliveryId: string, status: string, errorCount: number) => {
    analytics.track("QC Completed", { deliveryId, status, errorCount });
  },

  vendorInvited: (vendorEmail: string) => {
    analytics.track("Vendor Invited", { vendorEmail });
  },

  subscriptionUpgraded: (from: string, to: string) => {
    analytics.track("Subscription Upgraded", { from, to });
  },

  userSignedUp: (organizationName: string) => {
    analytics.track("User Signed Up", { organizationName });
  },

  userLoggedIn: () => {
    analytics.track("User Logged In");
  },
};

