import React from "react";

export function MarkdownText({ text = "" }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className="reader-copy">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/s);
        if (heading && !heading[2].includes("\n")) {
          const level = Math.min(4, heading[1].length + 1);
          const Tag = `h${level}`;
          return <Tag key={index}>{heading[2]}</Tag>;
        }
        if (/^[-*_]{3,}$/.test(trimmed)) return <hr key={index} />;
        return <p key={index}>{trimmed.split("\n").map((line, i) => <React.Fragment key={i}>{i > 0 && <br />}{line}</React.Fragment>)}</p>;
      })}
    </div>
  );
}
