/**
 * @bitbit/roles/finance — Finance Role
 *
 * Wraps the existing invoice agent as a domain role.
 * Importing this module triggers auto-registration via registerRole().
 */

// Import triggers registerRole() at module scope
import './finance-role'

// Re-exports
export { financeRole } from './finance-role'
export { runWrappedInvoiceTick, type WrappedInvoiceTickResult } from './invoice-wrapper'
export { handleFinanceChat, type FinanceChatResult } from './finance-chat-handler'
export { computeCashFlow, type CashFlowSnapshot, type CashFlowAlert } from './cash-flow-monitor'
export { learnPaymentPatterns, predictPaymentDate, detectUnusualDelays, type PaymentPattern } from './payment-learner'
export { generateWeeklyDigest, isMondayInAEST, type WeeklyFinanceDigest } from './weekly-digest'
