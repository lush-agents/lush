import { createResource, Show } from "solid-js";
import { Shimmer } from "./Shimmer";

let rendererPromise:
  | Promise<typeof import("./markdown/renderMarkdown")>
  | undefined;

function loadRenderer() {
  rendererPromise ??= import("./markdown/renderMarkdown");
  return rendererPromise;
}

export function MarkdownStream(props: { source?: string }) {
  const [html] = createResource(
    () => props.source ?? "",
    async (source) => {
      if (!source) {
        return "";
      }

      const renderer = await loadRenderer();
      return renderer.renderMarkdown(source);
    }
  );

  return (
    <Show when={props.source} fallback={<Shimmer>Thinking...</Shimmer>}>
      <Show
        when={html()}
        fallback={
          <div class="lush-markdown whitespace-pre-wrap">{props.source}</div>
        }
      >
        {(renderedHtml) => (
          <div class="lush-markdown" innerHTML={renderedHtml()} />
        )}
      </Show>
    </Show>
  );
}
