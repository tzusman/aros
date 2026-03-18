import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Deliverable } from "@/lib/api/types";

export function ContentArea({
  deliverable,
  fileContent,
}: {
  deliverable: Deliverable;
  fileContent?: string | null;
}) {
  const content = fileContent ?? deliverable.content;

  return (
    <ScrollArea className="flex-1">
      <div className="px-5 py-4 max-w-content mx-auto">
        <article className="prose prose-sm dark:prose-invert prose-headings:text-text-primary prose-p:text-text-secondary prose-p:leading-relaxed max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </ScrollArea>
  );
}
