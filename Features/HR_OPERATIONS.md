# XBoom Workflow — HR Operations Guide

> Operational guide for HR personnel using the XBoom Workflow platform.

---

## Table of Contents

1. [Employee Management](#employee-management)
2. [Attendance Management](#attendance-management)
3. [Leave Management](#leave-management)
4. [Payroll Operations](#payroll-operations)
5. [Bank Detail Approval Workflow](#bank-detail-approval-workflow)
6. [Candidate Database Management](#candidate-database-management)
7. [Document Management](#document-management)
8. [Employee Assets](#employee-assets)
9. [KPI Management](#kpi-management)
10. [Trainings](#trainings)

---

## Employee Management

### Creating Employees

Employees are automatically created when a user profile is approved by an admin (via database trigger `create_employee_on_profile_approval`). The employee record is linked to the user via `user_id`.

### Employee Profile Fields

| Field | Description | Editable By |
|-------|-------------|-------------|
| Name | Full name | HR / Admin |
| Department | Organization department | HR / Admin |
| Designation | Job title | HR / Admin |
| Role | System role | Admin only |
| Manager | Reporting manager | HR / Admin |
| Shift type / times | Work schedule | HR / Admin |
| Work location | Office location | HR / Admin |
| Bank account / IFSC | Salary disbursement | Via approval workflow |
| Monthly salary | Base salary amount | HR / Admin |

### Employee Status

- **Active** (`is_active = true`) — currently employed
- **Inactive** (`is_active = false`) — separated or on long leave

### Salary History

Track salary changes over time. Each entry records:
- Effective date
- Salary components (basic, HRA, conveyance, medical, special allowance)
- Total CTC

HR should create a new salary history entry whenever an employee's compensation changes.

---

## Attendance Management

### Daily Operations

1. **Monitor check-ins** — Use the Team Attendance Dashboard to view today's attendance status
2. **Review missing checkouts** — Employees who checked in but haven't checked out are flagged
3. **Process correction requests** — Employees can request corrections for missed check-in/check-out

### Correction Request Workflow

```
Employee submits correction request
       ↓
HR receives notification (Pending Corrections panel)
       ↓
HR reviews request details:
  - Current times
  - Requested times
  - Reason provided
       ↓
HR approves or rejects with notes
       ↓
If approved: attendance record updated, audit log created
If rejected: employee notified with reason
```

### Attendance Policy Settings

HR/Admin can configure:

| Setting | Description | Default |
|---------|-------------|---------|
| Work start time | Expected check-in time | 09:00 |
| Grace period | Minutes before marking late | 15 min |
| Auto-checkout hours | Max hours before auto-checkout | Configurable |
| Break warning | Minutes before break warning | Configurable |
| Break severe | Minutes before severe break alert | Configurable |
| Late alert | Enable late check-in alerts | On |
| No checkout warning | Alert for missing checkout | On |

### Auto-Checkout

A scheduled job (`auto-checkout` edge function) automatically checks out employees after the configured maximum hours. This ensures attendance records are complete even if employees forget to check out.

### Attendance Calendar

The calendar view shows:
- ✅ Present days
- ❌ Absent days
- 🕐 Late arrivals
- 📝 Correction requests
- 🔄 Auto-checkouts

---

## Leave Management

### Leave Request Flow

```
Employee applies for leave
       ↓
HR/Manager receives leave request
       ↓
Review leave balance and team schedule
       ↓
Approve or reject
       ↓
Approved leave reflected in attendance records
```

### Impact on Payroll

Leave days are factored into attendance-based deductions during salary sheet creation. The system calculates:
- Total working days in the month
- Days present (from attendance)
- Leave days (approved)
- Absent days = Working days − Present days − Leave days

---

## Payroll Operations

### Monthly Payroll Process

1. **Ensure attendance is complete** — Verify all employees have complete attendance records for the month
2. **Create salary sheet** — Navigate to HR → Salary Sheets → Create New Sheet
3. **Review entries** — Verify auto-populated earnings and deductions
4. **Adjust overrides** — Apply any manual adjustments (overtime, bonus, special deductions)
5. **Submit for HR approval** — Change status to "HR Approved"
6. **Coordinate with Finance** — Finance reviews and approves
7. **Lock sheet** — Once Finance approves, lock the sheet
8. **Generate payslips** — Create PDF payslips for all employees
9. **Generate bank transfer file** — Create NEFT-format CSV
10. **Share with Finance** — Finance uploads to bank portal

### Common Adjustments

| Adjustment | When to Apply |
|------------|---------------|
| Overtime pay | Employee worked approved overtime |
| Bonus | Performance/festival bonus |
| Loan deduction | Active loan EMI |
| Attendance override | Special circumstances (WFH, client visit) |

See [PAYROLL_MODULE.md](PAYROLL_MODULE.md) for detailed payroll documentation.

---

## Bank Detail Approval Workflow

Employee bank details are sensitive. Changes require an approval workflow:

```
Employee requests bank detail update
  (via Employee Portal → Financial Details)
       ↓
Request created in bank_update_requests table
  Status: Pending
       ↓
HR/Admin receives notification
       ↓
HR/Admin reviews:
  - Old bank account / IFSC
  - New bank account / IFSC
  - Reason for change
       ↓
Approve → Employee record updated
Reject → Employee notified with reason
       ↓
Audit log entry created
```

### Security Considerations

- Only HR and Admin can approve bank detail changes
- Changes are logged in `security_audit_log`
- Old values are preserved in the request record for audit trail
- Employee cannot directly edit bank details

---

## Candidate Database Management

### Candidate Lifecycle

```
New Application → Screening → Interview Stage → Offer → Joining → Onboarded
                                                          ↓
                                              (or) Rejected / Withdrawn
```

### Lifecycle Statuses

| Status | Description |
|--------|-------------|
| `new` | Application received |
| `screening` | Initial review |
| `interviewing` | Interview process |
| `offered` | Offer extended |
| `joined` | Employee started |
| `rejected` | Application rejected |
| `withdrawn` | Candidate withdrew |

### Managing Candidates

1. **Add candidate** — Enter full name, email, phone, skills, experience, current CTC, expected CTC
2. **Track screening** — Update screening status (pending, passed, failed)
3. **Record interviews** — Log interview rounds with interviewer, feedback, rating
4. **Upload documents** — Attach resume, offer letter, ID proof
5. **Issue offer** — Mark offer issued, track joining date
6. **Follow-up** — Set follow-up dates for pending candidates

### Candidate Fields

| Field | Description |
|-------|-------------|
| Full name, email, phone | Contact details |
| Job role applied | Position |
| Department | Target department |
| Primary skills | Skill tags |
| Years of experience | Total + relevant |
| Current/Expected CTC | Compensation |
| Notice period | Days |
| Application source | LinkedIn, referral, job portal, etc. |
| Recruiter | Assigned recruiter |

---

## Document Management

### Folder Structure

HR can create folders and organize documents:

```
HR Documents/
├── Policies/
│   ├── Leave Policy.pdf
│   └── Code of Conduct.pdf
├── Templates/
│   ├── Offer Letter Template.docx
│   └── Experience Letter Template.docx
└── Training Materials/
    └── Onboarding Guide.pdf
```

### Sharing

Documents and folders can be shared with:
- **All employees** — company-wide access
- **Specific departments** — department-level access
- **Individual employees** — personal access

### Document Viewer

Built-in document viewer for supported file types. Download option available for all files.

---

## Employee Assets

### Asset Types

| Type | Examples |
|------|----------|
| Laptop | Work laptops |
| Mobile | Company phones |
| SIM Card | Company SIM cards |
| ID Card | Employee badges |
| Vehicle | Company vehicles |
| Other | Any other equipment |

### Asset Lifecycle

```
Procured → Assigned to Employee → In Use → Returned → Available for Reassignment
```

### Tracking Fields

- Asset name, type, brand, model
- Serial number, IMEI, SIM number, phone number
- Purchase date and price
- Assigned date and condition
- Return date and condition on return
- Status: assigned, returned, damaged, lost

---

## KPI Management

### Setting KPIs

HR/Managers assign KPIs to employees with:
- Title and description
- Target value and measurement unit
- Due date (month/year)
- Priority (high, medium, low)
- Weightage (percentage)
- RAG thresholds (green/amber)

### RAG Status

| Status | Meaning |
|--------|---------|
| 🟢 Green | Achievement ≥ green threshold |
| 🟡 Amber | Achievement ≥ amber threshold but < green |
| 🔴 Red | Achievement < amber threshold |

### Progress Updates

Employees and managers can log progress updates with:
- Achieved value
- Progress notes
- Supporting attachments

---

## Trainings

### Training Management

HR can create and manage training programs:
- Training title and description
- Trainer details
- Schedule (date, time, duration)
- Participants
- Training materials
- Certificate generation after completion

### Certificate Generation

The system can generate training certificates with:
- Participant name
- Training title
- Completion date
- Certificate number (auto-generated)

---

*Last updated: 2026-03-06*
