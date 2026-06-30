export type RequestLogRoute = {
  id: string;
  method: string;
  path: string;
};

export type CompiledRequestLogRoute = RequestLogRoute & {
  pattern: RegExp;
};

export type RequestLogMeta = {
  method: string;
  path: string;
  route: string | null;
  routeId: string | null;
  statusCode: number;
  durationMs: number;
  requestId: string;
  contentLength: number | null;
  responseContentLength: number | null;
  userAgent: string | null;
  ipAddress: string | null;
};

export function buildRequestLogMeta(
  request: Request,
  options: {
    routes: readonly CompiledRequestLogRoute[];
    statusCode: number;
    durationMs: number;
    requestId: string;
    response?: Response;
  }
): RequestLogMeta {
  const url = new URL(request.url);
  const matchedRoute = matchRequestRoute(
    request.method,
    url.pathname,
    options.routes
  );

  return {
    method: request.method,
    path: url.pathname,
    route: matchedRoute?.path ?? null,
    routeId: matchedRoute?.id ?? null,
    statusCode: options.statusCode,
    durationMs: options.durationMs,
    requestId: options.requestId,
    contentLength: headerNumber(request.headers.get("content-length")),
    responseContentLength: headerNumber(
      options.response?.headers.get("content-length") ?? null
    ),
    userAgent: request.headers.get("user-agent"),
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip")
  };
}

export function matchRequestRoute(
  method: string,
  pathname: string,
  routes: readonly CompiledRequestLogRoute[]
) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(pathname);

  return routes.find(
    (route) =>
      route.method.toUpperCase() === normalizedMethod &&
      route.pattern.test(normalizedPath)
  );
}

export function compileRequestLogRoutes(
  routes: readonly RequestLogRoute[]
): CompiledRequestLogRoute[] {
  return routes.map((route) => ({
    ...route,
    pattern: routePathPattern(route.path)
  }));
}

function routePathPattern(path: string) {
  const pattern = normalizePath(path)
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        return "[^/]+";
      }

      return escapeRegExp(segment);
    })
    .join("/");

  return new RegExp(`^${pattern}$`);
}

function normalizePath(path: string) {
  if (path === "/") {
    return path;
  }

  return path.replace(/\/+$/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headerNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
