"use client";

import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

import {
  AssessmentOutlined,
  CheckCircleOutlineOutlined,
  GroupsOutlined,
  SchoolOutlined,
  UploadFileOutlined,
} from "@mui/icons-material";

import { useAuth } from "@/components/auth/AuthProvider";

const features = [
  {
    name: "Trường đào tạo",
    description: "Danh sách các cơ sở đào tạo lái xe.",
    icon: SchoolOutlined,
  },
  {
    name: "Học viên",
    description: "Quản lý học viên theo từng khóa.",
    icon: GroupsOutlined,
  },
  {
    name: "Import XML",
    description: "Nhập dữ liệu học viên từ báo cáo BC1.",
    icon: UploadFileOutlined,
  },
  {
    name: "Kết quả sát hạch",
    description: "Thống kê kết quả sát hạch theo khóa.",
    icon: AssessmentOutlined,
  },
];

export function DashboardContent() {
  const { user } = useAuth();

  return (
    <Stack spacing={3}>
      <Box>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            fontSize: { xs: 21, md: 26 },
          }}
        >
          Xin chào, {user?.fullName}!
        </Typography>

        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Chào mừng bạn đến với hệ thống quản lý sát hạch lái xe.
        </Typography>
      </Box>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          bgcolor: "#edf5fd",
          borderColor: "#cfe1f4",
        }}
      >
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <CheckCircleOutlineOutlined
              sx={{ color: "#2563a6", fontSize: 30 }}
            />

            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                Hệ thống quản trị đã sẵn sàng
              </Typography>

              <Typography variant="body2" color="text.secondary">
                Tài khoản đăng nhập đã được xác thực. Các chức năng import và
                thống kê sẽ được bổ sung theo từng giai đoạn.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        Các phân hệ quản lý
      </Typography>

      <Grid container spacing={2.5}>
        {features.map((item) => {
          const Icon = item.icon;

          return (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={item.name}>
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  height: "100%",
                  borderColor: "#e2e8f0",
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Box
                      sx={{
                        display: "grid",
                        placeItems: "center",
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        color: "#225c94",
                        bgcolor: "#edf5fd",
                      }}
                    >
                      <Icon />
                    </Box>

                    <Typography sx={{ fontWeight: 700 }}>
                      {item.name}
                    </Typography>

                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>

                    <Chip
                      label="Đang phát triển"
                      size="small"
                      sx={{
                        alignSelf: "flex-start",
                        bgcolor: "#f1f5f9",
                      }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
