import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY não configurada.");
}

export const stripe = new Stripe(stripeSecretKey, {
  // Deixamos sem apiVersion para evitar incompatibilidades de tipagem
  // entre versões do SDK (Vercel pode usar versão mais recente).
});
