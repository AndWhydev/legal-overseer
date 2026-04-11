# Client Portal Requirements

## PORT-01: Portal Access & Authentication
- Agency invites client contacts to portal via magic link
- Magic link creates Supabase auth user + portal_access row
- Client lands on branded portal without seeing agency dashboard
- Multiple contacts per client org can be invited
- Access can be revoked by agency

## PORT-02: Portal Branding & White-Label
- Agency configures portal branding: logo_url, primary_color, accent_color, company_name
- Branding stored per org in portal_branding table
- Portal renders with agency branding (not BitBit branding)
- Light theme by default — clean, professional, client-facing

## PORT-03: Project Dashboard
- Client sees projects linked to their contact
- Each project shows: title, status, percentage complete, current phase
- Tasks linked to projects visible as milestone checklist
- Real-time status via Supabase subscriptions

## PORT-04: Invoice History & Downloads
- Client sees all invoices addressed to their contact
- Invoice list with status badges (draft, sent, paid, overdue)
- Download PDF for any invoice
- View invoice details inline

## PORT-05: File Exchange
- Upload/download files organized by project
- Supabase Storage bucket: portal-files/{org_id}/{contact_id}/
- File metadata stored in portal_files table
- Support common file types: images, PDFs, documents, archives

## PORT-06: Request Submission
- Client submits requests (change request, bug report, new work)
- Request creates task in agency kanban with source='portal'
- Request linked to contact_id
- Client sees their submitted requests and status

## PORT-07: Activity Feed
- Chronological feed of project activity relevant to client
- Includes: task completions, invoice updates, file uploads, status changes
- Filterable by project

## PORT-08: Notification System
- Email notifications for: invoice sent, task completed, file uploaded
- In-portal notification bell with unread count
- Notification preferences per client contact

## PORT-09: Access Control & RLS
- RLS policies: clients ONLY see their own data
- portal_access table links auth user → org → contact
- All portal queries join through portal_access
- Agency members see all portal data for their org

## PORT-10: Mobile Responsive
- Portal layout works on phones and tablets
- Touch-friendly file upload and request forms
- Responsive grid for project cards and invoice list

## PORT-11: Portal Settings (Agency Side)
- Agency manages portal from dashboard settings
- Invite/revoke client access
- Configure branding
- View portal activity log
