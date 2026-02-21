# Phase 2C — AI Follow-Up Automation

Status: ⬚ BLOCKED (waiting on Phase 2B conversion model validation)

> **Entry Criteria**:
> - Dynamic lead conversion model AUC > 0.65 sustained for 2+ weeks
> - Sales team has validated and trusts dynamic scoring
> - Follow-up recommendation logic reviewed and approved by sales leadership

---

## 1. Smart Follow-Up Recommendations

**Objective**: AI-suggested next actions for each active lead.

### Why Last:
- Layering AI on AI on AI too early creates self-referential systems
- Follow-up quality depends entirely on conversion model quality
- Human override patterns must be understood before automation
- Requires organizational trust built through Phases 2A → 2B

### Requirements:
- Edge function: `follow-up-recommendations`
- Inputs: lead data, engagement history, similar won/lost deals, conversion score
- Outputs stored in: `follow_up_recommendations`
  - `enquiry_id`, `recommendation_type` (call/email/meeting/quote), `reasoning`, `priority`, `suggested_date`, `created_at`, `is_actioned`, `was_helpful`
- Triggered:
  - On lead score change
  - On staleness (no activity for 48+ hours on hot leads)
- **Feedback loop**: Sales marks recommendations as helpful/not helpful → feeds back into model

### Accuracy Tracking:
- Track: recommendation actioned rate, was_helpful rate, conversion lift vs. control
- **Target metrics**:
  - Action rate > 40% (recommendations are relevant enough to act on)
  - Helpful rate > 60% of actioned recommendations
  - Measurable conversion lift vs. non-recommended leads

### UI:
- "Suggested Actions" card on lead detail
- Daily digest notification (opt-in)
- Recommendation performance dashboard

---

## Acceptance Criteria
- [ ] Recommendations generating for active leads
- [ ] Feedback loop operational (helpful/not helpful)
- [ ] Performance metrics tracked and displayed
- [ ] No forced automation — all recommendations are suggestions only
