"use client";

import { Alert, Stack } from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

import { FileSubmissionsWorkspace } from "@/components/file-submissions/FileSubmissionsWorkspace";
import { FileImportStatusPanel } from "@/components/file-submissions/FileImportStatusPanel";
import { ExamImportStatusPanel } from "@/components/file-submissions/ExamImportStatusPanel";
import { ReceivedFilesPanel } from "@/components/file-submissions/ReceivedFilesPanel";

import { Pc08FinalResultsReceivedPanel } from "@/components/file-submissions/Pc08FinalResultsReceivedPanel";
import { Pc08FinalResultsWorkspace } from "@/components/examination-sessions/Pc08FinalResultsWorkspace";

import { IndependentExamWorkspace } from "@/components/independent-exams/IndependentExamWorkspace";
import { ExamSessionSecretaryWorkspace } from "@/components/examination-sessions/ExamSessionSecretaryWorkspace";

export default function RoleWorkspacePage() {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.role) {
    case "training_school":
      return (
        <Stack spacing={3}>
          {/* KQSH chính thức do PC08 gửi và SUPER_ADMIN phát hành */}
          <Pc08FinalResultsReceivedPanel />

          {/* BC2 và những file nhận theo nghiệp vụ cũ */}
          <ReceivedFilesPanel />

          <FileSubmissionsWorkspace />
          <FileImportStatusPanel />
        </Stack>
      );

    case "pc08_staff":
      return (
        <Stack spacing={3}>
          <ExamSessionSecretaryWorkspace />

          {/* Gửi KQSH cuối cùng theo từng CSĐT */}
          <Pc08FinalResultsWorkspace />

          {/* KQSH ban đầu do TTSH gửi cho IT PC08 */}
          <ReceivedFilesPanel />

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
      return (
        <Stack spacing={3}>
          <ExamSessionSecretaryWorkspace />
          <IndependentExamWorkspace />
        </Stack>
      );

    default:
      return <Alert severity="error">Tài khoản không có quyền truy cập.</Alert>;
  }
}
