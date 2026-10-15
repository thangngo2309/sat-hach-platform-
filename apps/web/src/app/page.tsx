"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { Box, CircularProgress } from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <CircularProgress />
    </Box>
  );
}
