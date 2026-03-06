# XBoom Workflow — Module Index (AI Context)

> Maps every module to its tables, hooks, components, and key workflows.

---

## Sales Module

| Aspect | Details |
|--------|---------|
| **Tables** | `enquiries`, `enquiry_items`, `enquiry_tags`, `lead_tags`, `duplicate_alerts`, `ai_scoring_logs`, `pipeline_orders` |
| **Hooks** | `useEnquiries`, `useEnquiryItems`, `usePipelineOrders`, `useAutoAIScoring`, `useDuplicateDetection`, `useLeadTags` |
| **Pages** | `Sales.tsx`, `Orders.tsx` |
| **Key Components** | `EnquiryTable`, `EnquiryDialog`, `PipelineTable`, `AILeadScoring`, `AISalesAssistant`, `HotLeadsWidget`, `SalesFunnelDashboard` |
| **Workflow** | Lead Source → Enquiry → AI Scoring → Pipeline → Quote → Order → Invoice → Payment |

---

## Orders Module

| Aspect | Details |
|--------|---------|
| **Tables** | `orders`, `order_items`, `payment_records` |
| **Hooks** | `useOrders`, `useOrderItems`, `usePaymentRecords` |
| **Pages** | `Orders.tsx` |
| **Key Components** | `OrderTable`, `OrderDialog`, `OrderForm`, `PaymentStatusTracker`, `OrderProfitAnalytics` |
| **Workflow** | Order Created → Items Added → Payments Tracked → Delivered/Completed |

---

## Billing Module

| Aspect | Details |
|--------|---------|
| **Tables** | `quotes`, `quote_items`, `invoices`, `invoice_items` |
| **Hooks** | `useQuotes`, `useInvoices`, `useMarginGuardrail` |
| **Pages** | `Billing.tsx` |
| **Key Components** | `QuoteForm`, `QuotesTable`, `InvoiceForm`, `InvoicesTable`, `InvoiceSignatureDialog`, `MarginRiskIndicator` |
| **Workflow** | Quote Created → Sent → Accepted/Rejected → Invoice Generated → Signed → Paid |
| **Constraint** | Signed invoices cannot be modified |

---

## Inventory Module

| Aspect | Details |
|--------|---------|
| **Tables** | `inventory`, `demand_forecasts`, `forecast_accuracy_log` |
| **Hooks** | `useInventory` |
| **Pages** | `Inventory.tsx` |
| **Key Components** | `DemandForecastWidget` |
| **Edge Functions** | `demand-forecast`, `low-stock-alerts` |

---

## Procurement Module

| Aspect | Details |
|--------|---------|
| **Tables** | `inventory_procurements`, `inventory_procurement_payments`, `procurement_payment_requests`, `supplier_quotations`, `supplier_ratings` |
| **Hooks** | `useInventoryProcurements`, `useInventoryProcurementPayments`, `useProcurementPaymentRequests`, `useSupplierQuotations`, `useSupplierRatings` |
| **Pages** | `Procurement.tsx` |
| **Key Components** | `ProcurementDashboard`, `ProcurementOrders`, `SupplierPaymentAnalytics`, `ProcurementLedger` |
| **Workflow** | Requirement → Supplier Selection → PO Created → Payments Tracked → Received |

---

## Finance Module

| Aspect | Details |
|--------|---------|
| **Tables** | `expenses`, `expense_order_links`, `expense_procurement_links`, `expected_payments`, `petty_cash_transactions` |
| **Hooks** | `useExpenses`, `useExpenseLinks`, `useExpectedPayments`, `usePettyCash` |
| **Pages** | `Finance.tsx`, `Expenses.tsx`, `PayrollReconciliation.tsx` |
| **Key Components** | `CashflowChart`, `CreditDebitOverview`, `InvoiceAgingDashboard`, `PaymentRiskWidget` |

---

## HR Module

| Aspect | Details |
|--------|---------|
| **Tables** | `employees`, `employee_assets`, `employee_kpis`, `employee_kpi_progress`, `employee_roles_responsibilities`, `hr_documents`, `hr_document_sharing` |
| **Hooks** | `useHR`, `useEmployeeAssets`, `useKPIManagement`, `useHRDocuments` |
| **Pages** | `HR.tsx`, `MyProfile.tsx` |
| **Key Components** | `AttendanceSection`, `TeamAttendancePanel`, `AssetManagementPanel`, `KPIManagementPanel`, `HRDocumentsPanel` |
| **Docs** | `Features/HR_OPERATIONS.md` |

---

## Attendance Module

| Aspect | Details |
|--------|---------|
| **Tables** | `attendance_logs`, `attendance_breaks`, `attendance_correction_requests`, `attendance_audit_log`, `attendance_policy_settings`, `attendance_notifications_log` |
| **Hooks** | `useAttendanceWidget`, `useAttendanceCorrectionRequests` |
| **Key Components** | `AttendanceWidget`, `MobileAttendanceFAB`, `TeamAttendanceOverview`, `PendingCorrectionApprovals` |
| **Edge Functions** | `attendance-nudge`, `auto-checkout` |
| **Workflow** | Check-in → Breaks → Check-out → Correction Request (if needed) → HR Approval |

---

## Payroll Module

| Aspect | Details |
|--------|---------|
| **Tables** | `salary_sheets`, `salary_sheet_entries`, `salary_history`, `employee_payslips`, `payroll_transfer_files`, `payroll_payment_status`, `employee_bank_update_requests` |
| **Hooks** | `useSalarySheets` |
| **Pages** | `HR.tsx` (Payroll tab), `PayrollReconciliation.tsx` |
| **Key Components** | `SalarySheetView`, `BankTransferFileGenerator`, `EmployeePayslipsPanel`, `PayrollSummaryPanel` |
| **Docs** | `Features/PAYROLL_MODULE.md` |
| **Workflow** | Attendance → Sheet → HR Approve → Finance Approve → Lock → Payslips → Bank File → Reconciliation |

---

## Recruitment Module

| Aspect | Details |
|--------|---------|
| **Tables** | `candidates`, `candidate_documents`, `interview_records` |
| **Hooks** | `useCandidates` |
| **Pages** | `Candidates.tsx` |
| **Key Components** | `CandidatesPanel`, `CandidateFormDialog`, `CandidateDetailDialog`, `InterviewRecordDialog` |
| **Workflow** | Applied → Screening → Interview → Offered → Joined / Rejected / Dropped |

---

## Tickets Module

| Aspect | Details |
|--------|---------|
| **Tables** | `tickets`, `ticket_comments` |
| **Hooks** | `useTickets` |
| **Pages** | `Tickets.tsx` |
| **Key Components** | `TicketTable`, `TicketFormDialog`, `TicketDetailDialog`, `TicketPerformanceDashboard` |
| **Edge Functions** | `send-ticket-email` |

---

## Meetings Module

| Aspect | Details |
|--------|---------|
| **Tables** | `meetings`, `meeting_attendees` |
| **Hooks** | `useMeetings` |
| **Pages** | `Meetings.tsx` |
| **Key Components** | `TeamCalendar`, `MeetingDetailModal`, `LeadMeetingsPanel` |

---

## Forms Module

| Aspect | Details |
|--------|---------|
| **Tables** | `custom_forms`, `form_fields`, `form_submissions`, `form_submission_values` |
| **Hooks** | `useForms`, `useFormPermissions` |
| **Pages** | `Forms.tsx`, `FormEmbed.tsx` |
| **Key Components** | `FormBuilder`, `FormPreview`, `FormSubmissionsTable` |
| **Edge Functions** | `upload-form-attachment` |

---

## Tasks Module

| Aspect | Details |
|--------|---------|
| **Tables** | `tasks`, `task_time_entries` |
| **Hooks** | `useTasks` |
| **Pages** | `Tasks.tsx` |
| **Key Components** | `TaskKanbanView`, `TaskTableView`, `TaskTimer`, `TaskTimeReport` |

---

## Shopify Integration

| Aspect | Details |
|--------|---------|
| **Tables** | `shopify_orders_raw`, `shopify_orders` |
| **Hooks** | `useShopifyOrders` |
| **Key Components** | `ShopifyPipelineWidget` |
| **Edge Functions** | `shopify-webhook`, `shopify-order-processor`, `shopify-order-backfill`, `shopify-monitor`, `shopify-config` |
| **Docs** | `SHOPIFY_WEBHOOK_SETUP.md`, `SHOPIFY_SECURITY.md` |
| **Workflow** | Shopify Webhook → `shopify_orders_raw` → Processor (pg_cron) → `shopify_orders` + Inventory Adjustment |

---

## Suppliers Module

| Aspect | Details |
|--------|---------|
| **Tables** | `suppliers` |
| **Hooks** | `useSuppliers` |
| **Pages** | `Suppliers.tsx` |
| **Key Components** | `SupplierTable`, `SupplierForm`, `SupplierLedgerDialog` |

---

## Notices Module

| Aspect | Details |
|--------|---------|
| **Tables** | `notices`, `notice_reads` |
| **Hooks** | `useNotices` |
| **Key Components** | `NoticesPanel`, `NoticePopup`, `DashboardNoticesWidget` |

---

## Trainings Module

| Aspect | Details |
|--------|---------|
| **Tables** | `trainings`, `training_completions` |
| **Hooks** | `useTrainings` |
| **Pages** | `Trainings.tsx` |

---

## Buyback Module

| Aspect | Details |
|--------|---------|
| **Tables** | `buyback_drones` |
| **Hooks** | `useBuybackDrones` |
| **Pages** | `Buyback.tsx` |

---

## Repairs Module

| Aspect | Details |
|--------|---------|
| **Tables** | `drone_repair_enquiries` |
| **Hooks** | `useRepairs` |
| **Pages** | `Repairs.tsx`, `PublicDroneRepairEnquiry.tsx` |

*Last updated: 2026-03-06*
