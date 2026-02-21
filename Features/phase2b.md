# Phase 2B — Behavioral Conversion Intelligence

Status: ⬚ BLOCKED (waiting on stable domain_events + sufficient dataset)

> **Entry Criteria**:
>
> - `domain_events` table actively capturing engagement signals for 4+ weeks
> - Minimum 100 enquiries with outcome data (won/lost)
> - Phase 2A-1 shadow mode models validated

---

## 1. Dynamic Lead Conversion Re-Scoring

**Objective**: Evolve AI lead scoring from static snapshot to dynamic — re-score based on engagement signals.

### Why Deferred:

- Engagement velocity and decay modeling is **behavioral**, not numeric
- Sales teams distrust models they can't verify — requires baseline trust from Phase 2A
- Needs sufficient dataset size to avoid overfitting
- Stacking behavioral AI on unvalidated math AI creates compounding error

### Requirements:

- Track engagement events via `domain_events`:
  - Quote sent, follow-up logged, meeting scheduled, response received, price negotiation
- Re-score leads when engagement events logged (debounced, max 1x per 6 hours)
- New scoring dimensions:
  - Engagement velocity (actions per day)
  - Time since last interaction (decay factor)
  - Deal size vs. historical win rate for similar deals
  - Sales person's historical conversion rate
- Update `enquiries.probability_to_close`
- Log all score changes in `ai_scoring_logs`
- **Shadow Mode first** — display predictions alongside existing static scores for 2+ weeks before replacing

### Accuracy Tracking:

- Compare predicted `probability_to_close` against actual outcome
- **Target metrics**:
  - AUC > 0.65 on won/lost prediction
  - Calibration: predicted 70% close rate → ~70% actually close

### UI:

- "Probability Trend" mini-chart on enquiry detail
- Side-by-side: static score vs. dynamic score (during shadow period)
- Model performance dashboard

---

## Acceptance Criteria

- [ ] Dynamic re-scoring operational for active leads
- [ ] Shadow mode comparison live for 2+ weeks before replacing static scores
- [ ] Accuracy tracking with AUC and calibration metrics
- [ ] Sales team feedback collected before graduation from shadow mode
