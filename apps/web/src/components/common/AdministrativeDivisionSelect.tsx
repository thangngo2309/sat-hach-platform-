"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Alert,
  Autocomplete,
  Box,
  CircularProgress,
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

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

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

  const [provinceError, setProvinceError] = useState("");

  const [wardError, setWardError] = useState("");

  const selectedProvince = useMemo(
    () => provinces.find((item) => item.code === provinceCode) ?? null,
    [provinces, provinceCode]
  );

  const selectedWard = useMemo(
    () => wards.find((item) => item.code === wardCode) ?? null,
    [wards, wardCode]
  );

  /**
   * Tải danh mục tỉnh/thành phố.
   */
  useEffect(() => {
    if (!accessToken) {
      setProvinces([]);
      setLoadingProvinces(false);
      setProvinceError("");
      return;
    }

    let active = true;

    setLoadingProvinces(true);
    setProvinceError("");

    void getProvinces(accessToken)
      .then((data) => {
        if (!active) return;

        setProvinces(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setProvinceError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách tỉnh/thành phố."
        );

        setProvinces([]);
      })
      .finally(() => {
        if (active) {
          setLoadingProvinces(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessToken]);

  /**
   * Tải danh mục xã/phường theo tỉnh đã chọn.
   */
  useEffect(() => {
    if (!accessToken || !provinceCode) {
      setWards([]);
      setLoadingWards(false);
      setWardError("");
      return;
    }

    let active = true;

    setWards([]);
    setLoadingWards(true);
    setWardError("");

    void getWards(accessToken, provinceCode)
      .then((data) => {
        if (!active) return;

        setWards(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (!active) return;

        setWardError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách xã/phường."
        );

        setWards([]);
      })
      .finally(() => {
        if (active) {
          setLoadingWards(false);
        }
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
        minWidth: 0,
      }}
    >
      {/* TỈNH / THÀNH PHỐ */}
      <Autocomplete
        fullWidth
        size="small"
        options={provinces}
        value={selectedProvince}
        loading={loadingProvinces}
        disabled={disabled || !accessToken}
        autoHighlight
        openOnFocus
        noOptionsText="Không tìm thấy tỉnh/thành phố"
        loadingText="Đang tải tỉnh/thành phố..."
        isOptionEqualToValue={(option, value) => option.code === value.code}
        getOptionLabel={(option) => option.name}
        filterOptions={(options, state) => {
          const keyword = normalizeSearch(state.inputValue);

          if (!keyword) return options;

          return options.filter((item) => {
            const name = normalizeSearch(item.name);
            const code = normalizeSearch(item.code);

            return name.includes(keyword) || code.includes(keyword);
          });
        }}
        onChange={(_, selected) => {
          onChange({
            provinceCode: selected?.code ?? "",
            provinceName: selected?.name ?? "",
            wardCode: "",
            wardName: "",
          });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth
            size="small"
            required={required}
            label="Tỉnh/Thành phố"
            placeholder="Tìm tỉnh/thành phố..."
          />
        )}
      />

      {/* XÃ / PHƯỜNG */}
      <Autocomplete
        fullWidth
        size="small"
        options={wards}
        value={selectedWard}
        loading={loadingWards}
        disabled={disabled || !accessToken || !provinceCode || loadingWards}
        autoHighlight
        openOnFocus
        noOptionsText="Không tìm thấy xã/phường"
        loadingText="Đang tải xã/phường..."
        isOptionEqualToValue={(option, value) => option.code === value.code}
        getOptionLabel={(option) => option.name}
        filterOptions={(options, state) => {
          const keyword = normalizeSearch(state.inputValue);

          if (!keyword) return options;

          return options.filter((item) => {
            const name = normalizeSearch(item.name);
            const code = normalizeSearch(item.code);

            return name.includes(keyword) || code.includes(keyword);
          });
        }}
        onChange={(_, selected) => {
          onChange({
            provinceCode,
            provinceName: selectedProvince?.name ?? "",
            wardCode: selected?.code ?? "",
            wardName: selected?.name ?? "",
          });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            fullWidth
            size="small"
            required={required}
            label="Xã/Phường"
            placeholder={
              provinceCode ? "Tìm xã/phường..." : "Chọn tỉnh/thành phố trước"
            }
          />
        )}
      />

      {/* TRẠNG THÁI TẢI DANH MỤC */}
      {(loadingProvinces || loadingWards) && (
        <Box
          sx={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={16} />
          <Box
            sx={{
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            Đang tải danh mục địa bàn...
          </Box>
        </Box>
      )}

      {/* THÔNG BÁO LỖI */}
      {(provinceError || wardError) && (
        <Box sx={{ gridColumn: "1 / -1" }}>
          <Alert severity="error">{provinceError || wardError}</Alert>
        </Box>
      )}
    </Box>
  );
}
