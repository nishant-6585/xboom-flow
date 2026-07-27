import { useCallback, useEffect, useRef, useState } from "react";
import { Cake, Download, Loader2, Mail, Music, Pause, Play, Sparkles, Trash2, Upload } from "lucide-react";
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<EmployeeRow | null>(null);

  const load = useCallback(async () => {
    const [empRes, songRes] = await Promise.all([
      supabase
        .from("employees")
        .select("id, name, department, date_of_birth")
        .eq("is_active", true)
        .order("name"),
      supabase.from("birthday_songs").select("id, employee_id, file_path, title, source"),
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
      toast.success(`Song emailed to ${employee.name} 📧`, {
        description: data?.recipient ? `Sent to ${data.recipient}` : undefined,
      });
    } catch (err) {
      toast.error("Couldn't email the song", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="h-5 w-5 text-pink-500" /> Birthday Songs
          </CardTitle>
          <CardDescription>
            Tag a personalized song to each employee — it plays from their birthday card on the big
            day. Upload an audio file ({ACCEPTED_AUDIO_EXTENSIONS.join(", ")}; max {MAX_SONG_SIZE_MB} MB)
            or generate one with AI from a few personal details.
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
              const days = daysUntilBirthday(employee.date_of_birth!, today);
              const busy = busyId === employee.id;
              return (
                <div
                  key={employee.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
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
                    {song && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={busy}
                        title="Email song to employee"
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
