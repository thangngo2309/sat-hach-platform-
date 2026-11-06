"use client";

import { Box, Divider, Typography } from "@mui/material";

export function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        width: "100%",
        mt: "auto",
        px: { xs: 2, sm: 3, lg: 4 },
        pb: 2,
      }}
    >
      <Divider sx={{ mb: 2 }} />

      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          maxWidth: 1600,
          mx: "auto",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} Hệ thống Quản lý sát hạch ô tô
        </Typography>

        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          Đơn vị phát triển:{" "}
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            Công ty TNHH Giải Pháp Công Nghệ Hoàng Ân
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
