import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Trash2,
  Clipboard,
  Palette,
  Workflow,
  Table as TableIcon,
  Download,
  Loader2,
  Crown,
  History,
  Eye,
  FileType,
  LogOut
} from 'lucide-react';
import { AppConfig } from './types';
import { ConfigRow } from './components/ConfigRow';
import { AuthModal } from './components/AuthModal';
import { HistoryModal } from './components/HistoryModal';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { generateWordDocument } from './lib/docxGenerator';
import { saveAs } from 'file-saver';
import { marked } from 'marked';

// Check marked is loaded correctly
console.log('[App] marked module:', marked);
console.log('[App] marked.parse type:', typeof marked.parse);
import mermaid from 'mermaid';
import { processLatexInText, hasLatexFormula } from './lib/mathRenderer';

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Microsoft YaHei, sans-serif',
});

const App: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isScrollSyncLocked = useRef(false);
  const isMermaidRendered = useRef(false);

  const config: AppConfig = {
    keepStyles: true,
    convertMermaid: true,
    optimizeTables: true,
  };

  const isLoggedIn = !!user;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session) {
        setShowAuthModal(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 生成预览 HTML
  const generatePreviewHtml = useCallback((text: string): string => {
    if (!text.trim()) return '';

    console.log('[Preview] === START ===');
    console.log('[Preview] Input text (first 500 chars):', text.substring(0, 500));
    console.log('[Preview] Input length:', text.length);
    console.log('[Preview] Has LaTeX:', hasLatexFormula(text));

    // 自动修复：去除多余的缩进
    // 找到所有非空行的最小缩进
    const lines = text.split('\n');
    let minIndent = Infinity;
    let hasNonEmptyLine = false;

    for (const line of lines) {
      if (line.trim().length > 0) {
        hasNonEmptyLine = true;
        const indent = line.match(/^\s*/)?.[0].length || 0;
        if (indent < minIndent) {
          minIndent = indent;
        }
      }
    }

    // 如果所有行都有缩进，且缩进大于0，则去除
    let processedText = text;
    if (hasNonEmptyLine && minIndent > 0 && minIndent !== Infinity) {
      console.log(`[Preview] Detected common indentation: ${minIndent}, removing...`);
      processedText = lines.map(line => {
        if (line.length >= minIndent) {
          return line.substring(minIndent);
        }
        return line;
      }).join('\n');
    }

    // 自动修复：如果文本包含 mermaid 语法但不是代码块，添加代码块标记
    const mermaidPattern = /^(graph|flowchart|sequenceDiagram|gantt|classDiagram|stateDiagram|pie|gitGraph|erDiagram|journey|mindmap|timeline|sankey|block|c4)/m;

    // 检查是否包含 Mermaid 关键字（不在代码块中）
    const hasMermaid = mermaidPattern.test(text);
    const hasMermaidCodeBlock = text.includes('```mermaid');

    console.log('[Preview] Mermaid detection - hasMermaid:', hasMermaid, 'hasMermaidCodeBlock:', hasMermaidCodeBlock);

    if (hasMermaid && !hasMermaidCodeBlock) {
      console.log('[Preview] Detected Mermaid without code fence, auto-wrapping');
      // 找到 Mermaid 开始行
      const lines = processedText.split('\n');
      console.log('[Preview] Lines:', lines.map((l, i) => `${i}:${l}`).join('\n'));
      const mermaidStart = lines.findIndex(line => mermaidPattern.test(line.trim()));
      console.log('[Preview] Mermaid start line:', mermaidStart);

      if (mermaidStart !== -1) {
        const linesBefore = lines.slice(0, mermaidStart);
        const remainingLines = lines.slice(mermaidStart);

        // 找到 Mermaid 代码的结束行（下一个代码块标记或空行）
        let mermaidEnd = remainingLines.findIndex((line, index) => {
          const trimmed = line.trim();
          // 遇到下一个代码块标记，且不是在 mermaid 代码块内
          if (trimmed.startsWith('```') && index > 0) return true;
          // 遇到连续空行
          if (index > 2 && trimmed === '' && remainingLines[index - 1].trim() === '') return true;
          return false;
        });

        // 如果找不到结束，就到文档末尾
        if (mermaidEnd === -1) mermaidEnd = remainingLines.length;

        const mermaidLines = remainingLines.slice(0, mermaidEnd);
        const linesAfter = remainingLines.slice(mermaidEnd);

        console.log('[Preview] Mermaid end line relative:', mermaidEnd);
        console.log('[Preview] Lines after mermaid:', linesAfter.map((l, i) => `${i}:${l}`).join('\n'));

        processedText = linesBefore.join('\n') + '\n```mermaid\n' + mermaidLines.join('\n') + '\n```\n' + linesAfter.join('\n');
        console.log('[Preview] Auto-wrapped Mermaid in code fence');
      }
    }

    // 关键修复：在处理 LaTeX 之前，先提取并保护 Mermaid 代码块
    // 避免 LaTeX 处理污染 Mermaid 代码
    const mermaidBlocks: Array<{ placeholder: string; code: string }> = [];
    let mermaidIndex = 0;

    // 提取所有 mermaid 代码块，用占位符替换
    processedText = processedText.replace(/```mermaid\s*\n([\s\S]*?)```/g, (match, code) => {
      const placeholder = `[[MERMAID_BLOCK_${mermaidIndex}]]`;
      mermaidBlocks.push({ placeholder, code: code.trim() });
      mermaidIndex++;
      return placeholder;
    });

    console.log('[Preview] Extracted Mermaid blocks:', mermaidBlocks.length);

    // 1. 处理 LaTeX 公式（此时 Mermaid 代码已被保护）
    if (hasLatexFormula(processedText)) {
      processedText = processLatexInText(processedText);
      console.log('[Preview] LaTeX processed, text (first 500 chars):', processedText.substring(0, 500));
    }

    // 2. 恢复 Mermaid 代码块（在 Markdown 解析之前）
    mermaidBlocks.forEach(({ placeholder, code }) => {
      processedText = processedText.replace(placeholder, `\`\`\`mermaid\n${code}\n\`\`\``);
    });

    console.log('[Preview] Mermaid blocks restored');

    // 3. 渲染 Markdown（mermaid 代码块会被渲染为 <pre><code class="language-mermaid">）
    try {
      console.log('[Preview] Calling marked.parse...');
      const html = marked.parse(processedText, {
        gfm: true,
        breaks: true,
        headerIds: true,
        mangle: false
      }) as string;

      console.log('[Preview] Parsed HTML type:', typeof html);
      console.log('[Preview] Parsed HTML length:', html.length);
      console.log('[Preview] Parsed HTML (first 500 chars):', html.substring(0, 500));

      return html;
    } catch (error) {
      console.error('[Preview] Error parsing markdown:', error);
      // 如果解析失败，返回原始文本（编码后）
      return processedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, []);

  // 当内容变化时更新预览 HTML
  useEffect(() => {
    const html = generatePreviewHtml(content);
    console.log('[Content Effect] Content length:', content.length, 'HTML length:', html.length);
    setPreviewHtml(html);
    setRenderedHtml(html); // 初始化 renderedHtml
    // 重置 Mermaid 渲染标记，延迟以确保 HTML 已更新到 DOM
    setTimeout(() => {
      isMermaidRendered.current = false;
      console.log('[Content Effect] Mermaid render flag reset');
    }, 0);
  }, [content, generatePreviewHtml]);

  // 渲染 Mermaid 图表（在预览 HTML 更新后执行）
  useEffect(() => {
    console.log('[Mermaid Effect] Triggered');
    console.log('[Mermaid Effect] isMermaidRendered:', isMermaidRendered.current);
    console.log('[Mermaid Effect] previewHtml length:', previewHtml?.length);
    console.log('[Mermaid Effect] previewContainerRef:', previewContainerRef.current);

    if (!previewContainerRef.current) {
      console.log('[Mermaid Effect] No container, skipping');
      return;
    }
    if (isMermaidRendered.current) {
      console.log('[Mermaid Effect] Already rendered, skipping');
      return; // 已渲染过则跳过
    }

    const renderMermaid = async () => {
      const container = previewContainerRef.current;
      if (!container) return;

      console.log('[Mermaid] Starting render, container:', container);
      console.log('[Mermaid] PreviewHtml length:', previewHtml?.length);

      // 查找所有 mermaid 代码块
      const codeElements = container.querySelectorAll('pre code, pre > code');
      console.log('[Mermaid] Total code elements:', codeElements.length);

      // 检查每个 code 元素，判断是否是 Mermaid 代码
      const mermaidElements: HTMLElement[] = [];
      const mermaidPattern = /^(graph|flowchart|sequenceDiagram|gantt|classDiagram|stateDiagram|pie|gitGraph|erDiagram|journey|mindmap|timeline|sankey|block|c4)/m;

      for (const codeEl of Array.from(codeElements) as HTMLElement[]) {
        const codeText = codeEl.textContent?.trim() || '';
        if (mermaidPattern.test(codeText) || codeEl.classList.contains('language-mermaid')) {
          mermaidElements.push(codeEl);
        }
      }

      console.log('[Mermaid] Found Mermaid code elements:', mermaidElements.length);

      if (mermaidElements.length === 0) {
        // 没有 Mermaid 代码块，直接标记完成
        isMermaidRendered.current = true;
        return;
      }

      let hasRendered = false;

      for (const codeEl of mermaidElements) {
        const preEl = codeEl.parentElement;
        if (!preEl || preEl.tagName !== 'PRE') continue;

        // 检查是否已经渲染过（pre 被替换为 div.mermaid-rendered）
        if (preEl.classList.contains('mermaid-rendered')) continue;

        const code = codeEl.textContent?.trim();
        if (!code) continue;

        try {
          const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;
          console.log('[Mermaid] Rendering diagram:', code.substring(0, 100));
          const { svg } = await mermaid.render(id, code);

          // 创建包装元素替换 pre
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-rendered flex justify-center my-3';
          wrapper.innerHTML = svg;

          // 替换 pre 元素
          preEl.replaceWith(wrapper);
          hasRendered = true;
          console.log('[Mermaid] Diagram rendered successfully');
        } catch (error) {
          console.error('Failed to render mermaid diagram:', error);
          // 渲染失败时显示错误
          preEl.classList.add('mermaid-rendered');
          preEl.innerHTML = `<code class="text-red-500 text-xs">Mermaid 渲染失败: ${error}</code>`;
          hasRendered = true;
        }
      }

      // Mermaid 渲染完成后，保存完整的 HTML 到 state
      if (hasRendered && container) {
        isMermaidRendered.current = true;
        // 获取渲染后的 HTML 并保存
        const proseElement = container.querySelector('.prose');
        if (proseElement) {
          setRenderedHtml(proseElement.innerHTML);
        }
      }
    };

    // 延迟执行以确保 DOM 已更新
    const timer = setTimeout(renderMermaid, 100);
    return () => clearTimeout(timer);
  }, [previewHtml]);

  const tokenCount = useMemo(() => {
    return content.length > 0 ? Math.ceil(content.length / 4) : 0;
  }, [content]);

  const handleClear = () => {
    setContent('');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setContent(text);
    } catch (err) {
      console.error('Failed to read clipboard', err);
      alert("请手动将内容粘贴到文本框中。");
    }
  };

  const handleDownload = async () => {
    if (!content.trim()) return;

    setIsProcessing(true);

    try {
      const blob = await generateWordDocument(content);
      // 生成可读的日期时间格式文件名：ai2word-2026-02-01-143052.docx
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10); // 2026-02-01
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ''); // 143052
      const fileName = `ai2word-${dateStr}-${timeStr}.docx`;
      const fileSize = (blob.size / 1024).toFixed(1) + 'KB';

      if (user) {
        try {
          const { error } = await supabase.from('conversions').insert({
            user_id: user.id,
            title: fileName,
            content: content.substring(0, 500),
            file_size: fileSize
          });
          if (error) throw error;
        } catch (err) {
          console.error('Failed to save history:', err);
        }
      }

      saveAs(blob, fileName);
    } catch (error) {
      console.error('Failed to generate DOCX:', error);
      alert('生成文档失败，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHistoryClick = () => {
    if (isLoggedIn) {
      setShowHistoryModal(true);
    } else {
      setShowAuthModal(true);
    }
  };

  // 同步滚动处理函数
  const handleTextareaScroll = useCallback(() => {
    if (isScrollSyncLocked.current) return;
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxScrollTop = textarea.scrollHeight - textarea.clientHeight;
    if (maxScrollTop <= 0) return;

    isScrollSyncLocked.current = true;
    const scrollRatio = textarea.scrollTop / maxScrollTop;
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    preview.scrollTop = scrollRatio * previewMaxScroll;

    requestAnimationFrame(() => {
      isScrollSyncLocked.current = false;
    });
  }, []);

  const handlePreviewScroll = useCallback(() => {
    if (isScrollSyncLocked.current) return;
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;
    if (!textarea || !preview) return;

    const maxScrollTop = preview.scrollHeight - preview.clientHeight;
    if (maxScrollTop <= 0) return;

    isScrollSyncLocked.current = true;
    const scrollRatio = preview.scrollTop / maxScrollTop;
    const textareaMaxScroll = textarea.scrollHeight - textarea.clientHeight;
    textarea.scrollTop = scrollRatio * textareaMaxScroll;

    requestAnimationFrame(() => {
      isScrollSyncLocked.current = false;
    });
  }, []);

  // 绑定滚动事件
  useEffect(() => {
    const textarea = textareaRef.current;
    const preview = previewContainerRef.current;

    textarea?.addEventListener('scroll', handleTextareaScroll);
    preview?.addEventListener('scroll', handlePreviewScroll);

    return () => {
      textarea?.removeEventListener('scroll', handleTextareaScroll);
      preview?.removeEventListener('scroll', handlePreviewScroll);
    };
  }, [handleTextareaScroll, handlePreviewScroll]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background-light font-sans text-text-main antialiased selection:bg-primary/30 flex flex-col">

      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[5%] -left-[10%] w-[80%] h-[40%] bg-orange-100/50 blur-[100px] rounded-full"></div>
        <div className="absolute top-[20%] right-[-5%] w-[60%] h-[50%] bg-yellow-50/60 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[10%] w-[70%] h-[40%] bg-amber-50/50 blur-[80px] rounded-full"></div>
      </div>

      <div className="relative z-10 flex flex-col h-full max-w-[1800px] mx-auto w-full transition-all duration-300">

        <div className="flex items-center px-5 py-4 justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-orange-500 text-white shadow-lg shadow-orange-500/20">
              <FileText size={18} />
            </div>
            <h1 className="text-slate-800 text-lg font-bold leading-tight tracking-tight">
              AI2Word
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHistoryClick}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
              title="下载历史"
            >
              <History size={18} />
            </button>
            {isLoggedIn && (
              <button
                onClick={handleLogout}
                className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                title="退出登录"
              >
                <LogOut size={18} />
              </button>
            )}
            <button
              onClick={() => {
                if (!isLoggedIn) setShowAuthModal(true);
              }}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm border transition-all active:scale-95 ${isLoggedIn
                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-600 border-emerald-200/50'
                : 'bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 text-orange-600 border-orange-200/50'
                }`}
            >
              <Crown size={12} className={isLoggedIn ? "fill-emerald-500" : "fill-orange-500"} />
              {isLoggedIn ? "高级会员" : "无限使用"}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-4 pb-5 md:px-6 md:pb-6 flex flex-col">

          <div className="flex-1 min-h-0 grid grid-cols-2 gap-6">

            <div className="flex flex-col h-full min-h-0 bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm shadow-orange-100/20 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 shrink-0">
                <span className="text-[11px] font-bold text-slate-500 tracking-tight uppercase">
                  粘贴 AI 内容
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClear}
                    className="text-[10px] font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md transition-all duration-200"
                  >
                    <Trash2 size={12} />
                    清空
                  </button>
                  <button
                    onClick={handlePaste}
                    className="text-[10px] font-bold text-primary hover:text-orange-600 hover:bg-orange-100 flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-md transition-all duration-200"
                  >
                    <Clipboard size={12} />
                    粘贴
                  </button>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full bg-transparent border-none focus:ring-0 text-sm text-slate-700 placeholder:text-slate-300 p-4 resize-none leading-relaxed outline-none overflow-y-auto custom-scrollbar"
                placeholder={`# 在此粘贴内容...

支持 Markdown 格式：
- 标题：## 或 ###
- 表格：| 列1 | 列2 | \n |------|------|
- 流程图：\`\`\`mermaid\n graph TD\n ...\n\`\`\`
- 公式：$E=mc^2$ 或 $$...$$

提示：如果流程图或公式没有正确显示，请确保使用了正确的格式标记。`}
              />
            </div>

            <div className="flex flex-col h-full min-h-0 bg-white rounded-3xl border border-slate-100 overflow-hidden relative shadow-sm shadow-orange-100/20">
              <div className="h-12 border-b border-slate-50 flex items-center justify-between px-5 bg-white shrink-0">
                <div className="flex items-center gap-2 text-slate-500">
                  <Eye size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">实时预览</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-100"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-100"></div>
                </div>
              </div>

              <div ref={previewContainerRef} className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="min-h-full w-full mx-auto">
                  {content.trim() ? (
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderedHtml || previewHtml }}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3 min-h-[400px]">
                      <FileType size={48} strokeWidth={1} />
                      <p className="text-sm font-medium">输入内容后在此处预览文档格式</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          <div className="shrink-0 pt-4">
            <button
              onClick={handleDownload}
              disabled={!content.trim() || isProcessing}
              className={`relative w-full h-12 rounded-2xl flex items-center justify-center gap-2 overflow-hidden shadow-xl transition-all duration-300 ${!content.trim()
                ? 'bg-slate-200 cursor-not-allowed shadow-none opacity-80'
                : 'bg-gradient-to-r from-primary to-primary-light shadow-orange-500/30 active:scale-[0.98] hover:brightness-105'
                }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin text-white" size={18} />
                  <span className="text-white text-sm font-bold tracking-wide">处理中...</span>
                </>
              ) : (
                <>
                  <Download className="text-white" strokeWidth={3} size={16} />
                  <span className="text-white text-sm font-bold tracking-wide">下载 .docx</span>
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-slate-400 mt-2 font-semibold tracking-wide uppercase">
              v2.6.0 • {tokenCount > 0 ? `正在处理 ${tokenCount} 个 Token` : '准备就绪'}
            </p>
          </div>

        </div>

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLoginSuccess={() => setShowAuthModal(false)}
        />
        <HistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />

      </div>
    </div>
  );
};

export default App;
