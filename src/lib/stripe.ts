import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export const getStripe = () => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "";
  // Não lançar no import (para não quebrar o build). Validamos quando usado.
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(stripeSecretKey);
  }

  return stripeSingleton;
};
