import React from "react";
import { View } from "react-native";
import { StatusBadge } from "./StatusBadge";
import ReusableText from "./Reusable/ReusableText";
import HeightSpacer from "./Reusable/HeightSpacer";
import Card from "./Card";
import { SIZES, useThemeColors } from "../constants/theme";

type RequestItem = { id: string; partName: string };

type RequestData = {
  partName: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  notes?: string | null;
  items?: RequestItem[];
};

type Props = {
  id: string;
  status: string;
  requestData: RequestData;
  updatedAt: string;
  onPress: () => void;
};

export function RequestCard({ status, requestData, updatedAt, onPress }: Props): React.JSX.Element {
  const C = useThemeColors();
  const vehicle = [requestData.make, requestData.model, requestData.year?.toString()].filter(Boolean).join(" ");
  const date = new Date(updatedAt);
  const ageHours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  const urgent = status === "PENDING" && ageHours >= 24;
  const timeLabel =
    ageHours < 24
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString([], { day: "numeric", month: "short" });

  const items = requestData.items ?? [];
  const displayItems = items.length > 1 ? items : null;

  return (
    <Card
      onPress={onPress}
      style={urgent ? { borderLeftWidth: 3, borderLeftColor: C.primary } : undefined}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          {displayItems ? (
            displayItems.map((item, i) => (
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
      <ReusableText text={timeLabel} family="regular" size={12} color={C.gray2} />

      {urgent && (
        <>
          <HeightSpacer height={4} />
          <ReusableText text="Pending for over 24h" family="medium" size={12} color={C.primary} />
        </>
      )}
    </Card>
  );
}
