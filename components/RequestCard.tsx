import React from "react";
import { View } from "react-native";
import { StatusBadge } from "./StatusBadge";
import ReusableText from "./Reusable/ReusableText";
import HeightSpacer from "./Reusable/HeightSpacer";
import Card from "./Card";
import { SIZES, useThemeColors } from "../constants/theme";
import type { EffectiveStatus } from "@/lib/assignment-status";

type RequestItem = { id: string; partName: string };

export type RequestData = {
  partName: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  items?: RequestItem[];
};

type Props = {
  status: EffectiveStatus;
  requestData: RequestData;
  updatedAt: string;
  onPress: () => void;
};

export function vehicleLabel(r: { make?: string | null; model?: string | null; year?: number | string | null }): string {
  return [r.make, r.model, r.year != null ? String(r.year) : null].filter(Boolean).join(" ");
}

export function RequestCard({ status, requestData, updatedAt, onPress }: Props): React.JSX.Element {
  const C = useThemeColors();
  const vehicle = vehicleLabel(requestData);
  const date = new Date(updatedAt);
  const ageHours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  const urgent = status === "PENDING" && ageHours >= 24;
  const timeLabel = ageHours < 24
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });

  const items = requestData.items ?? [];
  const multi = items.length > 1 ? items : null;

  return (
    <Card onPress={onPress} style={urgent ? { borderLeftWidth: 3, borderLeftColor: C.primary } : undefined}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          {multi ? (
            multi.map((item, i) => (
              <ReusableText
                key={item.id}
                text={`${i + 1}. ${item.partName}`}
                family={i === 0 ? "medium" : "regular"}
                size={14}
                color={C.secondary}
              />
            ))
          ) : (
            <ReusableText text={requestData.partName} family="medium" size={15} color={C.secondary} />
          )}
        </View>
        <StatusBadge status={status} />
      </View>

      {vehicle ? (
        <>
          <HeightSpacer height={4} />
          <ReusableText text={vehicle} family="regular" size={SIZES.small} color={C.gray2} />
        </>
      ) : null}

      {requestData.notes ? (
        <>
          <HeightSpacer height={4} />
          <ReusableText text={requestData.notes} family="regular" size={SIZES.small} color={C.gray2} numberOfLines={2} />
        </>
      ) : null}

      <HeightSpacer height={4} />
      <ReusableText text={urgent ? `${timeLabel} · waiting over 24h` : timeLabel} family={urgent ? "medium" : "regular"} size={12} color={urgent ? C.primary : C.gray2} />
    </Card>
  );
}
