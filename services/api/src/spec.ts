import { agentRoutes, agentTypes } from "@lush/agent/spec";
import { inferenceRoutes, inferenceTypes } from "@lush/inference/spec";

export const apiSpec = {
  types: `
export type CreateDevSessionRequest = {
  displayName: string;
  handle: string;
  organizationName: string;
};

export type DevSession = {
  token: string;
  user: {
    id: string;
    displayName: string;
    handle: string;
  };
  organization: {
    id: string;
    name: string;
  };
  createdAt: string;
};

${inferenceTypes}

${agentTypes}
`,
  routes: [
    {
      id: "createDevSession",
      method: "POST",
      path: "/auth/dev-session",
      requestType: "CreateDevSessionRequest",
      responseType: "DevSession",
      auth: false,
      kind: "json"
    },
    {
      id: "fetchSession",
      method: "GET",
      path: "/session",
      responseType: "Omit<DevSession, \"token\">",
      auth: true,
      kind: "json"
    },
    ...inferenceRoutes,
    ...agentRoutes
  ]
} as const;

export type ApiRoute = (typeof apiSpec.routes)[number];
