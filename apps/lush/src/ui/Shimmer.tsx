export function Shimmer(props: { children: string; class?: string }) {
  return (
    <span class={`lush-shimmer inline-block ${props.class ?? ""}`}>
      {props.children}
    </span>
  );
}
