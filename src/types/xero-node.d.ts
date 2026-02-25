declare module 'xero-node' {
  export class XeroClient {
    constructor(config: Record<string, unknown>)
    initialize(): Promise<void>
    buildConsentUrl(): string
    apiCallback(url: string): Promise<void>
    setTokenSet(tokenSet: Record<string, unknown>): void
    readTokenSet(): Record<string, unknown>
    refreshToken(): Promise<Record<string, unknown>>
    refreshWithRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<Record<string, unknown>>
    accountingApi: {
      getContacts(tenantId: string, options?: Record<string, unknown>, where?: string): Promise<{ body: { contacts: Contact[] } }>
      getInvoices(tenantId: string, options?: Record<string, unknown>): Promise<{ body: { invoices: Invoice[] } }>
      createInvoices(tenantId: string, invoices: Record<string, unknown>, summarizeErrors?: boolean): Promise<{ body: { invoices: Invoice[] } }>
      createContacts(tenantId: string, contacts: Record<string, unknown>): Promise<{ body: { contacts: Contact[] } }>
    }
  }

  export interface Invoice {
    invoiceID?: string
    invoiceNumber?: string
    type?: string
    contact?: { contactID?: string; name?: string }
    date?: string
    dueDate?: string
    lineItems?: LineItem[]
    reference?: string
    currencyCode?: string
    status?: string
    [key: string]: unknown
  }

  export namespace Invoice {
    enum StatusEnum {
      DRAFT = 'DRAFT',
      SUBMITTED = 'SUBMITTED',
      AUTHORISED = 'AUTHORISED',
      PAID = 'PAID',
      VOIDED = 'VOIDED',
    }
    enum TypeEnum {
      ACCPAY = 'ACCPAY',
      ACCREC = 'ACCREC',
    }
  }

  export interface LineItem {
    description?: string
    quantity?: number
    unitAmount?: number
    accountCode?: string
    [key: string]: unknown
  }

  export interface Contact {
    contactID?: string
    name?: string
    emailAddress?: string
    [key: string]: unknown
  }

  export type CurrencyCode = string
}
