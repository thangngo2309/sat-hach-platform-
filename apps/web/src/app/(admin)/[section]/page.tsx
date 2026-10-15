"use client";

import { useParams, useRouter } from "next/navigation";

import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from "@mui/material";

import { ArrowBackOutlined, ConstructionOutlined } from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

const sections: Record<
  string,
  {
    title: string;
    description: string;
  }
> = {
  schools: {
    title: "Trường đào tạo",
    description: "Quản lý các cơ sở đào tạo lái xe.",
  },
  courses: {
    title: "Khóa học",
    description: "Danh sách khóa đào tạo và thông tin học viên.",
  },
  students: {
    title: "Học viên",
    description: "Tra cứu hồ sơ học viên theo trường và khóa.",
  },
  exams: {
    title: "Kỳ sát hạch",
    description: "Quản lý danh sách và lịch sát hạch.",
  },
  reports: {
    title: "Báo cáo thống kê",
    description: "Báo cáo kết quả thi đạt, rớt và vắng.",
  },
  imports: {
    title: "Import XML",
    description: "Nhập danh sách học viên từ file BC1.",
  },
  "import-history": {
    title: "Lịch sử import",
    description: "Theo dõi các file đã nhập vào hệ thống.",
  },
  users: {
    title: "Quản lý tài khoản",
    description: "Quản lý người dùng và phân quyền.",
  },
  settings: {
    title: "Cài đặt",
    description: "Thiết lập cấu hình hệ thống.",
  },
};

export default function SectionPage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const data = sections[section];

  if (!data) {
    return <Typography color="error">Chức năng không tồn tại.</Typography>;
  }

  if (["users", "settings"].includes(section) && user?.role !== "super_admin") {
    return (
      <Typography color="error">
        Bạn không có quyền truy cập chức năng này.
      </Typography>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          {data.title}
        </Typography>

        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {data.description}
        </Typography>
      </Box>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          borderColor: "#e2e8f0",
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 6 } }}>
          <Stack spacing={2} sx={{ alignItems: "center", textAlign: "center" }}>
            <Box
              sx={{
                width: 72,
                height: 72,
                display: "grid",
                placeItems: "center",
                borderRadius: 3,
                bgcolor: "#edf5fd",
                color: "#225c94",
              }}
            >
              <ConstructionOutlined sx={{ fontSize: 36 }} />
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Chức năng đang được phát triển
            </Typography>

            <Typography color="text.secondary">
              Phân hệ {data.title.toLowerCase()} sẽ được tích hợp trong giai
              đoạn tiếp theo.
            </Typography>

            <Button
              variant="outlined"
              startIcon={<ArrowBackOutlined />}
              onClick={() => router.push("/dashboard")}
              sx={{ textTransform: "none" }}
            >
              Về tổng quan
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
