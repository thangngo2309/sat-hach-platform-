"use client";

import { useMemo, type ReactNode } from "react";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";

export function MuiFontProvider({
  children,
  fontFamily,
}: {
  children: ReactNode;
  fontFamily: string;
}) {
  const theme = useMemo(
    () =>
      createTheme({
        typography: {
          fontFamily: `${fontFamily}, Arial, sans-serif`,
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              html: {
                fontFamily: `${fontFamily}, Arial, sans-serif`,
              },
              body: {
                fontFamily: `${fontFamily}, Arial, sans-serif`,
              },
              "button, input, textarea, select": {
                fontFamily: "inherit",
              },
            },
          },
        },
      }),
    [fontFamily]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
