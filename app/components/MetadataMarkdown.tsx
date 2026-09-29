import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link } from "react-router";
import { prepareMetadataMarkdown } from "~/lib/metadata-markdown";

type MetadataMarkdownProps = {
  source: string;
  novelId?: string;
  variant?: "block" | "compact" | "inline";
  className?: string;
};

export function MetadataMarkdown({ source, novelId, variant = "block", className = "" }: MetadataMarkdownProps) {
  const content = prepareMetadataMarkdown(source, novelId).trim();
  if (!content) return null;
  const classes = ["metadata-markdown", `metadata-markdown--${variant}`, className].filter(Boolean).join(" ");
  const Wrapper = variant === "inline" ? "span" : "div";

  return <Wrapper className={classes}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => variant === "inline" ? <span>{children}</span> : <p>{children}</p>,
        a: ({ href = "", children }) => href.startsWith("/")
          ? <Link to={href}>{children}</Link>
          : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      }}
    >{content}</ReactMarkdown>
  </Wrapper>;
}
