"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { ReactNode, useMemo } from "react";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#0050B3",
    },
    secondary: {
      main: "#00897B",
    },
    background: {
      default: "#0F172A",
      paper: "#111827",
    },
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  },
});

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const memoTheme = useMemo(() => theme, []);

  return (
    <ThemeProvider theme={memoTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};
