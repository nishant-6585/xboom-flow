import { useCallback, useEffect, useRef, useState } from "react";
import { Cake, Download, Gift, Loader2, Mail, Pause, Play, Sparkles, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface EmployeeRow {
  id: string;
  name: string;
  department: string | null;
  date_of_birth: string | null;
}

interface SongRow {
  id: string;
  employee_id: string;
  file_path: string;
  title: string | null;
  source: string;
}

interface CardRow {
  id: string;
  employee_id: string;
  photo_path: string | null;
  greeting_message: string | null;
}

// Formats the browser's <audio> element can play natively. AI music tools
// export MP3/WAV; the rest covers common uploads.
export const ACCEPTED_AUDIO_EXTENSIONS = [
  "mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm",
] as const;
export const MAX_SONG_SIZE_MB = 20;

export function isAcceptedAudioFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (ACCEPTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

export const ACCEPTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"] as const;
export const MAX_PHOTO_SIZE_MB = 5;

export function isAcceptedImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (ACCEPTED_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

// Days until the next occurrence of a birthday (IST "today"), mirroring the
// Feb-29 -> Feb-28 handling used by get_next_birthday().
export function daysUntilBirthday(dobIso: string, today: Date): number {
  const dob = new Date(dobIso + "T00:00:00");
  const month = dob.getMonth();
  const day = dob.getDate();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = startOfDay(today);

  const occurrenceIn = (year: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  };

  let next = occurrenceIn(t.getFullYear());
  if (next < t) next = occurrenceIn(t.getFullYear() + 1);
  return Math.round((next.getTime() - t.getTime()) / 86400000);
}

function birthdayLabel(dobIso: string): string {
  const dob = new Date(dobIso + "T00:00:00");
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(dob);
}

const MUSIC_STYLES = [
  "Upbeat Pop", "Bollywood", "Acoustic", "Rock", "Rap / Hip-Hop", "EDM", "Lo-fi Chill",
];
const LANGUAGES = ["English", "Hindi", "Hinglish"];
const GREETING_TONES = ["Warm & heartfelt", "Fun & playful", "Formal & professional"];

interface GenerateForm {
  nickname: string;
  about: string;
  style: string;
  language: string;
  lengthSeconds: string;
}

const EMPTY_FORM: GenerateForm = {
  nickname: "",
  about: "",
  style: MUSIC_STYLES[0],
  language: LANGUAGES[0],
  lengthSeconds: "60",
};

export function BirthdaySongsPanel() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [songs, setSongs] = useState<Map<string, SongRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const [generateFor, setGenerateFor] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState<GenerateForm>(EMPTY_FORM);
  const [generating, setGenerating] = useState(false);

  const [cards, setCards] = useState<Map<string, CardRow>>(new Map());
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());
  const [cardFor, setCardFor] = useState<EmployeeRow | null>(null);
  const [greetingText, setGreetingText] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiTone, setAiTone] = useState(GREETING_TONES[0]);
  const [greetingIsAi, setGreetingIsAi] = useState(false);
  const [draftingGreeting, setDraftingGreeting] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<EmployeeRow | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const [empRes, songRes, cardRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, name, department, date_of_birth")
        .eq("is_active", true)
        .order("name"),
      supabase.from("birthday_songs").select("id, employee_id, file_path, title, source"),
      supabase.from("birthday_cards").select("id, employee_id, photo_path, greeting_message"),
    ]);
    if (empRes.error) {
      toast.error("Couldn't load employees", { description: empRes.error.message });
    } else {
      setEmployees((empRes.data as EmployeeRow[]) ?? []);
    }
    if (songRes.error) {
      toast.error("Couldn't load birthday songs", { description: songRes.error.message });
    } else {
      setSongs(new Map(((songRes.data as SongRow[]) ?? []).map((s) => [s.employee_id, s])));
    }
    if (cardRes.error) {
      toast.error("Couldn't load birthday cards", { description: cardRes.error.message });
    } else {
      const cardRows = (cardRes.data as CardRow[]) ?? [];
      setCards(new Map(cardRows.map((c) => [c.employee_id, c])));

      // Signed thumbnail URLs for the uploaded photos, one batch call.
      const paths = cardRows.map((c) => c.photo_path).filter(Boolean) as string[];
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from("birthday-cards")
          .createSignedUrls(paths, 3600);
        const byPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
        setPhotoUrls(
          new Map(
            cardRows
              .filter((c) => c.photo_path && byPath.has(c.photo_path))
              .map((c) => [c.employee_id, byPath.get(c.photo_path!)!]),
          ),
        );
      } else {
        setPhotoUrls(new Map());
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stop audio when the panel unmounts.
  useEffect(() => () => audioRef.current?.pause(), []);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const playUrl = (employeeId: string, url: string) => {
    stopAudio();
    const audio = new Audio(url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      toast.error("Couldn't play this file in the browser");
    };
    audioRef.current = audio;
    setPlayingId(employeeId);
    void audio.play().catch(() => setPlayingId(null));
  };

  const handlePreview = async (employee: EmployeeRow) => {
    if (playingId === employee.id) {
      stopAudio();
      return;
    }
    const song = songs.get(employee.id);
    if (!song) return;
    const { data, error } = await supabase.storage
      .from("birthday-songs")
      .createSignedUrl(song.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't load the song", { description: error?.message });
      return;
    }
    playUrl(employee.id, data.signedUrl);
  };

  const handleUploadClick = (employee: EmployeeRow) => {
    uploadTargetRef.current = employee;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File | undefined) => {
    const employee = uploadTargetRef.current;
    if (!file || !employee) return;

    if (!isAcceptedAudioFile(file.name)) {
      toast.error("Unsupported audio format", {
        description: `Use one of: ${ACCEPTED_AUDIO_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (file.size > MAX_SONG_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large — keep it under ${MAX_SONG_SIZE_MB} MB`);
      return;
    }

    setBusyId(employee.id);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const filePath = `${employee.id}/upload-${Date.now()}.${ext}`;
      const previous = songs.get(employee.id);

      const { error: uploadError } = await supabase.storage
        .from("birthday-songs")
        .upload(filePath, file, { contentType: file.type || undefined });
      if (uploadError) throw new Error(uploadError.message);

      const { error: upsertError } = await supabase
        .from("birthday_songs")
        .upsert(
          {
            employee_id: employee.id,
            file_path: filePath,
            title: file.name,
            source: "upload",
            generation_prompt: null,
            uploaded_by: user?.id ?? null,
          },
          { onConflict: "employee_id" },
        );
      if (upsertError) {
        await supabase.storage.from("birthday-songs").remove([filePath]);
        throw new Error(upsertError.message);
      }

      if (previous && previous.file_path !== filePath) {
        await supabase.storage.from("birthday-songs").remove([previous.file_path]);
      }

      toast.success(`Birthday song tagged to ${employee.name} 🎵`);
      await load();
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusyId(null);
      uploadTargetRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async (employee: EmployeeRow) => {
    const song = songs.get(employee.id);
    if (!song) return;
    if (playingId === employee.id) stopAudio();
    setBusyId(employee.id);
    try {
      const { error } = await supabase.from("birthday_songs").delete().eq("id", song.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from("birthday-songs").remove([song.file_path]);
      toast.success(`Removed ${employee.name}'s birthday song`);
      await load();
    } catch (err) {
      toast.error("Couldn't remove the song", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (employee: EmployeeRow) => {
    const song = songs.get(employee.id);
    if (!song) return;
    const filename = ((song.title || `birthday-song-${employee.name}`)
      .replace(/[^\w\s.-]+/g, "")
      .replace(/\s+/g, "-")) + ".mp3";
    const { data, error } = await supabase.storage
      .from("birthday-songs")
      .createSignedUrl(song.file_path, 300, { download: filename });
    if (error || !data?.signedUrl) {
      toast.error("Couldn't build download link", { description: error?.message });
      return;
    }
    // Trigger the download in a new tab; the download disposition on the
    // signed URL forces the browser to save rather than navigate.
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const [sendingToday, setSendingToday] = useState(false);

  const handleSendToday = async () => {
    setSendingToday(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-birthday-cards", {
        body: {},
      });
      if (error) {
        let detail = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            detail = body?.error || detail;
          } catch { /* not json */ }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(String(data.error));
      const sent = (data?.sent ?? []) as string[];
      const skipped = (data?.skipped ?? []) as { name: string; reason: string }[];
      const failed = (data?.failed ?? []) as { name: string; reason: string }[];
      if (sent.length === 0 && skipped.length === 0 && failed.length === 0) {
        toast.info("No birthdays today 🎈");
      } else {
        const bits = [
          sent.length > 0 ? `Sent: ${sent.join(", ")}` : null,
          skipped.length > 0 ? `Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}` : null,
          failed.length > 0 ? `Failed: ${failed.map((f) => `${f.name} (${f.reason})`).join(", ")}` : null,
        ].filter(Boolean);
        (failed.length > 0 ? toast.warning : toast.success)("Today's birthday emails", {
          description: bits.join(" · "),
        });
      }
    } catch (err) {
      toast.error("Couldn't send today's birthday emails", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSendingToday(false);
    }
  };

  const handleEmail = async (employee: EmployeeRow) => {
    setBusyId(employee.id);
    try {
      const { data, error } = await supabase.functions.invoke("email-birthday-song", {
        body: { employee_id: employee.id },
      });
      if (error) {
        let detail = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            detail = body?.error || detail;
          } catch { /* not json */ }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Birthday card emailed to ${employee.name} 📧`, {
        description: data?.recipient ? `Sent to ${data.recipient}` : undefined,
      });
    } catch (err) {
      toast.error("Couldn't email the birthday card", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const openCard = (employee: EmployeeRow) => {
    const card = cards.get(employee.id);
    setGreetingText(card?.greeting_message ?? "");
    setAiNotes("");
    setAiTone(GREETING_TONES[0]);
    setGreetingIsAi(false);
    setCardFor(employee);
  };

  const upsertCard = async (employeeId: string, patch: Partial<CardRow> & { greeting_source?: string }) => {
    const { error } = await supabase
      .from("birthday_cards")
      .upsert(
        { employee_id: employeeId, updated_by: user?.id ?? null, ...patch },
        { onConflict: "employee_id" },
      );
    if (error) throw new Error(error.message);
  };

  const handlePhotoSelected = async (file: File | undefined) => {
    const employee = cardFor;
    if (!file || !employee) return;

    if (!isAcceptedImageFile(file.name)) {
      toast.error("Unsupported image format", {
        description: `Use one of: ${ACCEPTED_IMAGE_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
      toast.error(`Image too large — keep it under ${MAX_PHOTO_SIZE_MB} MB`);
      return;
    }

    setPhotoBusy(true);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const photoPath = `${employee.id}/photo-${Date.now()}.${ext}`;
      const previous = cards.get(employee.id)?.photo_path ?? null;

      const { error: uploadError } = await supabase.storage
        .from("birthday-cards")
        .upload(photoPath, file, { contentType: file.type || undefined });
      if (uploadError) throw new Error(uploadError.message);

      try {
        await upsertCard(employee.id, { photo_path: photoPath });
      } catch (err) {
        await supabase.storage.from("birthday-cards").remove([photoPath]);
        throw err;
      }

      if (previous && previous !== photoPath) {
        await supabase.storage.from("birthday-cards").remove([previous]);
      }

      toast.success(`Photo added to ${employee.name}'s birthday card 📸`);
      await load();
    } catch (err) {
      toast.error("Photo upload failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    const employee = cardFor;
    const card = employee ? cards.get(employee.id) : undefined;
    if (!employee || !card?.photo_path) return;
    setPhotoBusy(true);
    try {
      await upsertCard(employee.id, { photo_path: null });
      await supabase.storage.from("birthday-cards").remove([card.photo_path]);
      toast.success("Photo removed");
      await load();
    } catch (err) {
      toast.error("Couldn't remove the photo", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleDraftGreeting = async () => {
    if (!cardFor) return;
    setDraftingGreeting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-birthday-greeting", {
        body: { employee_id: cardFor.id, about: aiNotes, tone: aiTone },
      });
      if (error) {
        let detail = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            detail = body?.error || detail;
          } catch { /* not json */ }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(String(data.error));
      if (!data?.greeting) throw new Error("AI returned an empty greeting");
      setGreetingText(String(data.greeting));
      setGreetingIsAi(true);
      toast.success("Greeting drafted — review and tweak before saving ✨");
    } catch (err) {
      toast.error("Couldn't draft the greeting", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDraftingGreeting(false);
    }
  };

  const handleSaveCard = async () => {
    if (!cardFor) return;
    setSavingCard(true);
    try {
      await upsertCard(cardFor.id, {
        greeting_message: greetingText.trim() || null,
        greeting_source: greetingIsAi ? "ai" : "manual",
      });
      toast.success(`Birthday card saved for ${cardFor.name} 💌`);
      setCardFor(null);
      await load();
    } catch (err) {
      toast.error("Couldn't save the card", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSavingCard(false);
    }
  };

  const openGenerate = (employee: EmployeeRow) => {
    setForm(EMPTY_FORM);
    setGenerateFor(employee);
  };

  const handleGenerate = async () => {
    if (!generateFor) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-birthday-song", {
        body: {
          employee_id: generateFor.id,
          nickname: form.nickname,
          about: form.about,
          style: form.style,
          language: form.language,
          length_seconds: Number(form.lengthSeconds),
        },
      });
      if (error) {
        // The real reason lives in the function's JSON body, which supabase-js
        // tucks away in FunctionsHttpError.context instead of error.message.
        let detail = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            detail = [body?.error, body?.detail].filter(Boolean).join(" — ") || detail;
          } catch {
            // body wasn't JSON; keep the generic message
          }
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(String(data.error));

      toast.success(`Song generated and tagged to ${generateFor.name} 🎶`, {
        description: "Hit play to preview it.",
      });
      if (data?.signed_url) playUrl(generateFor.id, data.signed_url);
      setGenerateFor(null);
      await load();
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  const today = new Date();
  const withDob = employees
    .filter((e) => e.date_of_birth)
    .sort((a, b) => daysUntilBirthday(a.date_of_birth!, today) - daysUntilBirthday(b.date_of_birth!, today));
  const missingDob = employees.length - withDob.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-pink-500" /> Birthday Cards
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={sendingToday}
              onClick={() => void handleSendToday()}
            >
              {sendingToday ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Mail className="h-3.5 w-3.5 mr-1.5" /> Send today's cards
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            Put together a birthday card for each employee — a personalized song, their photo and a
            greeting message. Cards are emailed automatically at 9:00 AM IST on each birthday (and
            can be re-sent with the button above). Upload an audio file
            ({ACCEPTED_AUDIO_EXTENSIONS.join(", ")}; max {MAX_SONG_SIZE_MB} MB) or generate one with
            AI, then use the card button to add the photo and greeting.
            {missingDob > 0 && (
              <span className="block mt-1 text-amber-600 dark:text-amber-400">
                {missingDob} active employee{missingDob > 1 ? "s have" : " has"} no date of birth on
                file — add it in the Employees tab to tag a song.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : withDob.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No active employees with a date of birth yet.
            </p>
          ) : (
            withDob.map((employee) => {
              const song = songs.get(employee.id);
              const card = cards.get(employee.id);
              const photoUrl = photoUrls.get(employee.id);
              const hasCardContent = !!(card?.photo_path || card?.greeting_message);
              const days = daysUntilBirthday(employee.date_of_birth!, today);
              const busy = busyId === employee.id;
              return (
                <div
                  key={employee.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={employee.name}
                      className="h-10 w-10 rounded-full object-cover border border-pink-200 dark:border-pink-900 shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Cake className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{employee.name}</p>
                      {employee.department && (
                        <span className="text-[11px] text-muted-foreground">
                          · {employee.department}
                        </span>
                      )}
                      <Badge
                        variant={days === 0 ? "default" : "secondary"}
                        className={days === 0 ? "bg-pink-500 hover:bg-pink-500" : ""}
                      >
                        <Cake className="w-3 h-3 mr-1" />
                        {days === 0
                          ? "Today!"
                          : `${birthdayLabel(employee.date_of_birth!)} · in ${days}d`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {song ? (
                        <>
                          <span className="text-emerald-600 dark:text-emerald-400">Song tagged</span>
                          {" — "}
                          {song.title || song.file_path.split("/").pop()}
                          {song.source === "elevenlabs" ? " (AI generated)" : ""}
                        </>
                      ) : (
                        "No song yet"
                      )}
                      {card?.greeting_message && (
                        <span className="text-emerald-600 dark:text-emerald-400"> · Greeting ✓</span>
                      )}
                      {card?.photo_path && (
                        <span className="text-emerald-600 dark:text-emerald-400"> · Photo ✓</span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {song && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy}
                        onClick={() => void handlePreview(employee)}
                      >
                        {playingId === employee.id ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {song && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy}
                        title="Download song"
                        onClick={() => void handleDownload(employee)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {(song || hasCardContent) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy}
                        title="Email birthday card to employee"
                        onClick={() => void handleEmail(employee)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy}
                      title="Card — photo & greeting message"
                      onClick={() => openCard(employee)}
                    >
                      <Gift className="h-3.5 w-3.5 mr-1.5" />
                      Card
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy}
                      onClick={() => handleUploadClick(employee)}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {song ? "Replace" : "Upload"}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={() => openGenerate(employee)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Generate with AI
                    </Button>
                    {song && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => void handleRemove(employee)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO_EXTENSIONS.map((e) => `.${e}`).join(",") + ",audio/*"}
        className="hidden"
        onChange={(e) => void handleFileSelected(e.target.files?.[0])}
      />

      <input
        ref={photoInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",") + ",image/*"}
        className="hidden"
        onChange={(e) => void handlePhotoSelected(e.target.files?.[0])}
      />

      <Dialog
        open={!!cardFor}
        onOpenChange={(open) => !open && !savingCard && !photoBusy && !draftingGreeting && setCardFor(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-pink-500" />
              Birthday card for {cardFor?.name}
            </DialogTitle>
            <DialogDescription>
              Add a photo and a greeting message — both go into the birthday email along with the
              song. Draft the greeting with AI, then edit it to taste before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Photo</Label>
              <div className="flex items-center gap-3">
                {cardFor && photoUrls.get(cardFor.id) ? (
                  <img
                    src={photoUrls.get(cardFor.id)}
                    alt={cardFor.name}
                    className="h-16 w-16 rounded-lg object-cover border"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
                    <Cake className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {photoBusy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {cardFor && cards.get(cardFor.id)?.photo_path ? "Replace photo" : "Upload photo"}
                  </Button>
                  {cardFor && cards.get(cardFor.id)?.photo_path && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={photoBusy}
                      onClick={() => void handleRemovePhoto()}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove photo
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {ACCEPTED_IMAGE_EXTENSIONS.join(", ")} · max {MAX_PHOTO_SIZE_MB} MB
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="bc-greeting">Greeting message</Label>
                <span className="text-[11px] text-muted-foreground">
                  Goes at the top of the birthday email
                </span>
              </div>
              <Textarea
                id="bc-greeting"
                placeholder="Write the birthday message yourself, or draft it with AI below…"
                rows={5}
                value={greetingText}
                onChange={(e) => {
                  setGreetingText(e.target.value);
                  setGreetingIsAi(false);
                }}
              />
            </div>

            <div className="rounded-lg border p-3 space-y-2.5">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-pink-500" /> Draft with AI
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <Input
                  placeholder="Notes for AI (optional) — hobbies, fun facts…"
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                />
                <Select value={aiTone} onValueChange={setAiTone}>
                  <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GREETING_TONES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={draftingGreeting}
                onClick={() => void handleDraftGreeting()}
              >
                {draftingGreeting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Drafting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    {greetingText ? "Redraft greeting" : "Draft greeting"}
                  </>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingCard || photoBusy || draftingGreeting}
              onClick={() => setCardFor(null)}
            >
              Cancel
            </Button>
            <Button disabled={savingCard || draftingGreeting} onClick={() => void handleSaveCard()}>
              {savingCard ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save card"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!generateFor} onOpenChange={(open) => !open && !generating && setGenerateFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pink-500" />
              AI song for {generateFor?.name}
            </DialogTitle>
            <DialogDescription>
              A personalized birthday song is composed with ElevenLabs from these details and tagged
              to the employee, replacing any existing song.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bs-nickname">Nickname (optional)</Label>
              <Input
                id="bs-nickname"
                placeholder="What the team actually calls them"
                value={form.nickname}
                onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bs-about">About them</Label>
              <Textarea
                id="bs-about"
                placeholder="Hobbies, fun facts, what they're known for in the office…"
                rows={3}
                value={form.about}
                onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Style</Label>
                <Select value={form.style} onValueChange={(v) => setForm((f) => ({ ...f, style: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MUSIC_STYLES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Length</Label>
              <Select
                value={form.lengthSeconds}
                onValueChange={(v) => setForm((f) => ({ ...f, lengthSeconds: v }))}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="90">1.5 minutes</SelectItem>
                  <SelectItem value="120">2 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={generating} onClick={() => setGenerateFor(null)}>
              Cancel
            </Button>
            <Button disabled={generating} onClick={() => void handleGenerate()}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Composing… (~1 min)
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" /> Generate song
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BirthdaySongsPanel;
