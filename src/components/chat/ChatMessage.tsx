import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, User, Download, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { parseChartBlocks, ChatChart } from './ChatChart';
import { ChatActionButtons } from './ChatActionButtons';
import { Button } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AIAction {
  label: string;
  action_type: string;
  payload: Record<string, unknown>;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  actions?: AIAction[];
  isStreaming?: boolean;
  autoSpeak?: boolean;
  onSpeakingDone?: () => void;
}

export function stopSpeaking() {
  // No-op: ElevenLabs TTS removed
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

export function ChatMessage({ role, content, actions: structuredActions, isStreaming, autoSpeak, onSpeakingDone }: ChatMessageProps) {
  const isUser = role === 'user';

  const showDownload = !isUser && content && !isStreaming && content.length > 50;

  const renderAssistantContent = () => {
    if (!content) {
      return isStreaming ? <span className="text-muted-foreground">•••</span> : null;
    }

    // Use structured actions from prop (no text parsing needed)
    const actions = structuredActions || [];
    const cleanContent = content;
    const hasChartBlock = cleanContent.includes('```chart');

    const markdownComponents = {
      table: ({ children, ...props }: any) => (
        <div className="my-2.5 rounded-lg border border-border/50 dark:border-primary/20 overflow-hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-xs border-collapse min-w-[480px]" {...props}>{children}</table>
          </div>
        </div>
      ),
      thead: ({ children, ...props }: any) => (
        <thead className="bg-primary/15 dark:bg-primary/20" {...props}>{children}</thead>
      ),
      th: ({ children, ...props }: any) => (
        <th className="px-3 py-2.5 text-left font-semibold text-foreground text-[11px] uppercase tracking-wider border-b border-border/50 dark:border-primary/30 whitespace-nowrap" {...props}>{children}</th>
      ),
      td: ({ children, ...props }: any) => (
        <td className="px-3 py-2 border-b border-border/20 dark:border-border/40 text-foreground/90 whitespace-nowrap" {...props}>{children}</td>
      ),
      tr: ({ children, ...props }: any) => (
        <tr className="hover:bg-muted/40 dark:hover:bg-primary/5 transition-colors even:bg-muted/20 dark:even:bg-primary/[0.03]" {...props}>{children}</tr>
      ),
      h2: ({ children, ...props }: any) => (
        <h2 className="text-sm font-semibold text-foreground mt-3 mb-1.5 flex items-center gap-1.5" {...props}>{children}</h2>
      ),
      h3: ({ children, ...props }: any) => (
        <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 flex items-center gap-1" {...props}>{children}</h3>
      ),
      p: ({ children, ...props }: any) => (
        <p className="my-1.5 leading-relaxed" {...props}>{children}</p>
      ),
      ul: ({ children, ...props }: any) => (
        <ul className="my-1.5 ml-1 space-y-0.5" {...props}>{children}</ul>
      ),
      li: ({ children, ...props }: any) => (
        <li className="flex items-start gap-1.5 text-foreground/85" {...props}>
          <span className="text-primary mt-1 text-[8px]">●</span>
          <span>{children}</span>
        </li>
      ),
      strong: ({ children, ...props }: any) => (
        <strong className="font-semibold text-foreground" {...props}>{children}</strong>
      ),
      code: ({ children, ...props }: any) => (
        <code className="text-xs bg-background/50 px-1 py-0.5 rounded text-primary" {...props}>{children}</code>
      ),
    };

    const proseClasses = "max-w-full text-sm leading-relaxed break-words [word-break:break-word]";

    const renderMarkdown = (text: string) => {
      if (!text.includes('```chart') || isStreaming) {
        return (
          <div className={proseClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</ReactMarkdown>
          </div>
        );
      }
      const parts = parseChartBlocks(text);
      return (
        <div>
          {parts.map((part, i) =>
            part.type === 'chart' ? (
              <ChatChart key={i} spec={part.spec} />
            ) : (
              <div key={i} className={proseClasses}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{part.value}</ReactMarkdown>
              </div>
            )
          )}
        </div>
      );
    };

    return (
      <div>
        {renderMarkdown(cleanContent)}
        {!isStreaming && actions.length > 0 && <ChatActionButtons actions={actions} />}
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
      <div className="flex flex-col max-w-[85%] min-w-0">
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-sm leading-relaxed overflow-hidden break-words',
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted dark:bg-card dark:border dark:border-border/40 rounded-bl-sm'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{content}</div>
          ) : (
            renderAssistantContent()
          )}
        </div>
        {/* Action buttons for assistant messages */}
        {!isUser && showDownload && (
          <div className="flex items-center gap-0.5 mt-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => downloadResponseAsPdf(content)}
              className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Download as PDF"
            >
              <Download className="w-3 h-3" />
            </Button>
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
