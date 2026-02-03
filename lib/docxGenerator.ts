import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
  convertInchesToTwip,
} from "docx";
import { marked } from "marked";
import { renderMermaidToImage } from "./mermaidRenderer";
import { extractLatexFormulas, hasLatexFormula, renderLatexToImage } from "./mathRenderer";

const COLORS = {
  H1: "2E74B5",
  H2: "1F4D78",
  H3: "428bca",
  TABLE_HEADER_BG: "F3F4F6",
  TABLE_ROW_ODD: "FFFFFF",
  TABLE_ROW_EVEN: "FAFAFA",
  CODE_BG: "F5F5F5",
  BORDER_COLOR: "E5E7EB",
};

// LRU 缓存实现
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 重新插入到末尾（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最旧的（第一个）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// 存储 Mermaid 图表的图片数据
interface MermaidImage {
  code: string;
  base64: string | null;
}

const mermaidImageCache = new LRUCache<string, { base64: string; width: number; height: number } | null>(100);
const formulaImageCache = new LRUCache<string, { base64: string; width: number; height: number } | null>(200);

const processTextWithHtml = (text: string, baseOptions: any = {}): TextRun[] => {
  if (!text) return [];

  // Split by regex to find:
  // 1. Newlines (\n)
  // 2. HTML breaks (<br>)
  // 3. Bold tags (<b>...</b> or <strong>...</strong>)
  // We use capturing groups for delimiters so split includes them


  // Normalize whitespaces: duplicate horizontal spaces (space, tab, full-width space, nbsp) -> single space
  // PRESERVE newlines (\n) which are handled separately later
  const normalizedText = text.replace(/[ \t\u3000\u00A0]+/g, ' ');

  const parts = normalizedText.split(/(\n|<br\s*\/?>|<b>.*?<\/b>|<strong>.*?<\/strong>)/gi);
  const runs: TextRun[] = [];

  parts.forEach((part) => {
    if (!part) return; // Skip empty parts

    // Handle Line Breaks
    if (part === '\n' || part.match(/^<br\s*\/?>$/i)) {
      runs.push(new TextRun({ text: "", break: 1 }));
      return;
    }

    // Handle Bold Tags
    const boldMatch = part.match(/^<(b|strong)>(.*?)<\/\1>$/i);
    if (boldMatch) {
      const boldText = boldMatch[2];
      // 分割 Emoji 和普通文本
      const emojiParts = splitTextWithEmoji(boldText);
      emojiParts.forEach(({ text, isEmoji }) => {
        runs.push(new TextRun({
          text,
          ...baseOptions,
          bold: true,
          font: isEmoji ? "Segoe UI Emoji" : baseOptions.font
        }));
      });
      return;
    }

    // Handle Normal Text - 分割 Emoji 和普通文本
    const emojiParts = splitTextWithEmoji(part);
    emojiParts.forEach(({ text, isEmoji }) => {
      runs.push(new TextRun({
        text,
        ...baseOptions,
        font: isEmoji ? "Segoe UI Emoji" : baseOptions.font
      }));
    });
  });

  return runs;
};

// 将文本按 Emoji 分割，返回包含文本和是否为 Emoji 标记的数组
const splitTextWithEmoji = (text: string): Array<{ text: string; isEmoji: boolean }> => {
  if (!text) return [];
  
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}]|[\u{2B06}]|[\u{2B07}]|[\u{2B05}]|[\u{27A1}]|[\u{2194}-\u{2199}]|[\u{21A9}-\u{21AA}]|[\u{2934}-\u{2935}]|[\u{25AA}-\u{25AB}]|[\u{25FB}-\u{25FE}]|[\u{25FD}-\u{25FE}]|[\u{25FC}]|[\u{25B6}]|[\u{25C0}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F251}]|[\u{1F191}-\u{1F19A}]|[\u{2328}]|[\u{23CF}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25AA}-\u{25AB}]|[\u{26A0}-\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE0F}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu;
  
  const result: Array<{ text: string; isEmoji: boolean }> = [];
  let lastIndex = 0;
  let match;
  
  while ((match = emojiRegex.exec(text)) !== null) {
    // 添加 Emoji 前的普通文本
    if (match.index > lastIndex) {
      result.push({
        text: text.substring(lastIndex, match.index),
        isEmoji: false
      });
    }
    // 添加 Emoji
    result.push({
      text: match[0],
      isEmoji: true
    });
    lastIndex = match.index + match[0].length;
  }
  
  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    result.push({
      text: text.substring(lastIndex),
      isEmoji: false
    });
  }
  
  return result;
};

const processInlineTokens = (inlineTokens: any[], inheritedOptions: any = {}): TextRun[] => {
  if (!inlineTokens || !Array.isArray(inlineTokens)) return [];

  return inlineTokens.flatMap(token => {
    // Merge inherited options with current token's formatting
    const runOptions: any = { ...inheritedOptions };

    // Handle different token types
    switch (token.type) {
      case 'strong':
        runOptions.bold = true;
        break;
      case 'em':
        runOptions.italics = true;
        break;
      case 'codespan':
        runOptions.font = "Courier New";
        runOptions.shading = {
          type: ShadingType.CLEAR,
          fill: "F5F5F5",
        };
        break;
      case 'link':
        runOptions.color = "2563EB";
        runOptions.underline = {};
        break;
      case 'del':
        runOptions.strike = true;
        break;
      case 'br':
        return [new TextRun({ text: "", break: 1 })];
      case 'text':
        // Plain text, use inherited options only
        break;
      case 'escape':
        // Escaped characters, treat as text
        break;
      default:
        // Unknown token type, try to handle gracefully
        break;
    }

    // Recursive processing for nested tokens
    if (token.tokens && Array.isArray(token.tokens)) {
      return processInlineTokens(token.tokens, runOptions);
    }

    // Extract text content - prefer raw, then text
    let textContent = token.raw || token.text || '';

    // 🔥 CRITICAL: Normalize whitespace here (double insurance)
    // This ensures Word output matches HTML preview behavior
    textContent = textContent.replace(/[ \t\u3000\u00A0]+/g, ' ');

    // If there's no text content, return empty array
    if (!textContent) return [];

    return processTextWithHtml(textContent, runOptions);
  });
};

/**
 * 处理 LaTeX 公式，转换为 Word 可显示的格式
 * 由于 Word 原生支持 OMML 数学公式较复杂，这里使用近似表示
 */
// processLatexFormula removed as we now use images

// Helper to calculate table column widths intelligently
const calculateColumnWidths = (tableToken: any): number[] => {
  const allCells: any[] = [tableToken.header, ...tableToken.rows];
  const numColumns = tableToken.header.length;

  // 计算每列的最大内容长度（考虑中文字符）
  const columnLengths: number[] = [];
  for (let col = 0; col < numColumns; col++) {
    let maxLength = 0;
    for (const row of allCells) {
      const cell = row[col];
      const text = cell?.text || '';
      // 中文字符算2个宽度，英文字符算1个
      const length = text.split('').reduce((sum, char) => {
        return sum + (char.charCodeAt(0) > 255 ? 2 : 1);
      }, 0);
      maxLength = Math.max(maxLength, length);
    }
    columnLengths.push(maxLength);
  }

  // A4 纸张宽度 (twips): 11906
  // 页面边距: 上下左右各 720 twips
  // 可打印区域: 11906 - 720*2 = 10466 twips
  const availableWidth = 10466;
  const minColumnWidth = 1000; // 最小宽度约 50pt，够放3-4个汉字

  // 识别短列（内容长度小于4的字符，如"序号"列）
  const shortColumnThreshold = 4;
  const shortColumns = columnLengths.map(len => len <= shortColumnThreshold);
  const numShortColumns = shortColumns.filter(Boolean).length;
  const numRegularColumns = numColumns - numShortColumns;

  // 计算宽度分配
  const columnWidths: number[] = [];
  if (numRegularColumns > 0) {
    // 短列使用最小宽度
    const totalMinWidth = numShortColumns * minColumnWidth;
    const remainingWidth = availableWidth - totalMinWidth;
    const regularColumnWidth = remainingWidth / numRegularColumns;

    for (let i = 0; i < numColumns; i++) {
      columnWidths.push(shortColumns[i] ? minColumnWidth : regularColumnWidth);
    }
  } else {
    // 所有列都是短列，平均分配
    const avgWidth = availableWidth / numColumns;
    for (let i = 0; i < numColumns; i++) {
      columnWidths.push(avgWidth);
    }
  }

  return columnWidths;
};

// Helper to process content that might contain formulas
const processMixedContent = async (text: string, tokens: any[], runOptions: any = {}): Promise<(TextRun | ImageRun)[]> => {
  console.log('[processMixedContent] Processing text:', text?.substring(0, 100));
  console.log('[processMixedContent] Has formula?', hasLatexFormula(text));

  if (hasLatexFormula(text)) {
    const { processedText, formulas } = extractLatexFormulas(text);
    console.log('[processMixedContent] Extracted formulas:', formulas.length);
    console.log('[processMixedContent] Processed text:', processedText?.substring(0, 100));

    // If detected but no formulas extracted (edge case - naked formula), fallback to treating whole text as formula
    let effectiveFormulas = formulas;
    let parts = processedText.split(/(\[\[FORMULA_(?:INLINE|BLOCK)_\d+\]\])/);

    if (formulas.length === 0) {
      console.log('[processMixedContent] No delimited formulas found. Treating as naked block formula.');
      const placeholder = `[[FORMULA_BLOCK_NAKED]]`;
      effectiveFormulas = [{
        type: 'block',
        formula: text.trim(),
        placeholder
      }];
      parts = [placeholder];
    }
    const runs: (TextRun | ImageRun)[] = [];

    // 预先渲染所有公式（并行处理）
    const formulaPromises = effectiveFormulas.map(async (formula) => {
      const cacheKey = formula.formula;
      let imageData = formulaImageCache.get(cacheKey);

      if (imageData === undefined) {
        console.log('[processMixedContent] Rendering formula to image...', formula.formula.substring(0, 30));
        imageData = await renderLatexToImage(formula.formula, formula.type === 'block');
        console.log('[processMixedContent] Image data:', imageData ? `width=${imageData.width}, height=${imageData.height}` : 'null');
        formulaImageCache.set(cacheKey, imageData);
      } else {
        console.log('[processMixedContent] Using cached image data for:', formula.formula.substring(0, 30));
      }

      return { placeholder: formula.placeholder, imageData, formula };
    });

    // 等待所有公式渲染完成
    const renderedFormulas = await Promise.all(formulaPromises);

    // 构建文档内容
    for (const part of parts) {
      const formulaMatch = part.match(/\[\[FORMULA_(INLINE|BLOCK)_(\d+)\]\]/);
      if (formulaMatch) {
        const rendered = renderedFormulas.find(f => f.placeholder === part);
        if (rendered && rendered.imageData && rendered.imageData.base64) {
          try {
            const binaryString = window.atob(rendered.imageData.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            console.log('[processMixedContent] Adding ImageRun to document');
            runs.push(new ImageRun({
              data: bytes,
              transformation: {
                width: Math.round(rendered.imageData.width * 0.75),
                height: Math.round(rendered.imageData.height * 0.75),
              },
              type: 'png',
            }));
          } catch (error) {
            console.error('[processMixedContent] Error creating ImageRun:', error);
            runs.push(new TextRun({ text: rendered.formula.formula, italics: true, ...runOptions }));
          }
        } else {
          console.log('[processMixedContent] No image data, using fallback text');
          runs.push(new TextRun({ text: rendered?.formula.formula || part, italics: true, ...runOptions }));
        }
      } else if (part.trim() || part === '\n') {
        if (part.trim()) {
          runs.push(...processTextWithHtml(part, runOptions));
        }
      }
    }
    return runs;
  } else {
    return tokens ? processInlineTokens(tokens, runOptions) : processTextWithHtml(text, runOptions);
  }
};

const processTokens = async (tokens: any[]): Promise<any[]> => {
  const docxElements: any[] = [];
  const totalTokens = tokens.length;

  console.log(`[processTokens] Starting to process ${totalTokens} tokens`);

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];

    // 每 100 个 token 输出一次进度
    if (index % 100 === 0) {
      console.log(`[processTokens] Progress: ${index}/${totalTokens} (${Math.round(index / totalTokens * 100)}%)`);
    }

    switch (token.type) {
      case 'heading':
        const level = token.depth;
        let headingLevel: any = HeadingLevel.HEADING_1;
        let headingSpacing = { before: 240, after: 120 }; // H1 default: 12pt before, 6pt after

        if (level === 2) {
          headingLevel = HeadingLevel.HEADING_2;
          headingSpacing = { before: 200, after: 100 }; // 10pt, 5pt
        }
        if (level === 3) {
          headingLevel = HeadingLevel.HEADING_3;
          headingSpacing = { before: 160, after: 80 }; // 8pt, 4pt
        }
        if (level >= 4) {
          headingLevel = HeadingLevel.HEADING_4;
          headingSpacing = { before: 120, after: 60 }; // 6pt, 3pt
        }

        // 处理标题中的公式和 emoji
        let headingText = token.text;
        if (hasLatexFormula(headingText)) {
          const { processedText, formulas } = extractLatexFormulas(headingText);
          headingText = processedText;
          // 简单处理：将公式转换为文本
          // 简单处理：将公式转换为文本 (标题中暂不支持图片公式)
          formulas.forEach(f => {
            headingText = headingText.replace(f.placeholder, f.formula);
          });
        }

        // 使用 children 而非 text，以支持 emoji 字体
        const headingRuns = processTextWithHtml(headingText);
        docxElements.push(new Paragraph({
          children: headingRuns,
          heading: headingLevel,
          spacing: headingSpacing,
          alignment: AlignmentType.LEFT,
          border: level === 1 ? { bottom: { color: "E5E7EB", space: 4, style: BorderStyle.SINGLE, size: 6 } } : undefined
        }));
        break;

      case 'paragraph':
        // 处理段落中的公式
        let paragraphText = token.text || '';
        let paragraphTokens = token.tokens;

        const paragraphRuns = await processMixedContent(paragraphText, paragraphTokens);
        docxElements.push(new Paragraph({
          children: paragraphRuns,
          spacing: { before: 60, after: 60, line: 336 },
          alignment: AlignmentType.LEFT
        }));
        break;

      case 'list':
        for (const item of token.items) {
          const itemRuns = await processMixedContent(item.text, item.tokens);
          docxElements.push(new Paragraph({
            children: itemRuns,
            bullet: { level: 0 },
            spacing: { before: 40, after: 40 },
            alignment: AlignmentType.LEFT
          }));
        }
        break;

      case 'code':
        // 检查是否为 Mermaid 代码块
        if (token.lang === 'mermaid') {
          const cacheKey = token.text.trim();
          let imageData = mermaidImageCache.get(cacheKey);

          if (imageData === undefined) {
            imageData = await renderMermaidToImage(cacheKey);
            mermaidImageCache.set(cacheKey, imageData);
          }

          if (imageData) {
            // 将 Base64 转换为 Uint8Array
            const binaryString = window.atob(imageData.base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            // 计算图片尺寸，保持宽高比，最大宽度550px
            const maxWidth = 550;
            const minWidth = 400; // 确保小图也被放大显示
            let displayWidth = imageData.width;
            let displayHeight = imageData.height;

            if (displayWidth > maxWidth) {
              const scale = maxWidth / displayWidth;
              displayWidth = maxWidth;
              displayHeight = Math.round(displayHeight * scale);
            } else if (displayWidth < minWidth) {
              // 放大图片以提高可读性 (因为我们有 4x 的高分辨率源图，放大很安全)
              const scale = minWidth / displayWidth;
              // 再次检查放大后是否超过 maxWidth (虽然理论上 minWidth < maxWidth，但为了健壮性)
              const finalWidth = Math.min(minWidth, maxWidth);
              const finalScale = finalWidth / displayWidth;

              displayWidth = finalWidth;
              displayHeight = Math.round(displayHeight * finalScale);
            }

            // 添加图片到文档
            docxElements.push(new Paragraph({
              children: [
                new ImageRun({
                  data: bytes,
                  transformation: {
                    width: displayWidth,
                    height: displayHeight,
                  },
                  type: 'png',
                }),
              ],
              spacing: { before: 120, after: 120 },
              alignment: AlignmentType.CENTER,
            }));
          } else {
            // 如果渲染失败，显示代码文本
            const codeLines = token.text.split('\n');
            codeLines.forEach((line: string) => {
              docxElements.push(new Paragraph({
                children: [new TextRun({
                  text: line,
                  font: "Courier New",
                  size: 20
                })],
                shading: {
                  type: ShadingType.CLEAR,
                  fill: COLORS.CODE_BG,
                },
                alignment: AlignmentType.LEFT
              }));
            });
          }
        } else {
          const codeLines = token.text.split('\n');
          codeLines.forEach((line: string) => {
            docxElements.push(new Paragraph({
              children: [new TextRun({
                text: line,
                font: "Courier New",
                size: 20
              })],
              shading: {
                type: ShadingType.CLEAR,
                fill: COLORS.CODE_BG,
              },
              alignment: AlignmentType.LEFT
            }));
          });
        }
        break;

      case 'table':
        const tableRows: TableRow[] = [];

        // 计算智能列宽
        const columnWidths = calculateColumnWidths(token);

        // Header
        const headerCells = await Promise.all(token.header.map(async (cell: any, colIndex: number) => {
          const cellRuns = await processMixedContent(cell.text, cell.tokens, { bold: true, size: 16 });
          return new TableCell({
            children: [new Paragraph({
              children: cellRuns,
              spacing: { before: 20, after: 20, line: 240 },
              alignment: AlignmentType.LEFT
            })],
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            margins: { top: 50, bottom: 50, left: 80, right: 80 },
            width: { size: columnWidths[colIndex], type: WidthType.DXA },
            verticalAlign: "center",
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
              left: { style: BorderStyle.NONE, size: 0, color: "auto" },
              right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            }
          });
        }));
        tableRows.push(new TableRow({ children: headerCells }));

        // Rows
        for (const row of token.rows) {
          const cells = await Promise.all(row.map(async (cell: any, colIndex: number) => {
            const cellRuns = await processMixedContent(cell.text, cell.tokens, { size: 16 });
            return new TableCell({
              children: [new Paragraph({
                children: cellRuns,
                spacing: { before: 20, after: 20, line: 240 },
                alignment: AlignmentType.LEFT
              })],
              shading: {
                fill: "FFFFFF",
                type: ShadingType.CLEAR
              },
              margins: { top: 50, bottom: 50, left: 80, right: 80 },
              width: { size: columnWidths[colIndex], type: WidthType.DXA },
              verticalAlign: "center",
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
                left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                right: { style: BorderStyle.NONE, size: 0, color: "auto" },
              }
            });
          }));
          tableRows.push(new TableRow({ children: cells }));
        }

        docxElements.push(new Table({
          rows: tableRows,
          width: { size: 10466, type: WidthType.DXA },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
            left: { style: BorderStyle.NONE, size: 0, color: "auto" },
            right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
          }
        }));
        docxElements.push(new Paragraph({ text: "" }));
        break;

      case 'space':
        break;

      case 'hr':
        // Horizontal rule - use a paragraph with bottom border
        docxElements.push(new Paragraph({
          text: "",
          border: {
            bottom: {
              color: COLORS.BORDER_COLOR,
              space: 1,
              style: BorderStyle.SINGLE,
              size: 6
            }
          },
          spacing: { before: 100, after: 100 },
          alignment: AlignmentType.LEFT
        }));
        break;

      default:
        console.log("Unhandled token type:", token.type);
    }
  }

  console.log(`[processTokens] Completed ${totalTokens} tokens, cache stats - mermaid: ${mermaidImageCache.size}, formula: ${formulaImageCache.size}`);
  return docxElements;
};

export const generateWordDocument = async (markdownText: string): Promise<Blob> => {
  // 清空缓存
  mermaidImageCache.clear();
  formulaImageCache.clear();

  // 1. 去除多余的缩进 (Smart Dedent)
  const lines = markdownText.split('\n');
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

  let dedentedText = markdownText;
  if (hasNonEmptyLine && minIndent > 0 && minIndent !== Infinity) {
    dedentedText = lines.map(line => {
      if (line.length >= minIndent) {
        return line.substring(minIndent);
      }
      return line;
    }).join('\n');
  }

  // 2. Normalize whitespace (preserve fences, collapse multiple spaces in prose)
  const normalizedMarkdown = dedentedText
    .split('\n')
    .map(line => {
      // Don't touch code fence markers
      if (line.trim().startsWith('```')) return line;
      // Normalize all other lines: replace multiple spaces/tabs/fullwidth spaces with single space
      return line.replace(/[ \t\u3000\u00A0]+/g, ' ');
    })
    .join('\n');

  // 使用 lexer 并在调用时传递选项，避免全局配置冲突
  const tokens = marked.lexer(normalizedMarkdown, {
    gfm: true,
    breaks: true
  });
  const docElements = await processTokens(tokens);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            },
            size: 22, // 11pt
            color: "374151"
          }
        }
      },
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            },
            size: 22, // 11pt
            color: "374151"
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 60, after: 60, line: 336 }
          }
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 32, // 16pt
            bold: true,
            color: COLORS.H1,
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 200, after: 100 },
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 28, // 14pt
            bold: true,
            color: COLORS.H2,
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 150, after: 75 },
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 24, // 12pt
            bold: true,
            color: COLORS.H3,
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 60 },
          },
        },
        {
          id: "Heading4",
          name: "Heading 4",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 22, // 11pt
            bold: true,
            color: "374151",
            font: {
              name: "Calibri",
              eastAsia: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 100, after: 50 },
          },
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720,
          },
        },
      },
      children: docElements,
    }],
  });

  return await Packer.toBlob(doc);
};
