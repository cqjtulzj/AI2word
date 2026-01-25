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
  AlignmentType
} from "docx";
import { marked } from "marked";

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
      runs.push(new TextRun({
        text: boldMatch[2], // The content inside tags
        ...baseOptions,
        bold: true
      }));
      return;
    }

    // Handle Normal Text
    runs.push(new TextRun({
      text: part,
      ...baseOptions
    }));
  });

  return runs;
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

const processTokens = (tokens: any[]): any[] => {
  const docxElements: any[] = [];

  tokens.forEach(token => {
    switch (token.type) {
      case 'heading':
        const level = token.depth;
        let headingLevel: any = HeadingLevel.HEADING_1;

        if (level === 2) { headingLevel = HeadingLevel.HEADING_2; }
        if (level === 3) { headingLevel = HeadingLevel.HEADING_3; }
        if (level >= 4) headingLevel = HeadingLevel.HEADING_4;

        docxElements.push(new Paragraph({
          text: token.text,
          heading: headingLevel,
          spacing: { before: 400, after: 200 },
          alignment: AlignmentType.LEFT,
          border: level === 1 ? { bottom: { color: "E5E7EB", space: 4, style: BorderStyle.SINGLE, size: 6 } } : undefined
        }));
        break;

      case 'paragraph':
        const runs = token.tokens ? processInlineTokens(token.tokens) : processTextWithHtml(token.text);
        docxElements.push(new Paragraph({
          children: runs,
          spacing: { before: 120, after: 120, line: 360 },
          alignment: AlignmentType.LEFT
        }));
        break;

      case 'list':
        token.items.forEach((item: any) => {
          const itemRuns = item.tokens ? processInlineTokens(item.tokens) : processTextWithHtml(item.text);
          docxElements.push(new Paragraph({
            children: itemRuns,
            bullet: { level: 0 },
            spacing: { before: 80, after: 80 },
            alignment: AlignmentType.LEFT
          }));
        });
        break;

      case 'code':
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
        break;

      case 'table':
        const tableRows: TableRow[] = [];

        // Header
        const headerCells = token.header.map((cell: any) => {
          const cellRuns = cell.tokens
            ? processInlineTokens(cell.tokens, { bold: true, size: 18 })
            : processTextWithHtml(cell.text, { bold: true, size: 18 });
          return new TableCell({
            children: [new Paragraph({
              children: cellRuns,
              spacing: { before: 40, after: 40, line: 240 }, // Tight spacing
              alignment: AlignmentType.LEFT
            })],
            shading: { fill: COLORS.TABLE_HEADER_BG, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            verticalAlign: "center",
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
              left: { style: BorderStyle.NONE, size: 0, color: "auto" },
              right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            }
          });
        });
        tableRows.push(new TableRow({ children: headerCells }));

        // Rows
        token.rows.forEach((row: any[], rowIndex: number) => {
          const cells = row.map((cell: any) => {
            const cellRuns = cell.tokens
              ? processInlineTokens(cell.tokens, { size: 18 })
              : processTextWithHtml(cell.text, { size: 18 });
            return new TableCell({
              children: [new Paragraph({
                children: cellRuns,
                spacing: { before: 40, after: 40, line: 240 }, // Tight spacing
                alignment: AlignmentType.LEFT
              })],
              shading: {
                fill: rowIndex % 2 === 0 ? COLORS.TABLE_ROW_ODD : COLORS.TABLE_ROW_EVEN,
                type: ShadingType.CLEAR
              },
              margins: { top: 80, bottom: 80, left: 80, right: 80 },
              verticalAlign: "center",
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.BORDER_COLOR },
                left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                right: { style: BorderStyle.NONE, size: 0, color: "auto" },
              }
            });
          });
          tableRows.push(new TableRow({ children: cells }));
        });

        docxElements.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
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
          spacing: { before: 200, after: 200 },
          alignment: AlignmentType.LEFT
        }));
        break;

      default:
        console.log("Unhandled token type:", token.type);
    }
  });

  return docxElements;
};

export const generateWordDocument = async (markdownText: string): Promise<Blob> => {
  // Configure marked to use GFM (GitHub Flavored Markdown)
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // 🔥 CRITICAL: Normalize whitespace at the source (before parsing)
  // This ensures marked.lexer works with normalized text from the start
  // We process line by line to avoid breaking code blocks
  const normalizedMarkdown = markdownText
    .split('\n')
    .map(line => {
      // Don't touch code fence markers
      if (line.trim().startsWith('```')) return line;
      // Normalize all other lines: replace multiple spaces/tabs/fullwidth spaces with single space
      return line.replace(/[ \t\u3000\u00A0]+/g, ' ');
    })
    .join('\n');

  const tokens = marked.lexer(normalizedMarkdown);
  const docElements = processTokens(tokens);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: {
              name: "Microsoft YaHei",
              hint: "eastAsia"  // 指定东亚字体
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
              name: "Microsoft YaHei",
              hint: "eastAsia"
            },
            size: 22, // 11pt
            color: "374151"
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 120, after: 120, line: 360 }
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
              name: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 400, after: 200 },
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
              name: "Microsoft YaHei",
              hint: "eastAsia"
            }
          },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { before: 300, after: 150 },
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
