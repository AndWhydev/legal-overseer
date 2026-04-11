# BitBit -- Email Blast (Waitlist Subscribers)

## Subject Line Options (A/B Testing)

**A:** BitBit is live. Your AI operations team is ready.
**B:** You asked for it. BitBit launches today.
**C:** Stop doing admin. BitBit handles it now.

---

## Email Body

**From:** Tor @ BitBit <bitbit@bitbit.chat>
**Reply-To:** tor@bitbit.chat

---

### HTML Email Content

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BitBit is Live</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #0a0a0a;
      color: #e5e5e5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo img {
      width: 48px;
      height: 48px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 16px;
      color: #a3a3a3;
      margin-bottom: 32px;
      line-height: 1.5;
    }
    p {
      font-size: 15px;
      line-height: 1.7;
      color: #d4d4d4;
      margin-bottom: 16px;
    }
    .highlight {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1));
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    .highlight h3 {
      font-size: 14px;
      font-weight: 600;
      color: #60a5fa;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .feature-list li {
      font-size: 14px;
      color: #d4d4d4;
      padding: 6px 0;
      padding-left: 20px;
      position: relative;
    }
    .feature-list li::before {
      content: "\2713";
      position: absolute;
      left: 0;
      color: #34d399;
      font-weight: 700;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      margin: 24px 0;
    }
    .cta-wrapper {
      text-align: center;
      margin: 32px 0;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      margin: 16px 0;
    }
    .metric {
      text-align: center;
      flex: 1;
    }
    .metric-value {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
    }
    .metric-label {
      font-size: 12px;
      color: #a3a3a3;
      margin-top: 4px;
    }
    .divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
      margin: 32px 0;
    }
    .footer {
      font-size: 12px;
      color: #737373;
      text-align: center;
      line-height: 1.6;
    }
    .footer a {
      color: #737373;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Logo -->
    <div class="logo">
      <img src="https://bitbit.chat/icon.png" alt="BitBit" />
    </div>

    <h1>BitBit is live.</h1>
    <p class="subtitle">Your AI operations team is ready to get to work.</p>

    <p>Hey there,</p>

    <p>You signed up to hear when BitBit launched. That day is today.</p>

    <p>BitBit deploys specialist AI agents that run your business operations -- lead qualification, invoicing, client communications, proposals, and more. Not a chatbot that waits for instructions. A team that acts, remembers everything, and gets better over time.</p>

    <div class="highlight">
      <h3>What you get</h3>
      <ul class="feature-list">
        <li>10 specialist agents -- pick the ones that match your workflow</li>
        <li>15+ integrations -- Gmail, WhatsApp, Xero, Stripe, Calendar, Slack</li>
        <li>Total Recall memory -- remembers every conversation, every channel</li>
        <li>Confidence-based routing -- acts autonomously or asks your approval</li>
        <li>Cross-channel identity -- one conversation per person, any platform</li>
        <li>Per-agent pricing -- pay for what you use, no per-seat fees</li>
      </ul>
    </div>

    <p>We built BitBit inside a real marketing agency for 8 months before launching. Every feature exists because a real operator needed it. The results from that deployment:</p>

    <!-- Metrics - using table for email client compatibility -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="padding: 12px;">
          <div style="font-size: 24px; font-weight: 700; color: #ffffff;">&lt;2 min</div>
          <div style="font-size: 12px; color: #a3a3a3; margin-top: 4px;">Lead response time</div>
        </td>
        <td align="center" style="padding: 12px;">
          <div style="font-size: 24px; font-weight: 700; color: #ffffff;">Zero</div>
          <div style="font-size: 12px; color: #a3a3a3; margin-top: 4px;">Leads lost per month</div>
        </td>
        <td align="center" style="padding: 12px;">
          <div style="font-size: 24px; font-weight: 700; color: #ffffff;">80%</div>
          <div style="font-size: 12px; color: #a3a3a3; margin-top: 4px;">Less time on admin</div>
        </td>
      </tr>
    </table>

    <div class="cta-wrapper">
      <a href="https://bitbit.chat/signup" class="cta-button">Get started with BitBit</a>
    </div>

    <p>As a waitlist subscriber, you get early access and priority onboarding support. We will personally help you connect your services and configure your agents.</p>

    <p>If you have questions, just reply to this email. It comes straight to me.</p>

    <p>
      Cheers,<br>
      Tor<br>
      <span style="color: #a3a3a3;">Co-founder, BitBit</span>
    </p>

    <hr class="divider">

    <div class="footer">
      <p>BitBit Pty Ltd &middot; Sydney, Australia</p>
      <p>You received this because you signed up at bitbit.chat.<br>
      <a href="{{unsubscribe_url}}">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
```

---

## Plain Text Fallback

```
BitBit is live. Your AI operations team is ready.

Hey there,

You signed up to hear when BitBit launched. That day is today.

BitBit deploys specialist AI agents that run your business operations -- lead qualification, invoicing, client communications, proposals, and more. Not a chatbot that waits for instructions. A team that acts, remembers everything, and gets better over time.

WHAT YOU GET:
- 10 specialist agents -- pick the ones that match your workflow
- 15+ integrations -- Gmail, WhatsApp, Xero, Stripe, Calendar, Slack
- Total Recall memory -- remembers every conversation, every channel
- Confidence-based routing -- acts autonomously or asks your approval
- Cross-channel identity -- one conversation per person, any platform
- Per-agent pricing -- pay for what you use, no per-seat fees

We built BitBit inside a real marketing agency for 8 months before launching. The results:
- Lead response time: under 2 minutes
- Leads lost per month: zero
- Operator admin time: reduced 80%

Get started: https://bitbit.chat/signup

As a waitlist subscriber, you get early access and priority onboarding support.

Reply to this email with any questions -- it comes straight to me.

Cheers,
Tor
Co-founder, BitBit

---
BitBit Pty Ltd, Sydney, Australia
Unsubscribe: {{unsubscribe_url}}
```
