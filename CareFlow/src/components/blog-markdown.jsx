import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components = {
  // The article title is already the page's h1.
  h1: ({ children }) => <h2>{children}</h2>,
  img: ({ src, alt }) => <img src={src} alt={alt || ''} loading="lazy" />,
  table: ({ children }) => <div role="region" aria-label="جدول المقال" tabIndex={0} style={{ overflowX: 'auto' }}><table>{children}</table></div>,
};

export default function BlogMarkdown({ children }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{children}</Markdown>;
}
