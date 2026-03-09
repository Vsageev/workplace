import type { ClassAttributes, ComponentProps, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import styles from './MarkdownContent.module.css';

interface MarkdownContentProps {
  children: string;
  /** Use compact sizing for comments and tight spaces */
  compact?: boolean;
  className?: string;
}

function CodeBlock({ className, children, ...props }: ClassAttributes<HTMLElement> & HTMLAttributes<HTMLElement> & ExtraProps) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');
  if (match) {
    return (
      <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
        {code}
      </SyntaxHighlighter>
    );
  }
  return <code className={className} {...props}>{children}</code>;
}

function getInternalStoragePath(src: string | undefined): string | null {
  if (!src) return null;

  try {
    const url = new URL(src, window.location.origin);
    if (url.pathname !== '/api/storage/download') return null;
    return url.searchParams.get('path');
  } catch {
    return null;
  }
}

function MarkdownImage(props: ComponentProps<'img'>) {
  const { src, alt = '', ...rest } = props;
  const storagePath = getInternalStoragePath(src);
  const [resolvedSrc, setResolvedSrc] = useState(src ?? '');

  useEffect(() => {
    if (!storagePath) {
      setResolvedSrc(src ?? '');
      return;
    }

    let revokeUrl: string | null = null;
    let cancelled = false;
    const token = localStorage.getItem('ws_access_token');

    fetch(`/api/storage/download?path=${encodeURIComponent(storagePath)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load image');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        revokeUrl = URL.createObjectURL(blob);
        setResolvedSrc(revokeUrl);
      })
      .catch(() => {
        if (!cancelled) setResolvedSrc(src ?? '');
      });

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [src, storagePath]);

  if (!resolvedSrc) {
    return <div className={styles.imagePlaceholder}>Loading image...</div>;
  }

  return <img src={resolvedSrc} alt={alt} {...rest} />;
}

/**
 * Detects links that point to local file paths (e.g. http://localhost:5173/Users/vlad/file.dart#L61)
 * and opens them in the configured editor instead of navigating in the browser.
 */
function FileLink(props: ComponentProps<'a'>) {
  const { href, children, ...rest } = props;

  function parseFileLink(url: string | undefined): { filePath: string; line?: number } | null {
    if (!url) return null;
    try {
      const parsed = new URL(url, window.location.origin);
      const pathname = parsed.pathname;
      // Detect absolute file paths (macOS /Users/..., Linux /home/..., or generic /...)
      if (!pathname.match(/^\/(?:Users|home|tmp|var|opt|etc)\//)) return null;
      // Must have a file extension to avoid false positives with app routes
      if (!pathname.match(/\.\w+$/)) return null;
      const lineMatch = parsed.hash.match(/^#L(\d+)/);
      return { filePath: pathname, line: lineMatch ? parseInt(lineMatch[1], 10) : undefined };
    } catch {
      return null;
    }
  }

  const fileInfo = parseFileLink(href);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!fileInfo) return;
    e.preventDefault();
    const editor = localStorage.getItem('ws_editor_protocol') || 'cursor';
    const lineStr = fileInfo.line ? `:${fileInfo.line}` : '';
    if (editor === 'vscode') {
      window.open(`vscode://file${fileInfo.filePath}${lineStr}`, '_self');
    } else {
      window.open(`cursor://file${fileInfo.filePath}${lineStr}`, '_self');
    }
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

export function MarkdownContent({ children, compact, className }: MarkdownContentProps) {
  const cls = [styles.markdown, compact && styles.compact, className].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock, img: MarkdownImage, a: FileLink }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
