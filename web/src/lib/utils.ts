import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusText(status: string): string {
  switch (status) {
    case 'ok':
      return '成功';
    case 'error':
      return '失败';
    case 'started':
      return '处理中';
    default:
      return status;
  }
}

export function getProtocolText(protocol: string): string {
  switch (protocol) {
    case 'anthropic':
      return 'Anthropic 兼容';
    case 'openai':
      return 'OpenAI 兼容';
    default:
      return protocol;
  }
}

export function getShimStyleText(style: string): string {
  switch (style) {
    case 'private_v1':
      return '差异化样式';
    case 'legacy':
      return '旧样式';
    default:
      return style;
  }
}
