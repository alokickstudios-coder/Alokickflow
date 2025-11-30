import Stripe from "stripe";

// Lazy initialization to avoid build-time errors
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set. Please configure it in your environment variables.");
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
      typescript: true,
    });
  }
  return stripeInstance;
}

// Export as getter to allow lazy initialization
export const stripe = {
  get client() {
    return getStripe();
  },
  checkout: {
    sessions: {
      create: (params: Stripe.Checkout.SessionCreateParams) => getStripe().checkout.sessions.create(params),
    },
  },
  billingPortal: {
    sessions: {
      create: (params: Stripe.BillingPortal.SessionCreateParams) => getStripe().billingPortal.sessions.create(params),
    },
  },
  subscriptions: {
    retrieve: (id: string) => getStripe().subscriptions.retrieve(id),
  },
  customers: {
    create: (params: Stripe.CustomerCreateParams) => getStripe().customers.create(params),
  },
  webhooks: {
    constructEvent: (payload: string | Buffer, sig: string, secret: string) => 
      getStripe().webhooks.constructEvent(payload, sig, secret),
  },
};

export const STRIPE_PLANS = {
  free: {
    name: "Free",
    price: 0,
    priceId: null,
    features: [
      "1 project",
      "2 vendors",
      "1GB storage",
      "50 deliveries/month",
      "Basic QC checks",
    ],
    limits: {
      projects: 1,
      vendors: 2,
      storage: 1024 * 1024 * 1024, // 1GB
      deliveriesPerMonth: 50,
    },
  },
  pro: {
    name: "Pro",
    price: 49,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      "10 projects",
      "Unlimited vendors",
      "50GB storage",
      "500 deliveries/month",
      "Advanced QC checks",
      "Email support",
      "Custom QC rules",
    ],
    limits: {
      projects: 10,
      vendors: -1, // unlimited
      storage: 50 * 1024 * 1024 * 1024, // 50GB
      deliveriesPerMonth: 500,
    },
  },
  enterprise: {
    name: "Enterprise",
    price: 199,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
    features: [
      "Unlimited projects",
      "Unlimited vendors",
      "500GB storage",
      "Unlimited deliveries",
      "All QC features",
      "Priority support",
      "API access",
      "Custom integrations",
      "SSO support",
    ],
    limits: {
      projects: -1, // unlimited
      vendors: -1, // unlimited
      storage: 500 * 1024 * 1024 * 1024, // 500GB
      deliveriesPerMonth: -1, // unlimited
    },
  },
} as const;

export type SubscriptionTier = keyof typeof STRIPE_PLANS;

export async function createCheckoutSession(
  organizationId: string,
  priceId: string,
  customerId?: string
) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
    metadata: {
      organizationId,
    },
  });

  return session;
}

export async function createCustomerPortalSession(customerId: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
  });

  return session;
}

export async function getSubscription(subscriptionId: string) {
  return await stripe.subscriptions.retrieve(subscriptionId);
}
