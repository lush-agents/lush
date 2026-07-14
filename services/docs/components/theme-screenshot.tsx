"use client";

import { useEffect, useState } from "react";

interface ThemeScreenshotProps {
  lightSrc: string;
  darkSrc: string;
  alt: string;
}

export function ThemeScreenshot({ lightSrc, darkSrc, alt }: ThemeScreenshotProps) {
  const [theme, setTheme] = useState<"light" | "dark">();

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(root.classList.contains("dark") ? "dark" : "light");
    };
    const observer = new MutationObserver(syncTheme);

    syncTheme();
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  const src = theme === "dark" ? darkSrc : theme === "light" ? lightSrc : undefined;

  return (
    <div
      style={{
        aspectRatio: "2624 / 1824",
        margin: "0 auto",
        width: "min(100%, 720px)",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{ display: "block", height: "auto", width: "100%" }}
        />
      ) : null}
    </div>
  );
}
