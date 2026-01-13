import { useState } from "react";
import { Lightbulb, Send, CheckCircle, Clock, XCircle, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useSalesSuggestions } from "@/hooks/useSalesGamification";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SuggestionBox() {
  const { suggestions, createSuggestion, respondToSuggestion } = useSalesSuggestions();
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responseText, setResponseText] = useState('');
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) return;
    createSuggestion.mutate({ title, description }, {
      onSuccess: () => {
        setTitle('');
        setDescription('');
        setIsOpen(false);
      }
    });
  };

  const handleRespond = (id: string, status: string) => {
    respondToSuggestion.mutate({ id, response: responseText, status }, {
      onSuccess: () => {
        setResponseText('');
        setRespondingTo(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Suggestion Box
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600">
                <Send className="w-4 h-4 mr-2" />
                Submit Idea
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Submit a Suggestion
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief title for your suggestion"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your idea in detail..."
                    rows={5}
                  />
                </div>
                <Button 
                  onClick={handleSubmit} 
                  className="w-full"
                  disabled={createSuggestion.isPending || !title.trim() || !description.trim()}
                >
                  {createSuggestion.isPending ? 'Submitting...' : 'Submit Suggestion'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {!suggestions || suggestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Lightbulb className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No suggestions yet. Share your ideas!</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {suggestions.map((suggestion) => (
              <div key={suggestion.id} className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-semibold">{suggestion.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span>By {suggestion.user_name}</span>
                      <span>•</span>
                      <span>{format(new Date(suggestion.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  {getStatusBadge(suggestion.status)}
                </div>

                {suggestion.admin_response && (
                  <div className="mt-3 p-3 rounded bg-primary/10 border border-primary/20">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
                      <MessageSquare className="w-4 h-4" />
                      Response from {suggestion.responded_by_name}
                    </div>
                    <p className="text-sm">{suggestion.admin_response}</p>
                  </div>
                )}

                {role === 'admin' && suggestion.status === 'pending' && (
                  <div className="mt-3 space-y-2">
                    {respondingTo === suggestion.id ? (
                      <>
                        <Textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Your response..."
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-500 hover:bg-green-600"
                            onClick={() => handleRespond(suggestion.id, 'approved')}
                            disabled={respondToSuggestion.isPending}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRespond(suggestion.id, 'rejected')}
                            disabled={respondToSuggestion.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRespondingTo(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRespondingTo(suggestion.id)}
                      >
                        <MessageSquare className="w-4 h-4 mr-1" /> Respond
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
