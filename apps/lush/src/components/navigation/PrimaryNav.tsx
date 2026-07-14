import { routes } from "../../lib/app-data";
import { NavLink } from "react-router-dom";

export function PrimaryNav() {
  return (
    <>
      {routes.map((route) => (
        <NavLink
          key={route.href}
          to={route.href}
          className={({ isActive }) => `block rounded-md px-3 py-1.5 text-[0.625rem] font-medium transition ${
            isActive
              ? "bg-[var(--color-brand-strong)] text-white"
              : "text-[var(--color-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
          }`}
        >
          {route.label}
        </NavLink>
      ))}
    </>
  );
}
