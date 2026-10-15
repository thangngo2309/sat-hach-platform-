"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  AdminPanelSettingsOutlined,
  DirectionsCarFilledOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

export default function LoginPage() {
  const router = useRouter();

  const { user, loading, signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setSubmitting(true);

    try {
      await signIn(username, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Đăng nhập thất bại. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || user) {
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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        background:
          "linear-gradient(135deg, #0f2744 0%, #173f69 52%, #eff5fb 52%, #f8fafc 100%)",
        py: 5,
      }}
    >
      <Container maxWidth="sm">
        <Stack spacing={3} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              color: "#fff",
              width: "100%",
              maxWidth: 440,
            }}
          >
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 3,
                bgcolor: "#fff",
                color: "#174879",
                display: "grid",
                placeItems: "center",
              }}
            >
              <DirectionsCarFilledOutlined sx={{ fontSize: 32 }} />
            </Box>

            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Quản lý sát hạch
              </Typography>

              <Typography variant="body2" sx={{ color: "#dbe9f8" }}>
                Hệ thống quản lý đào tạo và sát hạch lái xe
              </Typography>
            </Box>
          </Box>

          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 440,
              p: { xs: 3, sm: 4 },
              borderRadius: 4,
              border: "1px solid #e2e8f0",
              boxShadow: "0 22px 65px rgba(15,23,42,0.16)",
            }}
          >
            <Stack spacing={3}>
              <Box>
                <AdminPanelSettingsOutlined
                  sx={{
                    color: "#174879",
                    fontSize: 34,
                    mb: 1,
                  }}
                />

                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  Đăng nhập
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  Sử dụng tài khoản được cấp để truy cập hệ thống.
                </Typography>
              </Box>

              {error && <Alert severity="error">{error}</Alert>}

              <Box component="form" onSubmit={onSubmit}>
                <Stack spacing={2.5}>
                  <TextField
                    label="Tên đăng nhập"
                    fullWidth
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={submitting}
                  />

                  <TextField
                    label="Mật khẩu"
                    fullWidth
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={submitting}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((value) => !value)}
                              edge="end"
                              aria-label={
                                showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                              }
                            >
                              {showPassword ? (
                                <VisibilityOffOutlined />
                              ) : (
                                <VisibilityOutlined />
                              )}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={submitting}
                    sx={{
                      py: 1.5,
                      bgcolor: "#174879",
                      fontWeight: 700,
                      borderRadius: 2,
                      textTransform: "none",
                    }}
                  >
                    {submitting ? (
                      <CircularProgress size={24} color="inherit" />
                    ) : (
                      "Đăng nhập"
                    )}
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Typography
            variant="caption"
            sx={{
              color: "#64748b",
              textAlign: "center",
            }}
          >
            Quản lý sát hạch lái xe © 2026
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
