"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  MenuItem,
  TextField,
} from "@mui/material";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  getProvinces,
  getWards,
  type AdministrativeProvince,
  type AdministrativeWard,
} from "@/lib/administrative-divisions";

type Props = {
  provinceCode: string;
  wardCode: string;
  onChange: (value: {
    provinceCode: string;
    provinceName: string;
    wardCode: string;
    wardName: string;
  }) => void;
  disabled?: boolean;
  required?: boolean;
};

export function AdministrativeDivisionSelect({
  provinceCode,
  wardCode,
  onChange,
  disabled = false,
  required = false,
}: Props) {
  const { accessToken } = useAuth();

  const [provinces, setProvinces] = useState<AdministrativeProvince[]>([]);

  const [wards, setWards] = useState<AdministrativeWard[]>([]);

  const [loadingProvinces, setLoadingProvinces] = useState(false);

  const [loadingWards, setLoadingWards] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;

    let active = true;

    setLoadingProvinces(true);

    void getProvinces(accessToken)
      .then((data) => {
        if (active) setProvinces(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Không thể tải tỉnh/thành phố."
          );
        }
      })
      .finally(() => {
        if (active) setLoadingProvinces(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !provinceCode) {
      setWards([]);
      return;
    }

    let active = true;

    setLoadingWards(true);

    void getWards(accessToken, provinceCode)
      .then((data) => {
        if (active) setWards(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Không thể tải xã/phường."
          );
        }
      })
      .finally(() => {
        if (active) setLoadingWards(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, provinceCode]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
        },
        gap: 2,
      }}
    >
      <TextField
        select
        fullWidth
        size="small"
        required={required}
        label="Tỉnh/Thành phố"
        value={provinceCode}
        disabled={disabled || loadingProvinces}
        onChange={(event) => {
          const selected = provinces.find(
            (item) => item.code === event.target.value
          );

          onChange({
            provinceCode: selected?.code ?? "",
            provinceName: selected?.name ?? "",
            wardCode: "",
            wardName: "",
          });
        }}
      >
        <MenuItem value="">Chọn tỉnh/thành phố</MenuItem>

        {provinces.map((item) => (
          <MenuItem key={item.code} value={item.code}>
            {item.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        select
        fullWidth
        size="small"
        required={required}
        label="Xã/Phường"
        value={wards.some((item) => item.code === wardCode) ? wardCode : ""}
        disabled={disabled || !provinceCode || loadingWards}
        onChange={(event) => {
          const selected = wards.find(
            (item) => item.code === event.target.value
          );

          const province = provinces.find((item) => item.code === provinceCode);

          onChange({
            provinceCode,
            provinceName: province?.name ?? "",
            wardCode: selected?.code ?? "",
            wardName: selected?.name ?? "",
          });
        }}
      >
        <MenuItem value="">Chọn xã/phường</MenuItem>

        {wards.map((item) => (
          <MenuItem key={item.code} value={item.code}>
            {item.name}
          </MenuItem>
        ))}
      </TextField>

      {(loadingProvinces || loadingWards) && <CircularProgress size={18} />}

      {error && (
        <Box sx={{ gridColumn: "1 / -1" }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
    </Box>
  );
}
