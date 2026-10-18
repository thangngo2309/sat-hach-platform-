"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  AppBar,
  Avatar,
  Box,
  CircularProgress,
  Collapse,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import {
  AssessmentOutlined,
  DashboardOutlined,
  DescriptionOutlined,
  DirectionsCarOutlined,
  DriveFolderUploadOutlined,
  EmojiEventsOutlined,
  ExpandLess,
  ExpandMore,
  GroupsOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuOutlined,
  PeopleOutlineOutlined,
  SchoolOutlined,
  SettingsOutlined,
} from "@mui/icons-material";

import type { SvgIconComponent } from "@mui/icons-material";
import { useAuth } from "@/components/auth/AuthProvider";

const DRAWER_WIDTH = 260;
const COLLAPSED_WIDTH = 76;

type MenuEntry = {
  label: string;
  href: string;
  icon: SvgIconComponent;
  superAdminOnly?: boolean;
};

const mainItems: MenuEntry[] = [
  {
    label: "Tổng quan",
    href: "/dashboard",
    icon: DashboardOutlined,
  },
  {
    label: "Trường đào tạo",
    href: "/schools",
    icon: SchoolOutlined,
  },
  {
    label: "Trung tâm sát hạch",
    href: "/examination-centers",
    icon: DirectionsCarOutlined,
  },
  {
    label: "Khóa học",
    href: "/courses",
    icon: DescriptionOutlined,
  },
  {
    label: "Học viên",
    href: "/students",
    icon: GroupsOutlined,
  },
  {
    label: "Kỳ sát hạch",
    href: "/exams",
    icon: DirectionsCarOutlined,
  },
  {
    label: "Báo cáo thống kê",
    href: "/reports",
    icon: AssessmentOutlined,
  },
];

const importItems: MenuEntry[] = [
  {
    label: "Import BC1",
    href: "/imports",
    icon: DriveFolderUploadOutlined,
  },
  {
    label: "Import BC2",
    href: "/imports/bc2",
    icon: DriveFolderUploadOutlined,
  },
  {
    label: "Import danh sách dự thi (48_)",
    href: "/imports/exam-list",
    icon: DriveFolderUploadOutlined,
  },
  {
    label: "Import kết quả sát hạch (KQSH)",
    href: "/imports/exam-result",
    icon: DriveFolderUploadOutlined,
  },
  {
    label: "Lịch sử BC1",
    href: "/import-history",
    icon: HistoryOutlined,
  },
  {
    label: "Lịch sử BC2",
    href: "/imports/bc2/history",
    icon: HistoryOutlined,
  },
];

const systemItems: MenuEntry[] = [
  {
    label: "Quản lý tài khoản",
    href: "/users",
    icon: PeopleOutlineOutlined,
    superAdminOnly: true,
  },
  {
    label: "Cài đặt",
    href: "/settings",
    icon: SettingsOutlined,
    superAdminOnly: true,
  },
];

const allItems = [...mainItems, ...importItems, ...systemItems];

function isRouteSelected(pathname: string, href: string) {
  return pathname === href;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const { user, loading, signOut } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [importExpanded, setImportExpanded] = useState(true);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const isSuperAdmin = user?.role === "super_admin";
  const drawerWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  const currentItem =
    allItems.find((item) => isRouteSelected(pathname, item.href)) ?? null;

  const pageTitle = currentItem?.label ?? "Quản lý sát hạch";

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navigate = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    setMenuAnchor(null);

    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };

  const renderEntry = (item: MenuEntry, compact: boolean) => {
    if (item.superAdminOnly && !isSuperAdmin) return null;

    const Icon = item.icon;
    const selected = isRouteSelected(pathname, item.href);

    const entry = (
      <ListItemButton
        key={item.href}
        selected={selected}
        onClick={() => navigate(item.href)}
        sx={{
          minHeight: 44,
          mx: 1,
          my: 0.35,
          px: 2,
          borderRadius: 2,
          justifyContent: compact ? "center" : "initial",
          color: selected ? "#fff" : "#aebed2",
          "&.Mui-selected": {
            bgcolor: "#244c78",
            color: "#fff",
          },
          "&.Mui-selected:hover": {
            bgcolor: "#315d8c",
          },
          "&:hover": {
            bgcolor: "#193b60",
            color: "#fff",
          },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: compact ? 0 : 40,
            justifyContent: "center",
            color: "inherit",
          }}
        >
          <Icon fontSize="small" />
        </ListItemIcon>

        {!compact && (
          <ListItemText
            primary={item.label}
            slotProps={{
              primary: {
                sx: {
                  fontSize: 14,
                  fontWeight: selected ? 700 : 500,
                },
              },
            }}
          />
        )}
      </ListItemButton>
    );

    return compact ? (
      <Tooltip key={item.href} title={item.label} placement="right">
        {entry}
      </Tooltip>
    ) : (
      entry
    );
  };

  const renderSectionTitle = (title: string, compact: boolean) =>
    compact ? (
      <Divider
        sx={{
          mx: 2,
          my: 1.5,
          borderColor: "#2a4464",
        }}
      />
    ) : (
      <Typography
        variant="overline"
        sx={{
          display: "block",
          px: 3,
          pt: 2,
          pb: 0.5,
          color: "#8199b5",
          fontSize: 10,
          letterSpacing: "0.12em",
          fontWeight: 700,
        }}
      >
        {title}
      </Typography>
    );

  const renderDrawer = (compact: boolean) => (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        bgcolor: "#102943",
        color: "#fff",
        overflowX: "hidden",
      }}
    >
      <Box
        sx={{
          minHeight: 74,
          px: compact ? 1 : 2.5,
          display: "flex",
          alignItems: "center",
          justifyContent: compact ? "center" : "flex-start",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 2,
              bgcolor: "#2e689b",
              display: "grid",
              placeItems: "center",
            }}
          >
            <DirectionsCarOutlined />
          </Box>

          {!compact && (
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: 15, fontWeight: 800 }}>
                SÁT HẠCH Ô TÔ
              </Typography>
              <Typography noWrap sx={{ fontSize: 11, color: "#9eb6cf" }}>
                Hệ thống quản lý
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Divider sx={{ borderColor: "#2a4464" }} />

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          py: 1,
          "&::-webkit-scrollbar": { width: 5 },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "#3a5676",
            borderRadius: 2,
          },
        }}
      >
        {renderSectionTitle("QUẢN LÝ", compact)}

        <List disablePadding>
          {mainItems.map((item) => renderEntry(item, compact))}
        </List>

        {renderSectionTitle("DỮ LIỆU XML", compact)}

        {compact ? (
          <List disablePadding>
            {importItems.map((item) => renderEntry(item, true))}
          </List>
        ) : (
          <>
            <ListItemButton
              onClick={() => setImportExpanded((value) => !value)}
              sx={{
                mx: 1,
                borderRadius: 2,
                minHeight: 42,
                color: "#aebed2",
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>
                <DriveFolderUploadOutlined fontSize="small" />
              </ListItemIcon>

              <ListItemText
                primary="Quản lý import"
                slotProps={{
                  primary: {
                    sx: { fontSize: 14, fontWeight: 600 },
                  },
                }}
              />

              {importExpanded ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>

            <Collapse in={importExpanded} timeout="auto">
              <List disablePadding>
                {importItems.map((item) => renderEntry(item, false))}
              </List>
            </Collapse>
          </>
        )}

        {isSuperAdmin && (
          <>
            {renderSectionTitle("HỆ THỐNG", compact)}
            <List disablePadding>
              {systemItems.map((item) => renderEntry(item, compact))}
            </List>
          </>
        )}
      </Box>

      <Divider sx={{ borderColor: "#2a4464" }} />

      <Box sx={{ p: compact ? 1.5 : 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: compact ? "center" : "flex-start",
            gap: 1.5,
          }}
        >
          <Avatar
            sx={{
              bgcolor: "#376a9c",
              width: 36,
              height: 36,
              fontSize: 15,
            }}
          >
            {user?.fullName?.charAt(0)?.toUpperCase() ?? "U"}
          </Avatar>

          {!compact && (
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                noWrap
                sx={{ color: "#fff", fontSize: 13, fontWeight: 700 }}
              >
                {user?.fullName ?? ""}
              </Typography>
              <Typography noWrap sx={{ color: "#9eb6cf", fontSize: 11 }}>
                @{user?.username ?? ""}
              </Typography>
            </Box>
          )}

          {!compact && (
            <Tooltip title="Đăng xuất">
              <IconButton
                size="small"
                onClick={() => void handleLogout()}
                sx={{ color: "#aebed2" }}
              >
                <LogoutOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>
    </Box>
  );

  if (loading || !user) {
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
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <CssBaseline />

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: "#fff",
          color: "#19324f",
          borderBottom: "1px solid #e5eaf0",
          width: {
            xs: "100%",
            md: `calc(100% - ${drawerWidth}px)`,
          },
          ml: { md: `${drawerWidth}px` },
          transition: theme.transitions.create(["width", "margin"], {
            duration: 200,
          }),
        }}
      >
        <Toolbar sx={{ minHeight: "68px !important", gap: 1 }}>
          {isMobile ? (
            <IconButton onClick={() => setMobileOpen(true)}>
              <MenuOutlined />
            </IconButton>
          ) : (
            <IconButton onClick={() => setCollapsed((value) => !value)}>
              <MenuOutlined />
            </IconButton>
          )}

          <Typography noWrap sx={{ fontWeight: 700, flex: 1, fontSize: 17 }}>
            {pageTitle}
          </Typography>

          <Tooltip title="Tài khoản">
            <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)}>
              <Avatar
                sx={{
                  bgcolor: "#174879",
                  width: 36,
                  height: 36,
                }}
              >
                {user.fullName?.charAt(0)?.toUpperCase() ?? "U"}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <Box sx={{ px: 2, py: 1, minWidth: 190 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                {user.fullName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                @{user.username}
              </Typography>
            </Box>

            <Divider />

            <MenuItem onClick={() => void handleLogout()}>
              <LogoutOutlined sx={{ mr: 1.5 }} fontSize="small" />
              Đăng xuất
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            border: 0,
          },
        }}
      >
        {renderDrawer(false)}
      </Drawer>

      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: "none", md: "block" },
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            border: 0,
            boxSizing: "border-box",
            transition: theme.transitions.create("width", {
              duration: 200,
            }),
          },
        }}
      >
        {renderDrawer(collapsed)}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: {
            md: `calc(100% - ${drawerWidth}px)`,
          },
          minHeight: "100vh",
          bgcolor: "#f5f7fb",
          pt: "68px",
          transition: theme.transitions.create("width", {
            duration: 200,
          }),
        }}
      >
        <Box
          sx={{
            p: { xs: 2, sm: 3, lg: 4 },
            maxWidth: 1600,
            mx: "auto",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
