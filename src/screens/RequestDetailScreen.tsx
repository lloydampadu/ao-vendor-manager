import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import {
  getAssignment,
  enqueueQuote,
  enqueueDecline,
  updateAssignmentStatus,
  type Assignment,
  type QuoteQueueItem,
  type DeclineQueueItem,
} from "../../lib/db";
import { useSyncStore } from "../../store/sync-store";
import {
  StatusBadge,
  QuoteForm,
  Card,
  ReusableText,
  ReusableBtn,
  NetworkImage,
  HeightSpacer,
  WidthSpacer,
} from "../../components";
import { COLORS, SIZES } from "../../constants/theme";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = {
  navigation: NativeStackNavigationProp<InboxStackParamList, "RequestDetail">;
  route: RouteProp<InboxStackParamList, "RequestDetail">;
};

type RequestData = {
  partName: string;
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  notes?: string;
  photos?: string[];
};

type QuoteData = {
  priceGhs: number;
  availability: string;
  notes?: string;
  photos?: string[];
};

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function RequestDetailScreen({ navigation, route }: Props): React.JSX.Element {
  const { assignmentId } = route.params;
  const [row, setRow] = useState<Assignment | null>(null);
  const { startSync } = useSyncStore();

  const load = useCallback(async () => {
    const assignment = await getAssignment(assignmentId);
    setRow(assignment);
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  async function submitQuote(payload: {
    priceGhs: number;
    availability: string;
    notes?: string;
    photos: string[];
  }) {
    if (!row) return;
    const item: QuoteQueueItem = {
      id: makeId(),
      assignment_id: row.id,
      payload: JSON.stringify(payload),
      synced: 0,
      error: null,
      created_at: new Date().toISOString(),
    };
    await enqueueQuote(item);
    await load();
    startSync().catch(() => {});
    Alert.alert("Quote saved", "It will sync automatically.", [
      { text: "OK", onPress: () => navigation.goBack() },
    ]);
  }

  function decline() {
    if (!row) return;
    Alert.alert("Decline request", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const item: DeclineQueueItem = {
              id: makeId(),
              assignment_id: row.id,
              synced: 0,
              error: null,
              created_at: new Date().toISOString(),
            };
            await enqueueDecline(item);
            await updateAssignmentStatus(row.id, "DECLINED");
            startSync().catch(() => {});
            Alert.alert("Decline saved", "It will sync automatically.", [
              { text: "OK", onPress: () => navigation.goBack() },
            ]);
          })();
        },
      },
    ]);
  }

  if (!row) {
    return (
      <View style={styles.center}>
        <ReusableText text="Loading…" family="regular" size={SIZES.medium} color={COLORS.gray2} />
      </View>
    );
  }

  const req = JSON.parse(row.request_data) as RequestData;
  const quote: QuoteData | null = row.quote_data ? (JSON.parse(row.quote_data) as QuoteData) : null;
  const car = [req.make, req.model, req.year != null ? String(req.year) : undefined]
    .filter((v): v is string => Boolean(v))
    .join(" ");

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Request info */}
      <Card>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ReusableText text={req.partName} family="bold" size={18} color={COLORS.secondary} />
          </View>
          <WidthSpacer width={8} />
          <StatusBadge status={row.status} />
        </View>

        {car.length > 0 && (
          <>
            <HeightSpacer height={6} />
            <ReusableText text={`Vehicle: ${car}`} family="regular" size={SIZES.medium} color={COLORS.gray2} />
          </>
        )}
        {req.engine && (
          <>
            <HeightSpacer height={4} />
            <ReusableText text={`Engine: ${req.engine}`} family="regular" size={SIZES.medium} color={COLORS.gray2} />
          </>
        )}
        {req.notes && (
          <>
            <HeightSpacer height={8} />
            <ReusableText text={req.notes} family="regular" size={SIZES.medium} color={COLORS.secondary} />
          </>
        )}
        {req.photos && req.photos.length > 0 && (
          <>
            <HeightSpacer height={10} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {req.photos.map((uri, i) => (
                <View key={i} style={{ marginRight: 8 }}>
                  <NetworkImage source={uri} width={100} height={100} radius={6} />
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </Card>

      {/* PENDING: quote form */}
      {row.status === "PENDING" && (
        <Card>
          <ReusableText text="Your Quote" family="bold" size={16} color={COLORS.secondary} />
          <HeightSpacer height={12} />
          <QuoteForm assignmentId={row.id} onSubmit={(payload) => submitQuote(payload)} />
          <HeightSpacer height={8} />
          <ReusableBtn
            onPress={decline}
            btnText="I don't have this item"
            backgroundColor="transparent"
            textColor={COLORS.primary}
            width="100%"
            height={44}
            borderRadius={8}
            fontSize={SIZES.small}
          />
        </Card>
      )}

      {/* QUOTED: read-only quote */}
      {row.status === "QUOTED" && quote !== null && (
        <Card>
          <ReusableText text="Your submitted quote" family="bold" size={16} color={COLORS.secondary} />
          <HeightSpacer height={8} />
          <ReusableText text={`Price: GHS ${quote.priceGhs}`} family="regular" size={SIZES.medium} color={COLORS.gray2} />
          <HeightSpacer height={4} />
          <ReusableText text={`Availability: ${quote.availability}`} family="regular" size={SIZES.medium} color={COLORS.gray2} />
          {quote.notes && (
            <>
              <HeightSpacer height={4} />
              <ReusableText text={`Notes: ${quote.notes}`} family="regular" size={SIZES.medium} color={COLORS.gray2} />
            </>
          )}
          {quote.photos && quote.photos.length > 0 && (
            <>
              <HeightSpacer height={10} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {quote.photos.map((uri, i) => (
                  <View key={i} style={{ marginRight: 8 }}>
                    <NetworkImage source={uri} width={100} height={100} radius={6} />
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </Card>
      )}

      {/* EXPIRED / DECLINED */}
      {(row.status === "EXPIRED" || row.status === "DECLINED") && (
        <Card style={{ backgroundColor: COLORS.offwhite }}>
          <ReusableText
            text={row.status === "EXPIRED" ? "This request has closed." : "You declined this request."}
            family="regular"
            size={SIZES.medium}
            color={COLORS.gray2}
          />
        </Card>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.offwhite },
  content: { padding: 12, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
});
