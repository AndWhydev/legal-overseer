import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || '')
}

export interface SendInvoiceEmailOptions {
  to: string
  invoiceNumber: string
  html: string
  from?: string
  subject?: string
}

export interface SendInvoiceEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendInvoiceEmail(
  options: SendInvoiceEmailOptions,
): Promise<SendInvoiceEmailResult> {
  const from = options.from || process.env.RESEND_FROM_EMAIL || 'invoices@bitbit.chat'
  const subject = options.subject || `Invoice ${options.invoiceNumber}`

  if (!process.env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const { data, error } = await getResend().emails.send({
      from,
      to: [options.to],
      subject,
      html: options.html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: data?.id }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
