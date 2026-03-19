/**
 * Ambient type declarations for '@stripe/stripe-js' (browser SDK).
 * Used on the pricing page for Stripe.js preloading / fraud detection.
 */
declare module '@stripe/stripe-js' {
  interface Stripe {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }

  export function loadStripe(publishableKey: string): Promise<Stripe | null>
}
