import React, { useState, useMemo, useEffect } from 'react';
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

const App: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [user, setUser] = useState<User | null>(null);

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

  useEffect(() => {
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }, []);

  const tokenCount = useMemo(() => {
    return content.length > 0 ? Math.ceil(content.length / 4) : 0;
  }, [content]);

  const handleClear = () => setContent('');
  
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
      const fileName = `ai2word-export-${new Date().getTime()}.docx`;
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
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold shadow-sm border transition-all active:scale-95 ${
                isLoggedIn 
                ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-600 border-emerald-200/50'
                : 'bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 text-orange-600 border-orange-200/50'
              }`}
            >
              <Crown size={12} className={isLoggedIn ? "fill-emerald-500" : "fill-orange-500"} />
              {isLoggedIn ? "高级会员" : "无限使用"}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-4 pb-5 md:px-6 md:pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 flex flex-col bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm shadow-orange-100/20 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
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
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full bg-transparent border-none focus:ring-0 text-sm text-slate-700 placeholder:text-slate-300 p-4 resize-none leading-relaxed outline-none"
                placeholder={`# 在此粘贴内容...

支持：
- Markdown 格式
- Mermaid 图表
- HTML 表格`}
              />
            </div>

            <div className="shrink-0 pt-4">
              <button
                onClick={handleDownload}
                disabled={!content.trim() || isProcessing}
                className={`relative w-full h-12 rounded-2xl flex items-center justify-center gap-2 overflow-hidden shadow-xl transition-all duration-300 ${
                  !content.trim() 
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
                v2.5.0 • {tokenCount > 0 ? `正在处理 ${tokenCount} 个 Token` : '准备就绪'}
              </p>
            </div>
          </div>

          <div className="hidden lg:flex flex-col h-full min-h-0 bg-white rounded-3xl border border-slate-100 overflow-hidden relative shadow-sm shadow-orange-100/20">
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

             <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                 <div className="min-h-full w-full mx-auto">
                     {content.trim() ? (
                          <div 
                            className="prose max-w-none"
                            dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
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
