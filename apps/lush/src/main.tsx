import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { App } from "./App";
import {
  accountRoutes,
  routes,
  settingsRoutes,
  type AppRouteInfo
} from "./lib/app-data";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

const routeInfo = (info: AppRouteInfo) => info;

render(
  () => (
    <Router root={App}>
      <Route path="/" info={routeInfo({ kind: "appBase" })} />
      <Route
        path="/sign-in"
        info={routeInfo({ kind: "auth", mode: "login" })}
      />
      <Route
        path="/register"
        info={routeInfo({ kind: "auth", mode: "register" })}
      />
      <Route
        path="/organizations/new"
        info={routeInfo({ kind: "createOrganization" })}
      />
      <Route path="/concepts" info={routeInfo({ kind: "conceptsIndex" })} />
      <Route
        path="/concepts/:slug"
        info={routeInfo({ kind: "conceptDetail" })}
      />
      <Route
        path="/settings/personal"
        info={routeInfo({ kind: "settings", href: "/settings/personal" })}
      />
      {settingsRoutes.map((route) => (
        <Route
          path={route.href}
          info={routeInfo({ kind: "settings", href: route.href })}
        />
      ))}
      {accountRoutes
        .filter(
          (route) =>
            !settingsRoutes.some(
              (settingsRoute) => settingsRoute.href === route.href
            )
        )
        .map((route) => (
          <Route
            path={route.href}
            info={routeInfo({ kind: "account", href: route.href })}
          />
        ))}
      {routes.map((route) => (
        <Route
          path={route.href}
          info={routeInfo({ kind: "workspace", href: route.href })}
        />
      ))}
      {routes.map((route) => (
        <Route
          path={`${route.href}/sessions/:sessionId`}
          info={routeInfo({ kind: "workspaceSession", href: route.href })}
        />
      ))}
    </Router>
  ),
  root
);
