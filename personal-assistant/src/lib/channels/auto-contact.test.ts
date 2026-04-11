import { describe, it, expect } from 'vitest'
import { isNoReplyAddress, extractNameFromSender } from './synthesizer'

describe('isNoReplyAddress', () => {
  it('rejects noreply@ addresses', () => {
    expect(isNoReplyAddress('noreply@example.com')).toBe(true)
    expect(isNoReplyAddress('NOREPLY@EXAMPLE.COM')).toBe(true)
  })

  it('rejects no-reply@ addresses', () => {
    expect(isNoReplyAddress('no-reply@legalsign.com.au')).toBe(true)
  })

  it('rejects no_reply@ addresses', () => {
    expect(isNoReplyAddress('no_reply@company.com')).toBe(true)
  })

  it('rejects notifications@ addresses', () => {
    expect(isNoReplyAddress('notifications@github.com')).toBe(true)
    expect(isNoReplyAddress('notification@jira.com')).toBe(true)
  })

  it('rejects mailer-daemon@ addresses', () => {
    expect(isNoReplyAddress('mailer-daemon@google.com')).toBe(true)
  })

  it('rejects bounce@ addresses', () => {
    expect(isNoReplyAddress('bounce@mail.example.com')).toBe(true)
    expect(isNoReplyAddress('bounces@mail.example.com')).toBe(true)
  })

  it('rejects donotreply@ and do-not-reply@ addresses', () => {
    expect(isNoReplyAddress('donotreply@bank.com')).toBe(true)
    expect(isNoReplyAddress('do-not-reply@service.com')).toBe(true)
  })

  it('rejects automated notify addresses', () => {
    expect(isNoReplyAddress('autonotify@system.com')).toBe(true)
    expect(isNoReplyAddress('automated-notify@ops.com')).toBe(true)
    expect(isNoReplyAddress('auto_notify@alerts.com')).toBe(true)
  })

  it('rejects alerts@ addresses', () => {
    expect(isNoReplyAddress('alerts@monitoring.com')).toBe(true)
    expect(isNoReplyAddress('alert@system.com')).toBe(true)
  })

  it('rejects SES feedback addresses', () => {
    expect(isNoReplyAddress('feedback@us-east-1.amazonses.com')).toBe(true)
  })

  it('rejects newsletter@ and marketing@ addresses', () => {
    expect(isNoReplyAddress('newsletter@company.com')).toBe(true)
    expect(isNoReplyAddress('marketing@brand.com')).toBe(true)
    expect(isNoReplyAddress('digest@weekly.com')).toBe(true)
  })

  it('rejects postmaster@ and daemon@ addresses', () => {
    expect(isNoReplyAddress('postmaster@mail.com')).toBe(true)
    expect(isNoReplyAddress('daemon@server.com')).toBe(true)
  })

  it('accepts real person email addresses', () => {
    expect(isNoReplyAddress('steve.west55@icloud.com')).toBe(false)
    expect(isNoReplyAddress('andy@allwebbedup.com.au')).toBe(false)
    expect(isNoReplyAddress('john.doe@company.com')).toBe(false)
    expect(isNoReplyAddress('support@mycompany.com')).toBe(false)
    expect(isNoReplyAddress('info@example.com')).toBe(false)
  })

  it('rejects Zendesk support subdomain addresses', () => {
    expect(isNoReplyAddress('support@company.zendesk.com')).toBe(true)
  })

  it('accepts support@ from non-Zendesk domains', () => {
    expect(isNoReplyAddress('support@mycompany.com')).toBe(false)
    expect(isNoReplyAddress('support@zendesk.com')).toBe(false)
  })
})

describe('extractNameFromSender', () => {
  it('extracts name from "Name <email>" format', () => {
    expect(extractNameFromSender('John Doe <john@example.com>')).toBe('John Doe')
  })

  it('extracts name from "Name <email>" with extra spaces', () => {
    expect(extractNameFromSender('  Jane Smith  <jane@x.com>')).toBe('Jane Smith')
  })

  it('returns sender as-is when it has no @ symbol', () => {
    expect(extractNameFromSender('Steve West')).toBe('Steve West')
  })

  it('converts email local part to title case name', () => {
    expect(extractNameFromSender('john.doe@example.com')).toBe('John Doe')
  })

  it('handles underscores in email local part', () => {
    expect(extractNameFromSender('jane_smith@company.com')).toBe('Jane Smith')
  })

  it('handles hyphens in email local part', () => {
    expect(extractNameFromSender('first-last@domain.com')).toBe('First Last')
  })

  it('prefers the email parameter over sender for local part extraction', () => {
    expect(extractNameFromSender('someone@old.com', 'real.name@new.com')).toBe('Real Name')
  })

  it('handles empty sender with email', () => {
    expect(extractNameFromSender('info@company.com', 'info@company.com')).toBe('Info')
  })

  it('trims whitespace from plain name senders', () => {
    expect(extractNameFromSender('  Andy Taleb  ')).toBe('Andy Taleb')
  })

  it('handles phone-number-like senders', () => {
    expect(extractNameFromSender('+61400111222')).toBe('+61400111222')
  })
})
