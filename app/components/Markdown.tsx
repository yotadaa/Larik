import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function stripFirstHeading(source: string) {
  return source.replace(/^\s*#\s+[^\n]+\n+/, "");
}

export function Markdown({ source, stripHeading = false }: { source: string; stripHeading?: boolean }) {
  const content = stripHeading ? stripFirstHeading(source) : source;
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
