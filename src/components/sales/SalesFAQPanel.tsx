import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HelpCircle,
  Plus,
  MessageSquare,
  CheckCircle,
  Clock,
  Pin,
  Trash2,
  Search,
  Eye,
} from 'lucide-react';
import { useSalesFAQs, SalesFAQ } from '@/hooks/useSalesFAQs';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

const FAQ_CATEGORIES = [
  'Product',
  'Pricing',
  'Process',
  'Customer',
  'Technical',
  'General',
];

export function SalesFAQPanel() {
  const { user, role } = useAuth();
  const { faqs, loading, askQuestion, answerQuestion, approveAnswer, togglePin, deleteFAQ, incrementViews } = useSalesFAQs();
  const isAdmin = role === 'admin';

  const [askDialogOpen, setAskDialogOpen] = useState(false);
  const [answerDialogOpen, setAnswerDialogOpen] = useState(false);
  const [selectedFAQ, setSelectedFAQ] = useState<SalesFAQ | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'answered' | 'pending'>('all');

  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [answer, setAnswer] = useState('');

  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(search.toLowerCase()) ||
      (faq.answer?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesCategory = categoryFilter === 'all' || faq.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'answered' && faq.is_approved) ||
      (statusFilter === 'pending' && !faq.is_approved);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const pendingApprovalCount = faqs.filter(f => f.answer && !f.is_approved).length;

  const handleAskQuestion = async () => {
    if (!question.trim()) return;
    
    const success = await askQuestion({
      question: question.trim(),
      category: category || undefined,
    });

    if (success) {
      setAskDialogOpen(false);
      setQuestion('');
      setCategory('');
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedFAQ || !answer.trim()) return;

    const success = await answerQuestion(selectedFAQ.id, answer.trim());
    if (success) {
      setAnswerDialogOpen(false);
      setSelectedFAQ(null);
      setAnswer('');
    }
  };

  const handleApprove = async (id: string) => {
    await approveAnswer(id);
  };

  const handleTogglePin = async (faq: SalesFAQ) => {
    await togglePin(faq.id, !faq.is_pinned);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this FAQ?')) {
      await deleteFAQ(id);
    }
  };

  const openAnswerDialog = (faq: SalesFAQ) => {
    setSelectedFAQ(faq);
    setAnswer(faq.answer || '');
    setAnswerDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with search and filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              Sales FAQ Repository
              {pendingApprovalCount > 0 && isAdmin && (
                <Badge variant="secondary" className="ml-2">
                  {pendingApprovalCount} pending approval
                </Badge>
              )}
            </CardTitle>
            <Button onClick={() => setAskDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ask Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search questions and answers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {FAQ_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* FAQ List */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="animate-pulse text-muted-foreground">Loading FAQs...</div>
            </div>
          ) : filteredFAQs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No FAQs found</p>
              <p className="text-sm mt-1">Be the first to ask a question!</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {filteredFAQs.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  value={faq.id}
                  className="border rounded-lg px-4"
                >
                  <AccordionTrigger
                    className="hover:no-underline"
                    onClick={() => incrementViews(faq.id)}
                  >
                    <div className="flex items-start gap-3 text-left flex-1 pr-4">
                      {faq.is_pinned && (
                        <Pin className="w-4 h-4 text-primary shrink-0 mt-1" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {faq.category && (
                            <Badge variant="outline" className="text-xs">
                              {faq.category}
                            </Badge>
                          )}
                          {faq.is_approved ? (
                            <Badge variant="default" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Answered
                            </Badge>
                          ) : faq.answer ? (
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending Approval
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500/20">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Needs Answer
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {faq.views_count}
                          </span>
                        </div>
                        <p className="font-medium">{faq.question}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Asked by {faq.asked_by_name} • {format(new Date(faq.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 pb-4 space-y-4">
                      {faq.answer ? (
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="whitespace-pre-wrap">{faq.answer}</p>
                          <p className="text-xs text-muted-foreground mt-3">
                            Answered by {faq.answered_by_name}
                            {faq.answered_at && ` • ${format(new Date(faq.answered_at), 'MMM d, yyyy')}`}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-muted/30 rounded-lg p-4 text-center">
                          <p className="text-muted-foreground">No answer yet</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAnswerDialog(faq)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          {faq.answer ? 'Edit Answer' : 'Answer'}
                        </Button>
                        
                        {isAdmin && faq.answer && !faq.is_approved && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleApprove(faq.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        )}

                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTogglePin(faq)}
                            >
                              <Pin className={`w-4 h-4 ${faq.is_pinned ? 'text-primary' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(faq.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Ask Question Dialog */}
      <Dialog open={askDialogOpen} onOpenChange={setAskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask a Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What would you like to know?"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {FAQ_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAskQuestion} disabled={!question.trim()}>
              Submit Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Answer Dialog */}
      <Dialog open={answerDialogOpen} onOpenChange={setAnswerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Answer Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedFAQ && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">{selectedFAQ.question}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Asked by {selectedFAQ.asked_by_name}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Your Answer</Label>
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Provide a helpful answer..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Your answer will be reviewed and approved by an admin before it becomes visible to everyone.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnswerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitAnswer} disabled={!answer.trim()}>
              Submit Answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
