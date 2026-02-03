import mermaid from 'mermaid';
import html2canvas from 'html2canvas';

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Microsoft YaHei, sans-serif',
});

/**
 * 将 Mermaid 代码渲染为 PNG 图片的 Base64 数据
 * 返回包含 base64、宽度和高度的对象
 */
export const renderMermaidToImage = async (code: string): Promise<{ base64: string; width: number; height: number } | null> => {
  try {
    // 生成唯一的 ID
    const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`;

    // 使用 mermaid.render 生成 SVG
    const { svg } = await mermaid.render(id, code);

    // 创建一个临时的 div 来渲染 SVG
    const container = document.createElement('div');
    container.innerHTML = svg;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = 'auto';
    container.style.height = 'auto';
    document.body.appendChild(container);

    // 获取 SVG 元素
    const svgElement = container.querySelector('svg');
    if (!svgElement) {
      document.body.removeChild(container);
      return null;
    }

    // 设置 SVG 样式以确保正确渲染
    svgElement.style.width = '100%';
    svgElement.style.height = '100%';

    // 等待一小段时间确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 获取实际尺寸
    const rect = svgElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // 转换为 PNG，使用更高的 scale 提高清晰度
    const canvas = await html2canvas(container, {
      backgroundColor: '#ffffff',
      scale: 4,
      logging: false,
      useCORS: true,
      allowTaint: true
    });

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    document.body.removeChild(container);

    // 返回 base64 数据（去掉 data:image/png;base64, 前缀）和尺寸
    return {
      base64: dataUrl.split(',')[1],
      width,
      height
    };
  } catch (error) {
    console.error('Failed to render mermaid diagram:', error);
    return null;
  }
};

/**
 * 检查文本是否包含 Mermaid 代码块
 */
export const hasMermaidCodeBlock = (text: string): boolean => {
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
  return mermaidRegex.test(text);
};

/**
 * 提取所有 Mermaid 代码块
 */
export const extractMermaidBlocks = (text: string): Array<{ fullMatch: string; code: string }> => {
  const blocks: Array<{ fullMatch: string; code: string }> = [];
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = mermaidRegex.exec(text)) !== null) {
    blocks.push({
      fullMatch: match[0],
      code: match[1].trim(),
    });
  }

  return blocks;
};
