import katex from 'katex';
import 'katex/dist/katex.min.css';
import html2canvas from 'html2canvas';

/**
 * 渲染 LaTeX 公式为 HTML
 * @param formula LaTeX 公式代码
 * @param displayMode 是否为块级公式
 * @returns HTML 字符串
 */
export const renderFormulaToHtml = (formula: string, displayMode: boolean = false): string => {
  try {
    return katex.renderToString(formula, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch (error) {
    console.error('Failed to render formula:', error);
    return formula;
  }
};

/**
 * 处理文本中的 LaTeX 公式，转换为 HTML
 * 支持：行内公式 $...$ 或 \(...\) 和块级公式 $$...$$ 或 \[...\]
 */
export const processLatexInText = (text: string): string => {
  if (!text) return text;

  let result = text;

  // 处理块级公式 \[...\]
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    try {
      const normalized = normalizeUnicodeToLatex(formula.trim());
      return katex.renderToString(normalized, {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch (e) {
      return match;
    }
  });

  // 处理块级公式 $$...$$
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    try {
      const normalized = normalizeUnicodeToLatex(formula.trim());
      return katex.renderToString(normalized, {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch (e) {
      return match;
    }
  });

  // 处理行内公式 \(...\)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
    try {
      const normalized = normalizeUnicodeToLatex(formula.trim());
      return katex.renderToString(normalized, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      });
    } catch (e) {
      return match;
    }
  });

  // 处理行内公式 $...$（排除已处理的 $$...$$）
  result = result.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (match, formula) => {
    try {
      const normalized = normalizeUnicodeToLatex(formula.trim());
      return katex.renderToString(normalized, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      });
    } catch (e) {
      return match;
    }
  });

  return result;
};

/**
 * 提取 LaTeX 公式，用于生成 Word 文档
 * 返回公式数组和替换后的文本（带占位符）
 * 支持：$...$, $$...$$, \(...\), \[...\]
 */
export const extractLatexFormulas = (text: string): {
  processedText: string;
  formulas: Array<{ type: 'inline' | 'block'; formula: string; placeholder: string }>;
} => {
  const formulas: Array<{ type: 'inline' | 'block'; formula: string; placeholder: string }> = [];
  let processedText = text;
  let formulaIndex = 0;

  // 处理块级公式 \[...\]
  processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    const placeholder = `[[FORMULA_BLOCK_${formulaIndex}]]`;
    formulas.push({
      type: 'block',
      formula: normalizeUnicodeToLatex(formula.trim()),
      placeholder,
    });
    formulaIndex++;
    return placeholder;
  });

  // 处理块级公式 $$...$$
  processedText = processedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    const placeholder = `[[FORMULA_BLOCK_${formulaIndex}]]`;
    formulas.push({
      type: 'block',
      formula: normalizeUnicodeToLatex(formula.trim()),
      placeholder,
    });
    formulaIndex++;
    return placeholder;
  });

  // 处理行内公式 \(...\)
  processedText = processedText.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
    const placeholder = `[[FORMULA_INLINE_${formulaIndex}]]`;
    formulas.push({
      type: 'inline',
      formula: normalizeUnicodeToLatex(formula.trim()),
      placeholder,
    });
    formulaIndex++;
    return placeholder;
  });

  // 处理行内公式 $...$
  processedText = processedText.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)\$(?!\$)/g, (match, formula) => {
    const placeholder = `[[FORMULA_INLINE_${formulaIndex}]]`;
    formulas.push({
      type: 'inline',
      formula: normalizeUnicodeToLatex(formula.trim()),
      placeholder,
    });
    formulaIndex++;
    formulaIndex++;
    return placeholder;
  });



  // Instead of replacing the entire text (which may delete surrounding non-formula text), 
  // we scan for specific patterns and verify if they are standalone or embedded.

  // Regex to match common LaTeX commands with their arguments (simple non-nested brace matching)
  // Matches \command{...} or \command
  // Fallback: Detect "naked" formulas (no delimiters)

  // Strategy 1: "Math Line" Detection
  // If a line is "mostly math" (contains extended math symbols, logic, equality), treat the whole line as a block formula.
  // This handles cases like: 65 \times 10 \times 1.036 \approx 673 \text{ kcal}
  const isMathLine = (str: string) => {
    if (!str || str.trim().length === 0) return false;
    // Heuristic: "Mostly Math"
    // Count explicit LaTeX commands and math symbols.
    // If the density/count is high, it's a math block.
    // We use a threshold of 3 triggers to avoid matching simple sentences like "The value is \text{foo}."

    const matches = str.match(/[=≈×÷±≠≤≥\\]/g);
    const count = matches ? matches.length : 0;

    return count >= 3 && str.length < 200;
  };

  // We need to look at the text structurally. Since we are in a 'replace' loop context, 'processedText' is the whole text being processed.
  // If the whole processedText is effectively one "line" or block that looks like math, we treat it as block.
  // (In the current architecture, 'extractLatexFormulas' is called on larger chunks. We should check if the *remaining* text looks like a math block).

  // Note: 'processedText' might already have placeholders. We should ignore them in our check.
  const textWithoutPlaceholders = processedText.replace(/\[\[FORMULA_(INLINE|BLOCK)_\d+\]\]/g, '');

  if (formulas.length === 0 && isMathLine(textWithoutPlaceholders)) {
    // Treat whole text as block formula
    const placeholder = `[[FORMULA_BLOCK_${formulaIndex}]]`;
    formulas.push({
      type: 'block',
      formula: normalizeUnicodeToLatex(processedText.trim()),
      placeholder,
    });
    processedText = placeholder;
  } else {
    // Strategy 2: Inline Command Extraction
    // If it's mixed text, extract specific commands
    const nakedCommandRegex = /\\(text|frac|sqrt|sum|int|alpha|beta|gamma|delta|theta|pi|sigma|omega|infty|times|div|pm|approx|neq|leq|geq)(\{[^}]*\}|)/g;

    if (nakedCommandRegex.test(processedText)) {
      processedText = processedText.replace(nakedCommandRegex, (match) => {
        const placeholder = `[[FORMULA_INLINE_${formulaIndex}]]`;
        formulas.push({
          type: 'inline',
          formula: normalizeUnicodeToLatex(match.trim()),
          placeholder,
        });
        formulaIndex++;
        return placeholder;
      });
    }
  }

  return { processedText, formulas };
};

/**
 * 检查文本是否包含 LaTeX 公式
 * 支持：$...$, $$...$$, \(...\), \[...\]
 */
export const hasLatexFormula = (text: string): boolean => {
  // Check for $...$ or $$...$$
  if (/\$\$?[\s\S]*?\$\$?/.test(text)) return true;
  // Check for \[...\]
  if (/\\\[[\s\S]*?\\\]/.test(text)) return true;
  // Check for \(...\)
  if (/\\\([\s\S]*?\\\)/.test(text)) return true;

  // Check for common 'naked' LaTeX commands (often used without delimiters in some contexts)
  // e.g. \text{...}, \frac{...}, \sqrt{...}
  if (/\\(text|frac|sqrt|sum|int|alpha|beta|gamma|delta|theta|pi|sigma|omega|infty|times|div|pm|approx|neq|leq|geq)\b/.test(text)) return true;

  return false;
};

/**
 * 检测文本是否包含数学公式模式（等号、乘号、除号等）
 * 用于检测纯文本格式的公式
 */
export const hasMathFormulaPattern = (text: string): boolean => {
  // 检测包含等号、乘号、除号、分数线等的文本
  // 例如：卡路里 = 体重 × 距离 × 1.036
  const mathPatterns = [
    /[=＝]/,  // 等号
    /[×✕✖\*]/,  // 乘号
    /[÷／/]/,  // 除号
    /[\+\-±]/,  // 加减号
    /\d+\s*[\(\[][^\)\]]+[\)\]]/,  // 数字后跟括号，如 65kg、10km
    /[\(\[][^\)\]]+[\)\]]\s*[=＝]/,  // 括号后跟等号
    /\b\w+\s*[=＝]\s*\w+\b/,  // word = word 模式
  ];

  return mathPatterns.some(pattern => pattern.test(text));
};

/**
 * Unicode 数学符号到 LaTeX 的完整映射
 * 包括：上/下标数字、希腊字母、集合符号、逻辑符号、箭头、其他符号
 * 时间格式转换：5'41'' → 5'41"
 */
export const normalizeUnicodeToLatex = (text: string): string => {
  const symbolMap: { [key: string]: string } = {
    // ========== 下标数字 ==========
    '₀': '_{0}', '₁': '_{1}', '₂': '_{2}', '₃': '_{3}', '₄': '_{4}',
    '₅': '_{5}', '₆': '_{6}', '₇': '_{7}', '₈': '_{8}', '₉': '_{9}',
    '₊': '_{+}', '₋': '_{-}', '₌': '_{=}', '₍': '_{(}', '₎': '_{)}',

    // ========== 上标数字 ==========
    '⁰': '^{0}', '¹': '^{1}', '²': '^{2}', '³': '^{3}', '⁴': '^{4}',
    '⁵': '^{5}', '⁶': '^{6}', '⁷': '^{7}', '⁸': '^{8}', '⁹': '^{9}',
    '⁺': '^{+}', '⁻': '^{-}', '⁼': '^{=}', '⁽': '^{(}', '⁾': '^{})',
    'ⁿ': '^{n}',

    // ========== 常见分数 ==========
    '¼': '\\frac{1}{4}', '½': '\\frac{1}{2}', '¾': '\\frac{3}{4}',
    '⅓': '\\frac{1}{3}', '⅔': '\\frac{2}{3}',
    '⅕': '\\frac{1}{5}', '⅖': '\\frac{2}{5}', '⅗': '\\frac{3}{5}',
    '⅘': '\\frac{4}{5}', '⅙': '\\frac{1}{6}', '⅚': '\\frac{5}{6}',
    '⅐': '\\frac{1}{7}', '⅛': '\\frac{1}{8}', '⅜': '\\frac{3}{8}',
    '⅝': '\\frac{5}{8}', '⅞': '\\frac{7}{8}', '⅑': '\\frac{1}{9}',
    '⅒': '\\frac{1}{10}',

    // ========== 希腊字母（小写）==========
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
    'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
    'ν': '\\nu', 'ξ': '\\xi', 'ο': '\\omicron', 'π': '\\pi',
    'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon',
    'φ': '\\varphi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
    // 变体
    'ϵ': '\\epsilon', 'ϑ': '\\vartheta', 'ϰ': '\\varkappa',
    'ϖ': '\\varpi', 'ϱ': '\\varrho', 'ς': '\\varsigma',
    'ϕ': '\\phi',

    // ========== 希腊字母（大写）==========
    'Α': 'A', 'Β': 'B', 'Γ': '\\Gamma', 'Δ': '\\Delta',
    'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Θ': '\\Theta',
    'Ι': 'I', 'Κ': 'K', 'Λ': '\\Lambda', 'Μ': 'M',
    'Ν': 'N', 'Ξ': '\\Xi', 'Ο': 'O', 'Π': '\\Pi',
    'Ρ': 'P', 'Σ': '\\Sigma', 'Τ': 'T', 'Υ': '\\Upsilon',
    'Φ': '\\Phi', 'Χ': 'X', 'Ψ': '\\Psi', 'Ω': '\\Omega',

    // ========== 集合符号 ==========
    '∪': '\\cup', '∩': '\\cap', '∈': '\\in', '∉': '\\notin',
    '∅': '\\emptyset', '⊂': '\\subset', '⊃': '\\supset',
    '⊆': '\\subseteq', '⊇': '\\supseteq', '∖': '\\setminus',
    '∋': '\\ni', '∌': '\\notni', '⊄': '\\not\\subset',
    '⊅': '\\not\\supset',

    // ========== 逻辑符号 ==========
    '∧': '\\land', '∨': '\\lor', '¬': '\\lnot',
    '∀': '\\forall', '∃': '\\exists',
    '∄': '\\nexists', '⊢': '\\vdash', '⊣': '\\dashv',
    '⊨': '\\models', '⊩': '\\Vdash', '⊬': '\\nVdash',

    // ========== 箭头符号 ==========
    '←': '\\leftarrow', '↑': '\\uparrow', '→': '\\rightarrow',
    '↓': '\\downarrow', '↔': '\\leftrightarrow',
    '⇐': '\\Leftarrow', '⇑': '\\Uparrow', '⇒': '\\Rightarrow',
    '⇓': '\\Downarrow', '⇔': '\\Leftrightarrow',
    '⟵': '\\longleftarrow', '⟶': '\\longrightarrow',
    '⟷': '\\longleftrightarrow',

    // ========== 其他数学符号 ==========
    '∞': '\\infty', '√': '\\sqrt{}', '±': '\\pm',
    '÷': '\\div', '×': '\\times', '≈': '\\approx',
    '≠': '\\neq', '≤': '\\leq', '≥': '\\geq',
    '≪': '\\ll', '≫': '\\gg', '∂': '\\partial',
    '∇': '\\nabla', '∫': '\\int', '∬': '\\iint',
    '∭': '\\iiint', '∑': '\\sum', '∏': '\\prod',
    '∐': '\\coprod', '⋂': '\\bigcap', '⋃': '\\bigcup',
    '∴': '\\therefore', '∵': '\\because',
    '⊥': '\\perp', '∥': '\\parallel', '∠': '\\angle',
    '∟': '\\sphericalangle', '°': '^\\circ',

    // ========== 其他符号 ==========
    '…': '\\dots', '⋯': '\\cdots', '⋮': '\\vdots',
    '⋱': '\\ddots', '∣': '\\mid', '∤': '\\nmid',
    '∦': '\\nparallel',
  };

  let result = text;

  // 先处理时间格式：5'41'' → 5'41"
  result = result.replace(/(\d+)\'(\d+)\'\'/g, '$1\'$2"');

  // 逐个替换 Unicode 符号
  for (const [unicode, latex] of Object.entries(symbolMap)) {
    result = result.split(unicode).join(latex);
  }

  return result;
};

/**
 * 将 LaTeX 公式渲染为 PNG 图片的 Base64 数据
 */
export const renderLatexToImage = async (formula: string, displayMode: boolean = false): Promise<{ base64: string; width: number; height: number } | null> => {
  console.log('[Formula Render] Starting render for formula:', formula, 'displayMode:', displayMode);

  try {
    // 创建一个临时的 div 来渲染公式
    const container = document.createElement('div');
    // 使用 opacity: 0 替代 visibility: hidden，确保浏览器正确渲染
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.opacity = '0';
    container.style.zIndex = '-9999';
    // 设置明确的宽度和渲染提示
    container.style.width = 'auto';
    container.style.height = 'auto';
    container.style.willChange = 'transform';
    // 设置足够的内边距和背景色，确保生成的图片完整且清晰
    container.style.padding = '8px';
    container.style.backgroundColor = '#ffffff';
    container.style.display = 'inline-block'; // 自适应内容宽度
    document.body.appendChild(container);

    // 预加载 KaTeX 字体
    await document.fonts.load('14px KaTeX_Main-Regular');
    await document.fonts.load('14px KaTeX_Math-Italic');
    await document.fonts.load('14px KaTeX_Size1-Regular');
    await document.fonts.load('14px KaTeX_Size2-Regular');
    await document.fonts.load('14px KaTeX_Size3-Regular');
    await document.fonts.load('14px KaTeX_Size4-Regular');

    // 等待所有字体加载完成
    await document.fonts.ready;
    console.log('[Formula Render] Fonts loaded');

    // 先转换 Unicode 符号为 LaTeX
    const normalizedFormula = normalizeUnicodeToLatex(formula);
    console.log('[Formula Render] Normalized formula:', normalizedFormula);

    // 使用 Katex 渲染公式
    katex.render(normalizedFormula, container, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html', // 仅生成 HTML，不需要 MathML，避免部分样式问题
    });
    console.log('[Formula Render] KaTeX rendered, container HTML length:', container.innerHTML.length);

    // 额外等待确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 获取尺寸 (px)
    const width = container.offsetWidth;
    const height = container.offsetHeight;
    console.log('[Formula Render] Container dimensions:', { width, height, innerText: container.innerText });

    // 如果尺寸为0，说明渲染失败
    if (width === 0 || height === 0) {
      console.error('[Formula Render] Invalid dimensions:', { width, height });
      document.body.removeChild(container);
      return null;
    }

    // 转换为 PNG
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      // 优化性能：确保克隆文档中的样式正确
      onclone: (clonedDoc) => {
        const clonedContainer = clonedDoc.querySelector('div[style*="opacity: 0"]');
        if (clonedContainer) {
          (clonedContainer as HTMLElement).style.visibility = 'visible';
          (clonedContainer as HTMLElement).style.opacity = '1';
        }
      }
    });

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    console.log('[Formula Render] PNG generated, dataURL length:', dataUrl.length);

    document.body.removeChild(container);

    // 限制 canvas 的内存占用
    if (canvas.width * canvas.height > 20000000) {  // 20M 像素
      console.warn('[Formula Render] Formula too large, reducing scale');
      return null;
    }

    // 清理 canvas 引用以释放内存
    (canvas as any).width = 0;
    (canvas as any).height = 0;

    // 返回 base64 数据（去掉 data:image/png;base64, 前缀）
    return {
      base64: dataUrl.split(',')[1],
      width,
      height
    };
  } catch (error) {
    console.error('[Formula Render] Failed to render latex formula:', error);
    return null;
  }
};

