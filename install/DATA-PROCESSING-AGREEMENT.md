# Data Processing Agreement (Template)

**This is a template.** Have it reviewed by the firm's general counsel
and your insurer's panel solicitor before you sign. Bracketed text is
intended to be replaced. It is drafted to be compliant with the
**Privacy Act 1988 (Cth)** and the Australian Privacy Principles.

---

This Data Processing Agreement (**DPA**) is entered into on
**[Effective Date]** between:

- **[Firm Legal Name] ABN [Firm ABN]** (the "**Firm**"), being the
  Australian Privacy Principles ("**APP**") entity that controls the
  data processed by the Services; and

- **[Vendor Legal Name] ABN [Vendor ABN]** (the "**Vendor**"), being
  the supplier of the on-premises "Legal Overseer" software ("the
  **Services**").

Together, the "**Parties**".

---

## 1. Definitions

- **Personal Information** has the meaning in section 6 of the
  *Privacy Act 1988 (Cth)*.
- **Privileged Information** means information subject to legal
  professional privilege under Australian common law or statute.
- **Process** / **Processing** means any operation performed on
  Personal Information, including collection, storage, use,
  disclosure, modification and destruction.
- **Sub-processor** means any third party engaged by the Vendor or
  the Firm to Process Personal Information in connection with the
  Services.
- **Software** means the Legal Overseer application installed on the
  Firm's own infrastructure.

## 2. Scope

This DPA applies to Personal Information that the Firm Processes
using the Software in the course of providing legal services to its
clients. The Software is deployed on-premises on the Firm's own
servers; the Vendor does not host, store or maintain a copy of the
Firm's data outside the Firm's infrastructure.

## 3. Roles of the Parties

The Firm is the **APP entity** for all Personal Information it
Processes using the Software. The Vendor is a software supplier and
does not control how the Firm uses the Software. Where the Vendor
provides incidental Processing (for example, update-manifest
telemetry described in clause 7), it does so on the Firm's
documented instructions and only to the extent necessary to provide
the Services.

## 4. Firm Obligations

The Firm will:

(a) Provide notice and obtain any consents required under APP 5
    before collecting Personal Information using the Software;

(b) Operate the Software in accordance with the Vendor's
    documentation, including the `SECURITY.md` document published
    with the Software;

(c) Use the Software's built-in human review gate for all client
    correspondence and work product before transmission;

(d) Maintain access controls limiting Software use to lawyers and
    staff who have a legitimate need;

(e) Comply with the Notifiable Data Breaches scheme under Part IIIC
    of the *Privacy Act 1988 (Cth)* in the event of an eligible data
    breach.

## 5. Vendor Obligations

The Vendor will:

(a) Process Personal Information only for the purposes of supplying
    and supporting the Software;

(b) Implement and maintain the security controls described in
    `SECURITY.md`, including but not limited to: privilege
    redaction before any external model call, mandatory human review
    of every AI output, immutable hash-chained audit logging, PBKDF2
    password hashing, per-IP rate limiting, and circuit-breaker
    protection of external integrations;

(c) Notify the Firm without undue delay (and in any event within 72
    hours) of any actual or reasonably suspected breach of Personal
    Information that the Vendor becomes aware of;

(d) Provide the Firm with reasonable assistance, at the Firm's cost,
    to respond to APP-12 access requests and APP-13 correction
    requests;

(e) On termination, return or securely destroy any incidental
    Personal Information the Vendor holds, except where retention is
    required by law.

## 6. Sub-processors

The Vendor's only Sub-processor for the Services as supplied is:

| Sub-processor | Purpose                                       | Location                                |
|---------------|-----------------------------------------------|-----------------------------------------|
| Anthropic     | AI inference for skill execution. Personal Information is privilege-redacted by the Software locally before transmission and Anthropic receives a redacted payload only. | As notified by Anthropic; the Firm acknowledges that Anthropic may Process data in regions disclosed in Anthropic's public sub-processor list. |

The Firm acknowledges that operating the Software's task processor
(`ENABLE_TASK_PROCESSOR=true`) sends redacted payloads to Anthropic.
The Firm may disable this Sub-processor by setting
`ENABLE_TASK_PROCESSOR=false`, at the cost of disabling AI
classification and drafting features.

The Vendor will give the Firm 30 days' notice before adding any
further Sub-processor, during which the Firm may object in writing.
If the objection cannot be resolved, the Firm may terminate the
relevant Services without penalty.

## 7. Vendor Telemetry

The Software polls the Vendor's update manifest endpoint
(`updates.legaloverseer.com.au`) once per 24 hours to check for new
releases. The poll transmits no Personal Information and no firm
identifiers. It can be disabled at any time by setting
`UPDATE_CHECK_DISABLED=true`. No other telemetry leaves the Firm's
network.

## 8. Cross-Border Disclosure (APP 8)

Where the Firm enables Anthropic-backed features (clause 6), the
Firm is responsible for taking the steps required by APP 8.1 to
ensure Anthropic does not breach the APPs in respect of disclosed
information, including (without limitation) by ensuring the Firm's
engagement letters disclose the use of AI processing and the regions
in which that processing may occur.

## 9. Audit Rights

On 30 days' written notice and not more frequently than once per
calendar year (or more often if reasonably required to investigate a
suspected breach), the Firm may audit the Vendor's compliance with
this DPA. The audit may be satisfied by the Vendor providing
current SOC 2 / ISO 27001 attestations and an SBOM for the deployed
release.

## 10. Term &amp; Termination

This DPA continues for so long as the Vendor supplies the Services.
On termination, the Firm retains its own data on its own
infrastructure; the Vendor is not in possession of a copy.

## 11. Governing Law

This DPA is governed by the laws of **[New South Wales / Victoria /
other Australian jurisdiction]** and the Parties submit to the
non-exclusive jurisdiction of its courts.

## 12. Counterparts &amp; Execution

This DPA may be signed electronically and in counterparts.

---

**Signed for and on behalf of the Firm:**

Name: _________________________________________

Title: ________________________________________

Date: _________________________________________

**Signed for and on behalf of the Vendor:**

Name: _________________________________________

Title: ________________________________________

Date: _________________________________________
