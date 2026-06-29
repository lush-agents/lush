declare module "*.md" {
  const content: string;
  export default content;
}

declare const Bun: {
  serve(options: {
    port: number;
    hostname: string;
    fetch(request: Request): Response | Promise<Response>;
  }): {
    hostname: string;
    port: number;
  };
};
