import { createFileRoute } from "@tanstack/react-router";
import { handleStripeWebhook } from "@/lib/stripe-webhook.server";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleStripeWebhook({ request }),
    },
  },
});