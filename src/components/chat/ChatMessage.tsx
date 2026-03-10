import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, User, Volume2, VolumeX, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { parseChartBlocks, ChatChart } from './ChatChart';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  autoSpeak?: boolean;
  onSpeakingDone?: () => void;
}

/** Strip markdown + tables into natural speech-friendly text */
function stripForSpeech(md: string): string {
  let text = md;
  text = text.replace(/```chart[\s\S]*?```/g, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/#{1,6}\s+/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  const lines = text.split('\n');
  const spokenLines: string[] = [];
  let inTable = false;
  let headers: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      
      if (!inTable) {
        headers = cells;
        inTable = true;
      } else {
        const parts = cells.map((cell, i) => {
          const header = headers[i] || '';
          return `${header}: ${cell}`;
        });
        spokenLines.push(parts.join(', ') + '.');
      }
    } else {
      if (inTable) {
        inTable = false;
        headers = [];
      }
      if (trimmed) spokenLines.push(trimmed);
    }
  }
  
  text = spokenLines.join(' ');
  text = text.replace(/^[-•*]\s+/gm, '');
  text = text.replace(/[🔴📊⚡📦🔥✅❌⚠️🌟💰📈📉🎯]/g, '');
  text = text.replace(/\n+/g, '. ');
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\.\s*\./g, '.');
  return text.trim();
}

function getBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const premium = [
    'Microsoft Jenny Online', 'Microsoft Aria Online', 'Google UK English Female',
    'Samantha', 'Karen', 'Moira', 'Tessa', 'Google US English', 'Microsoft Zira', 'Victoria',
  ];
  for (const name of premium) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  const neural = voices.find(v => v.lang.startsWith('en') && /online|neural|natural|premium/i.test(v.name));
  if (neural) return neural;
  const female = voices.find(v => v.lang.startsWith('en') && /female|woman|samantha|karen|zira|victoria|jenny|aria/i.test(v.name));
  if (female) return female;
  return voices.find(v => v.lang.startsWith('en')) || voices[0] || null;
}

function chunkText(text: string, maxLen = 200): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function speakText(text: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const plainText = stripForSpeech(text);
  if (!plainText) return null;
  window.speechSynthesis.cancel();
  const voice = getBestVoice();
  const chunks = chunkText(plainText);
  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    if (i === chunks.length - 1 && onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  });
  return null;
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/** Parse markdown tables from content for PDF export */
function parseMarkdownTables(content: string): { headers: string[]; rows: string[][] }[] {
  const tables: { headers: string[]; rows: string[][] }[] = [];
  const lines = content.split('\n');
  let currentHeaders: string[] = [];
  let currentRows: string[][] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue;
      if (!inTable) {
        currentHeaders = cells;
        inTable = true;
      } else {
        currentRows.push(cells);
      }
    } else {
      if (inTable && currentHeaders.length > 0) {
        tables.push({ headers: currentHeaders, rows: currentRows });
        currentHeaders = [];
        currentRows = [];
        inTable = false;
      }
    }
  }
  if (inTable && currentHeaders.length > 0) {
    tables.push({ headers: currentHeaders, rows: currentRows });
  }
  return tables;
}

/** Strip markdown to plain text for PDF paragraphs */
function stripMarkdownForPdf(md: string): string {
  let text = md;
  text = text.replace(/```chart[\s\S]*?```/g, '[Chart]');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/#{1,6}\s+(.+)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove table lines
  text = text.replace(/^\|.*\|$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function downloadResponseAsPdf(content: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 20;

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('XBoom AI Response', margin, y);
  y += 8;

  // Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, margin, y);
  y += 4;

  // Separator line
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;
  doc.setTextColor(30, 30, 30);

  // Parse tables
  const tables = parseMarkdownTables(content);
  
  // Process content block by block
  const lines = content.split('\n');
  let i = 0;
  let tableIndex = 0;
  let inTableBlock = false;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Check if entering a table
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTableBlock) {
        inTableBlock = true;
        // Render the table from parsed tables
        if (tableIndex < tables.length) {
          const table = tables[tableIndex];
          autoTable(doc, {
            startY: y,
            head: [table.headers],
            body: table.rows,
            margin: { left: margin, right: margin },
            styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
            headStyles: { fillColor: [245, 130, 32], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            alternateRowStyles: { fillColor: [250, 250, 250] },
            theme: 'grid',
          });
          y = (doc as any).lastAutoTable.finalY + 6;
          tableIndex++;
        }
      }
      i++;
      continue;
    } else {
      inTableBlock = false;
    }

    // Skip empty lines
    if (!line) {
      y += 3;
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerText = headerMatch[2].replace(/\*\*/g, '');
      doc.setFontSize(level === 1 ? 14 : level === 2 ? 12 : 11);
      doc.setFont('helvetica', 'bold');
      if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
      doc.text(headerText, margin, y);
      y += level === 1 ? 8 : 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      i++;
      continue;
    }

    // Bold lines
    const boldMatch = line.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
      const splitText = doc.splitTextToSize(boldMatch[1], maxWidth);
      doc.text(splitText, margin, y);
      y += splitText.length * 5 + 2;
      doc.setFont('helvetica', 'normal');
      i++;
      continue;
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      doc.setFontSize(10);
      const bulletText = line.replace(/^[-•*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1');
      if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
      const splitText = doc.splitTextToSize(bulletText, maxWidth - 6);
      doc.text('•', margin, y);
      doc.text(splitText, margin + 5, y);
      y += splitText.length * 5 + 1.5;
      i++;
      continue;
    }

    // Regular text
    doc.setFontSize(10);
    const cleanLine = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
    if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20; }
    const splitText = doc.splitTextToSize(cleanLine, maxWidth);
    doc.text(splitText, margin, y);
    y += splitText.length * 5 + 2;
    i++;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`XBoom OS • Page ${p} of ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  doc.save(`xboom-ai-response-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function ChatMessage({ role, content, isStreaming, autoSpeak, onSpeakingDone }: ChatMessageProps) {
  const isUser = role === 'user';
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasAutoSpokenRef = useRef(false);
  const prevContentLenRef = useRef(0);

  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming) return;
    if (content.length < prevContentLenRef.current) {
      hasAutoSpokenRef.current = false;
    }
    prevContentLenRef.current = content.length;
  }, [content, isStreaming, autoSpeak, isUser]);

  useEffect(() => {
    if (!autoSpeak || isUser || !content || isStreaming || hasAutoSpokenRef.current) return;
    hasAutoSpokenRef.current = true;
    setIsSpeaking(true);
    speakText(content, () => {
      setIsSpeaking(false);
      onSpeakingDone?.();
    });
  }, [isStreaming, autoSpeak, isUser, content, onSpeakingDone]);

  const handleSpeak = useCallback(() => {
    if (!content || isStreaming) return;
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    speakText(content, () => {
      setIsSpeaking(false);
    });
  }, [content, isStreaming, isSpeaking]);

  const showSpeaker = !isUser && content && !isStreaming && typeof window !== 'undefined' && 'speechSynthesis' in window;
  const showDownload = !isUser && content && !isStreaming && content.length > 50;

  const renderAssistantContent = () => {
    if (!content) {
      return isStreaming ? <span className="text-muted-foreground">•••</span> : null;
    }

    const hasChartBlock = content.includes('```chart');
    const proseClasses = cn(
      "prose prose-sm dark:prose-invert max-w-none",
      "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
      "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1.5",
      "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2.5 [&_h2]:mb-1",
      "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
      "[&_strong]:text-foreground",
      // Table styling
      "[&_table]:w-full [&_table]:text-xs [&_table]:my-2 [&_table]:border-collapse [&_table]:rounded-lg [&_table]:overflow-hidden",
      "[&_thead]:bg-primary/10",
      "[&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-foreground [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:border-b [&_th]:border-border/50",
      "[&_td]:px-2.5 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-border/30 [&_td]:text-foreground/80",
      "[&_tr:last-child_td]:border-b-0",
      "[&_tr:hover_td]:bg-muted/30",
      // Code blocks
      "[&_code]:text-xs [&_code]:bg-background/50 [&_code]:px-1 [&_code]:rounded",
      "[&_pre]:bg-background/50 [&_pre]:text-xs",
    );

    if (!hasChartBlock || isStreaming) {
      return (
        <div className={proseClasses}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      );
    }

    const parts = parseChartBlocks(content);
    return (
      <div>
        {parts.map((part, i) =>
          part.type === 'chart' ? (
            <ChatChart key={i} spec={part.spec} />
          ) : (
            <div key={i} className={proseClasses}>
              <ReactMarkdown>{part.value}</ReactMarkdown>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className={cn('flex gap-2 animate-fade-in', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div className="flex flex-col max-w-[85%]">
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted rounded-bl-sm'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{content}</div>
          ) : (
            renderAssistantContent()
          )}
        </div>
        {/* Action buttons for assistant messages */}
        {!isUser && (showSpeaker || showDownload) && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {showSpeaker && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSpeak}
                className={cn(
                  "h-6 w-6 rounded-md transition-colors",
                  isSpeaking
                    ? "text-primary bg-primary/10 hover:bg-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title={isSpeaking ? "Stop speaking" : "Read aloud"}
              >
                {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              </Button>
            )}
            {showDownload && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => downloadResponseAsPdf(content)}
                className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Download as PDF"
              >
                <Download className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-0.5">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
