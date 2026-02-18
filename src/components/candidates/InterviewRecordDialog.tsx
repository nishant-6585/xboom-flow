import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCandidateMutations } from "@/hooks/useCandidates";
import { Star } from "lucide-react";
import { useState } from "react";

const schema = z.object({
  round_type: z.string().min(1, "Round type is required"),
  interviewer_name: z.string().min(1, "Interviewer name is required").max(100),
  decision: z.enum(["pass", "reject", "hold"]),
  interview_date: z.string().min(1, "Date is required"),
  feedback: z.string().max(2000).optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

const ROUND_TYPES = ["HR", "Technical", "Managerial", "Cultural Fit", "Final"];

interface Props {
  open: boolean;
  onClose: () => void;
  candidateId: string;
}

export function InterviewRecordDialog({ open, onClose, candidateId }: Props) {
  const { addInterviewRecord } = useCandidateMutations();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      round_type: "",
      interviewer_name: "",
      decision: "hold",
      interview_date: new Date().toISOString().split("T")[0],
      feedback: "",
    },
  });

  const onSubmit = async (values: FormData) => {
    await addInterviewRecord.mutateAsync({
      candidate_id: candidateId,
      round_type: values.round_type,
      interviewer_name: values.interviewer_name,
      rating: rating || undefined,
      feedback: values.feedback || undefined,
      decision: values.decision,
      interview_date: values.interview_date,
    });
    form.reset();
    setRating(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Interview Record</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="round_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Round Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select round" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROUND_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="interview_date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Interview Date *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="interviewer_name" render={({ field }) => (
              <FormItem>
                <FormLabel>Interviewer Name *</FormLabel>
                <FormControl><Input placeholder="Name of interviewer" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Star Rating */}
            <div className="space-y-1.5">
              <FormLabel>Rating (optional)</FormLabel>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-0.5"
                  >
                    <Star
                      className={`w-6 h-6 transition-colors ${
                        star <= (hoverRating || rating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <button type="button" onClick={() => setRating(0)} className="ml-2 text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </button>
                )}
              </div>
            </div>

            <FormField control={form.control} name="decision" render={({ field }) => (
              <FormItem>
                <FormLabel>Decision *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="pass">Pass ✅</SelectItem>
                    <SelectItem value="hold">Hold ⏸</SelectItem>
                    <SelectItem value="reject">Reject ❌</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="feedback" render={({ field }) => (
              <FormItem>
                <FormLabel>Feedback</FormLabel>
                <FormControl>
                  <Textarea placeholder="Detailed feedback about the candidate..." rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={addInterviewRecord.isPending} className="flex-1">
                {addInterviewRecord.isPending ? "Saving..." : "Add Record"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
