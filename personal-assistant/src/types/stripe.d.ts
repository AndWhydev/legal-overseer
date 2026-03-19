/**
 * Ambient type declarations for the 'stripe' npm package.
 * The actual SDK is installed as a production dependency but may not ship
 * bundled types in every version. This stub satisfies the TypeScript
 * compiler while keeping the real runtime behaviour intact.
 */
declare module 'stripe' {
  namespace Stripe {
    type LatestApiVersion = string

    interface Event {
      id: string
      type: string
      data: {
        object: unknown
      }
      created: number
      livemode: boolean
    }

    interface Subscription {
      id: string
      customer: string
      status: string
      metadata: Record<string, string>
      items: { data: Array<{ price: { id: string } }> }
      current_period_end: number
    }

    interface CheckoutSession {
      id: string
      url: string | null
      subscription: string
      customer: string
      metadata: Record<string, string>
    }
  }

  class Stripe {
    constructor(key: string, opts?: { apiVersion?: string })
    checkout: {
      sessions: {
        create(params: Record<string, unknown>): Promise<Stripe.CheckoutSession>
      }
    }
    subscriptions: {
      update(id: string, params: Record<string, unknown>): Promise<Stripe.Subscription>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }

  export default Stripe
  export { Stripe }
}
