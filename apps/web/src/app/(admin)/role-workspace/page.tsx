"use client";

import { Alert, Stack } from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

import { FileSubmissionsWorkspace } from "@/components/file-submissions/FileSubmissionsWorkspace";
import { FileImportStatusPanel } from "@/components/file-submissions/FileImportStatusPanel";
import { ExamImportStatusPanel } from "@/components/file-submissions/ExamImportStatusPanel";
import { ReceivedFilesPanel } from "@/components/file-submissions/ReceivedFilesPanel";

import { IndependentExamWorkspace } from "@/components/independent-exams/IndependentExamWorkspace";

export default function RoleWorkspacePage() {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.role) {
    case "training_school":
      return (
        <Stack spacing={3}>
          <ReceivedFilesPanel />
          <FileSubmissionsWorkspace />
          <FileImportStatusPanel />
        </Stack>
      );

    case "pc08_staff":
      return (
        <Stack spacing={3}>
          <FileSubmissionsWorkspace />
          <ExamImportStatusPanel />
        </Stack>
      );

    case "exam_center":
      return (
        <Stack spacing={3}>
          <ReceivedFilesPanel />
          <FileSubmissionsWorkspace />
          <ExamImportStatusPanel />
        </Stack>
      );

    case "exam_secretary":
      return <IndependentExamWorkspace />;

    default:
      return <Alert severity="error">Tài khoản không có quyền truy cập.</Alert>;
  }
}
