import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function renderInlineTokens(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`code-${keyCounter++}`}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-800 border border-slate-200/80"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`bold-${keyCounter++}`} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={`italic-${keyCounter++}`} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && isSafeHref(linkMatch[2])) {
        nodes.push(
          <a
            key={`link-${keyCounter++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600 rounded-sm"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        nodes.push(token);
      }
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3.5 py-2">
        <span className="font-mono text-xs text-slate-300">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400 whitespace-nowrap shrink-0"
          aria-label="Copy code block"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <CodeBlock
          key={`block-${blockKey++}`}
          language={lang}
          code={codeLines.join("\n")}
        />
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? "mt-4 mb-2 text-lg font-semibold text-slate-900"
          : level === 2
            ? "mt-3.5 mb-1.5 text-base font-semibold text-slate-900"
            : "mt-3 mb-1 text-[15px] font-semibold text-slate-900";
      blocks.push(
        <div key={`block-${blockKey++}`} className={cls}>
          {renderInlineTokens(text)}
        </div>
      );
      i++;
      continue;
    }

    // Markdown table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
    ) {
      const parseRow = (row: string) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      blocks.push(
        <div
          key={`block-${blockKey++}`}
          className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-white"
        >
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 font-semibold text-slate-800"
                  >
                    {renderInlineTokens(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr
                  key={rIdx}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  {r.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700">
                      {renderInlineTokens(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={`block-${blockKey++}`}
          className="my-2 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineTokens(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={`block-${blockKey++}`}
          className="my-2 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineTokens(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph (collect contiguous non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    blocks.push(
      <p
        key={`block-${blockKey++}`}
        className="my-2 text-[15px] leading-relaxed text-slate-800 first:mt-0 last:mb-0"
      >
        {renderInlineTokens(paraLines.join(" "))}
      </p>
    );
  }

  return <div className="min-w-0 break-words">{blocks}</div>;
};
