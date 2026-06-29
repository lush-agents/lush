import { agentRoutes, agentTypes } from "@lush/agent/spec";
import { authzRoutes, authzTypes } from "@lush/authz/spec";
import { inferenceRoutes, inferenceTypes } from "@lush/inference/spec";

export const apiGroup = "/v1beta";
export const apiHealthPath = `${apiGroup}/health` as const;

type ServiceRoute =
  | (typeof authzRoutes)[number]
  | (typeof inferenceRoutes)[number]
  | (typeof agentRoutes)[number];

type ApiRouteWithGroup<Route extends ServiceRoute = ServiceRoute> =
  Route extends ServiceRoute
    ? Omit<Route, "path"> & {
        path: `${typeof apiGroup}${Route["path"]}`;
      }
    : never;

const serviceRoutes: ServiceRoute[] = [
  ...authzRoutes,
  ...inferenceRoutes,
  ...agentRoutes
] as ServiceRoute[];

const apiRoutes = serviceRoutes.map(withApiGroup) as ApiRouteWithGroup[];

export const apiSpec = {
  apiGroup,
  healthPath: apiHealthPath,
  types: `
${authzTypes}

${inferenceTypes}

${agentTypes}
`,
  routes: apiRoutes
} as const;

export type ApiRoute = (typeof apiSpec.routes)[number];

function withApiGroup<const Route extends ServiceRoute>(
  route: Route
): ApiRouteWithGroup<Route> {
  return {
    ...route,
    path: `${apiGroup}${route.path}` as `${typeof apiGroup}${Route["path"]}`
  } as unknown as ApiRouteWithGroup<Route>;
}
