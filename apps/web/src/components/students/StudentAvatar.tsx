"use client";

import { useEffect, useState } from "react";
import { Avatar, Box, CircularProgress } from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/auth";

type StudentAvatarProps = {
  studentId: number;
  fullName: string;
  size?: number;
  refreshKey?: string | number;
};

export function StudentAvatar({
  studentId,
  fullName,
  size = 44,
  refreshKey,
}: StudentAvatarProps) {
  const { accessToken } = useAuth();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !studentId) {
      setImageUrl(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    setLoading(true);
    setImageUrl(null);

    void fetch(`${API_URL}/students/${studentId}/photo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Không có ảnh học viên.");
        }

        const contentType = response.headers.get("content-type");

        if (contentType !== "image/jpeg" && contentType !== "image/png") {
          throw new Error("Định dạng ảnh không hợp lệ.");
        }

        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setImageUrl(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, studentId, refreshKey]);

  return (
    <Box sx={{ position: "relative", width: size, height: size }}>
      <Avatar
        src={imageUrl ?? undefined}
        alt={fullName}
        sx={{
          width: size,
          height: size,
          fontSize: Math.max(13, size * 0.35),
          bgcolor: "#dce6ef",
          color: "#375574",
        }}
        slotProps={{
          img: {
            referrerPolicy: "no-referrer",
          },
        }}
      >
        {fullName.trim().charAt(0).toUpperCase() || "?"}
      </Avatar>

      {loading && (
        <CircularProgress
          size={16}
          sx={{
            position: "absolute",
            bottom: -2,
            right: -2,
          }}
        />
      )}
    </Box>
  );
}
