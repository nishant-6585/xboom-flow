import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, RefreshCw, Lock, Unlock, Wand2 } from 'lucide-react';
import { Company } from '@/hooks/useCompanies';
import {
  useGenerateAccountBrief, useUpdateCompanyTier, useUpdateCompanyAccount, useRecomputeHealth,
} from '@/hooks/useCompanyCrm';
import { useAuth } from '@/hooks/useAuth';
import { CompanyTierBadge } from './CompanyTierBadge';
import { CompanyHealthBadge } from './CompanyHealthBadge';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function useOpportunityAutoValues(company: Company) {
  return useQuery({
    queryKey: ['company-opportunity-auto', company.id, company.name],
    queryFn: async () => {
      const name = (company.name || '').trim();

      // Prospects → Potential value (open prospects only)
      const prospectsQ = supabase
        .from('prospects')
        .select('quoted_price, default_price, quantity, company_id, customer_company, status')
        .not('status', 'in', '(converted,lost,closed,cancelled)');
      const { data: prospectsByCo } = await supabase
        .from('prospects')
        .select('quoted_price, default_price, quantity, status')
        .eq('company_id', company.id)
        .not('status', 'in', '(converted,lost,closed,cancelled)');
      let prospects = prospectsByCo || [];
      if ((!prospects || prospects.length === 0) && name) {
        const { data: byName } = await supabase
          .from('prospects')
          .select('quoted_price, default_price, quantity, status')
          .ilike('customer_company', name)
          .not('status', 'in', '(converted,lost,closed,cancelled)');
        prospects = byName || [];
      }
      void prospectsQ;
      const potential = (prospects || []).reduce((s, p: any) => {
        const unit = Number(p.quoted_price ?? p.default_price ?? 0) || 0;
        const qty = Number(p.quantity ?? 1) || 1;
        return s + unit * qty;
      }, 0);

      // Pipeline orders → Pipeline value (open deals only)
      let pipeline = 0;
      if (name) {
        const { data: deals } = await supabase
          .from('pipeline_orders')
          .select('expected_price, quantity, status')
          .ilike('customer_company', name)
          .not('status', 'in', '(won,lost,cancelled,converted)');
        pipeline = (deals || []).reduce((s, d: any) => {
          const unit = Number(d.expected_price ?? 0) || 0;
          const qty = Number(d.quantity ?? 1) || 1;
          return s + unit * qty;
        }, 0);
      }

      return {
        potential: Math.round(potential),
        pipeline: Math.round(pipeline),
        prospectCount: (prospects || []).length,
      };
    },
    staleTime: 60_000,
  });
}

interface Props { company: Company; }

export function CompanyAccountTab({ company }: Props) {
  const { user } = useAuth();
  const generateBrief = useGenerateAccountBrief();
  const updateTier = useUpdateCompanyTier();
  const updateAccount = useUpdateCompanyAccount();
  const recomputeHealth = useRecomputeHealth();

  const [tier, setTier] = useState<'A' | 'B' | 'C' | ''>(company.tier || '');
  const [tierNotes, setTierNotes] = useState(company.tier_notes || '');
  const [potential, setPotential] = useState(String(company.potential_value || 0));
  const [pipeline, setPipeline] = useState(String(company.pipeline_value || 0));
  const [nextActionAt, setNextActionAt] = useState(company.next_action_at?.slice(0, 16) || '');
  const [nextActionType, setNextActionType] = useState(company.next_action_type || '');
  const [nextActionNotes, setNextActionNotes] = useState(company.next_action_notes || '');

  const autoValues = useOpportunityAutoValues(company);

  useEffect(() => {
    setTier(company.tier || '');
    setTierNotes(company.tier_notes || '');
    setPotential(String(company.potential_value || 0));
    setPipeline(String(company.pipeline_value || 0));
    setNextActionAt(company.next_action_at?.slice(0, 16) || '');
    setNextActionType(company.next_action_type || '');
    setNextActionNotes(company.next_action_notes || '');
  }, [company.id]);

  // Auto-prefill from modules when stored values are empty
  useEffect(() => {
    if (!autoValues.data) return;
    const storedPotential = Number(company.potential_value || 0);
    const storedPipeline = Number(company.pipeline_value || 0);
    if (storedPotential === 0 && autoValues.data.potential > 0) {
      setPotential(String(autoValues.data.potential));
    }
    if (storedPipeline === 0 && autoValues.data.pipeline > 0) {
      setPipeline(String(autoValues.data.pipeline));
    }
  }, [autoValues.data, company.id, company.potential_value, company.pipeline_value]);

  const applyAutoValues = () => {
    if (!autoValues.data) return;
    setPotential(String(autoValues.data.potential));
    setPipeline(String(autoValues.data.pipeline));
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">Account Health</div>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => recomputeHealth.mutate(company.id)} disabled={recomputeHealth.isPending}>
              {recomputeHealth.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CompanyHealthBadge score={company.health_score} band={company.health_band as any} />
            <CompanyTierBadge tier={company.tier as any} source={company.tier_source as any} size="md" />
            {company.is_recurring && <span className="text-[10px] text-muted-foreground">Recurring customer</span>}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Last activity: {company.last_activity_at ? format(new Date(company.last_activity_at), 'dd MMM yy') : '—'}
            {' · '}
            Last order: {company.last_order_at ? format(new Date(company.last_order_at), 'dd MMM yy') : '—'}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            {company.tier_source === 'manual' ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
            Tier Override
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={tier} onValueChange={v => setTier(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Tier A</SelectItem>
                <SelectItem value="B">Tier B</SelectItem>
                <SelectItem value="C">Tier C</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="text-xs h-8" disabled={updateTier.isPending}
              onClick={() => updateTier.mutate({
                companyId: company.id,
                tier: tier || null,
                notes: tierNotes,
                lockedBy: user?.id,
              })}>
              {updateTier.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lock tier'}
            </Button>
          </div>
          <Textarea className="text-xs" rows={2} placeholder="Why this tier? (potential, pipeline, strategic value...)"
            value={tierNotes} onChange={e => setTierNotes(e.target.value)} />
          {company.tier_source === 'manual' && (
            <Button size="sm" variant="ghost" className="text-xs h-7 w-full"
              onClick={() => updateTier.mutate({ companyId: company.id, tier: null })}>
              Unlock & revert to auto
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground">Opportunity</div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1"
              onClick={applyAutoValues}
              disabled={autoValues.isLoading || !autoValues.data}
              title="Pull latest from Prospects & Pipeline"
            >
              {autoValues.isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              Auto-fill
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Potential value (₹)</Label>
              <Input className="h-8 text-xs" type="number" value={potential} onChange={e => setPotential(e.target.value)} />
              {autoValues.data && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  From Prospects: ₹{autoValues.data.potential.toLocaleString('en-IN')}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Pipeline value (₹)</Label>
              <Input className="h-8 text-xs" type="number" value={pipeline} onChange={e => setPipeline(e.target.value)} />
              {autoValues.data && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  From Pipeline: ₹{autoValues.data.pipeline.toLocaleString('en-IN')}
                </div>
              )}
            </div>
          </div>
          <Button size="sm" className="text-xs h-8 w-full" disabled={updateAccount.isPending}
            onClick={() => updateAccount.mutate({
              companyId: company.id,
              potential_value: Number(potential) || 0,
              pipeline_value: Number(pipeline) || 0,
            })}>
            {updateAccount.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Next Action</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">When</Label>
              <Input className="h-8 text-xs" type="datetime-local" value={nextActionAt} onChange={e => setNextActionAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={nextActionType} onValueChange={setNextActionType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="visit">Visit</SelectItem>
                  <SelectItem value="proposal">Send proposal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea className="text-xs" rows={2} placeholder="Notes for the next action..."
            value={nextActionNotes} onChange={e => setNextActionNotes(e.target.value)} />
          <Button size="sm" className="text-xs h-8 w-full" disabled={updateAccount.isPending}
            onClick={() => updateAccount.mutate({
              companyId: company.id,
              next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
              next_action_type: nextActionType || null,
              next_action_notes: nextActionNotes || null,
            })}>
            Save next action
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" />AI Account Brief
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => generateBrief.mutate(company.id)} disabled={generateBrief.isPending}>
              {generateBrief.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {company.ai_brief ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
          {company.ai_brief ? (
            <div className="text-xs prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{company.ai_brief}</ReactMarkdown>
              {company.ai_brief_generated_at && (
                <div className="text-[10px] text-muted-foreground mt-2 not-prose">
                  Generated {format(new Date(company.ai_brief_generated_at), 'dd MMM yy, HH:mm')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Click Generate for an AI status, opportunities, risks, and recommended next step.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}