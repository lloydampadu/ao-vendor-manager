import React, { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import ImageViewing from "react-native-image-viewing";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  enqueueDecline,
  enqueueQuote,
  getAssignment,
  getQuoteQueueItem,
  queueStatusOf,
  updateAssignmentQuote,
  updateAssignmentStatus,
  type Assignment,
  type QuoteSyncStatus,
} from "@/lib/db";
import { api, errorMessage } from "@/lib/api";
import { catalogNameLine } from "@/lib/part-tiles";
import { refreshAssignment } from "@/lib/sync";
import { effectiveStatus, parseJson, type EffectiveStatus } from "@/lib/assignment-status";
import { REQUEST_EXPIRY_DAYS } from "@/constants/support";
import { useSyncStore } from "@/store/sync-store";
import { useSyncedQuery } from "@/hooks/useSyncedQuery";
import {
  StatusBadge, QuoteForm, Card, ReusableText, ReusableBtn, NetworkImage, HeightSpacer, WidthSpacer, SyncStatusIcon, RequestDetailSkeleton,
} from "../../components";
import { vehicleLabel } from "../../components/RequestCard";
import type { QuotePayload, PriceEntry } from "../../components/QuoteForm";
import { SIZES, useThemeColors } from "../../constants/theme";
import type { InboxStackParamList } from "../navigation/InboxStackNavigator";

type Props = NativeStackScreenProps<InboxStackParamList, "RequestDetail">;

type RequestData = {
  partName: string;
  catalogPart?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engine?: string | null;
  notes?: string | null;
  photos?: string[];
  createdAt?: string;
  items?: { id: string; partName: string }[];
};

type QuoteData = {
  status?: string;
  priceGhs?: number;
  availability?: string;
  prices?: PriceEntry[];
  photos?: string[];
  photosByCondition?: Record<string, string[]>;
};

type Detail = { row: Assignment; status: EffectiveStatus; req: RequestData; quote: QuoteData | null; syncStatus: QuoteSyncStatus | null };

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function useCountdown(createdAt: string | undefined, enabled: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!createdAt || !enabled) { setLabel(null); return; }
    const update = () => {
      const ms = new Date(createdAt).getTime() + REQUEST_EXPIRY_DAYS * 86_400_000 - Date.now();
      if (ms <= 0) { setLabel("Expired"); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLabel(h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left to quote` : `${h}h ${m}m left to quote`);
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [createdAt, enabled]);
  return label;
}

export default function RequestDetailScreen({ navigation, route }: Props): React.JSX.Element {
  const C = useThemeColors();
  const { assignmentId } = route.params;
  const startSync = useSyncStore((s) => s.startSync);
  const isOnline = useSyncStore((s) => s.isOnline);
  const [editingQuote, setEditingQuote] = useState(false);
  const [lightbox, setLightbox] = useState<{ index: number } | null>(null);

  const load = useCallback(async (): Promise<Detail | null> => {
    const [row, queueItem] = await Promise.all([getAssignment(assignmentId), getQuoteQueueItem(assignmentId)]);
    if (!row) return null;
    const quote = parseJson<QuoteData | null>(row.quote_data, null);
    return {
      row,
      status: effectiveStatus(row.status, quote),
      req: parseJson<RequestData>(row.request_data, { partName: "Part request" }),
      quote,
      syncStatus: queueItem ? queueStatusOf(queueItem) : null,
    };
  }, [assignmentId]);
  const { data: detail, loading, refresh } = useSyncedQuery<Detail | null>(load, null);

  // One targeted refresh on open so the outcome (won / expired) is current
  // even if the last full sync was a while ago. Best effort.
  useEffect(() => {
    refreshAssignment(assignmentId).then(() => refresh()).catch(() => {});
  }, [assignmentId, refresh]);

  const countdown = useCountdown(detail?.req.createdAt, detail?.status === "PENDING");

  async function submitQuote(payload: QuotePayload) {
    if (!detail) return;
    await enqueueQuote({ id: makeId(), assignment_id: detail.row.id, payload: JSON.stringify(payload), synced: 0, error: null, created_at: new Date().toISOString() });
    await updateAssignmentQuote(detail.row.id, JSON.stringify({ ...payload, status: "PENDING" }));
    await refresh();
    setEditingQuote(false);
    void startSync();
    Alert.alert(
      "Quote saved",
      isOnline ? "Your price is on its way to the customer." : "You're offline — we'll send it as soon as you're back online.",
      [{ text: "OK", onPress: () => navigation.goBack() }],
    );
  }

  async function updateQuote(payload: QuotePayload) {
    if (!detail) return;
    try {
      // The PUT route uses a partial schema and doesn't derive these itself.
      const priceGhs = Math.min(...payload.prices.map((p) => p.priceGhs));
      const availability = payload.prices.map((p) => p.condition).join(" & ");
      await api.put(`/vendor/requests/${detail.row.id}/quote`, { ...payload, priceGhs, availability });
      await updateAssignmentQuote(detail.row.id, JSON.stringify({ ...detail.quote, ...payload, status: "PENDING" }));
      await refresh();
      setEditingQuote(false);
      Alert.alert("Quote updated", "Your changes have been sent.");
    } catch (e) {
      Alert.alert("Couldn't update quote", errorMessage(e, "Changing a quote needs an internet connection."));
    }
  }

  function decline() {
    if (!detail) return;
    Alert.alert("You don't have this part?", "The customer will be told you can't supply it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "I don't have it",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await enqueueDecline({ id: makeId(), assignment_id: detail.row.id, synced: 0, error: null, created_at: new Date().toISOString() });
            await updateAssignmentStatus(detail.row.id, "DECLINED");
            void startSync();
            navigation.goBack();
          })();
        },
      },
    ]);
  }

  if (loading && !detail) {
    return (
      <ScrollView style={[styles.scroll, { backgroundColor: C.offwhite }]}>
        <RequestDetailSkeleton />
      </ScrollView>
    );
  }

  if (!detail) {
    return (
      <View style={[styles.scroll, styles.center, { backgroundColor: C.offwhite }]}>
        <ReusableText text="This request is no longer available." family="medium" size={SIZES.medium} color={C.gray2} />
        <HeightSpacer height={12} />
        <ReusableBtn onPress={() => navigation.goBack()} btnText="Back to inbox" backgroundColor={C.primary} textColor={C.white} width={180} height={44} />
      </View>
    );
  }

  const { row, status, req, quote, syncStatus } = detail;
  const car = vehicleLabel(req);
  const photos = req.photos ?? [];
  const multiItems = (req.items ?? []).length > 1 ? req.items! : null;

  const priceLines = quote?.prices?.length
    ? quote.prices.map((p) => ({ label: p.condition, amount: p.priceGhs }))
    : quote?.priceGhs != null
    ? [{ label: quote.availability ?? "Price", amount: quote.priceGhs }]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.offwhite }}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              {multiItems ? (
                multiItems.map((it, i) => <ReusableText key={it.id} text={`${i + 1}. ${it.partName}`} family={i === 0 ? "bold" : "medium"} size={16} color={C.secondary} />)
              ) : (
                <>
                  <ReusableText text={req.partName} family="bold" size={18} color={C.secondary} />
                  {catalogNameLine(req.partName, req.catalogPart) ? (
                    <ReusableText text={catalogNameLine(req.partName, req.catalogPart)!} family="regular" size={13} color={C.gray2} />
                  ) : null}
                </>
              )}
            </View>
            <WidthSpacer width={8} />
            <StatusBadge status={status} />
          </View>
          {car ? (<><HeightSpacer height={6} /><ReusableText text={`Vehicle: ${car}`} family="regular" size={SIZES.medium} color={C.gray2} /></>) : null}
          {req.engine ? (<><HeightSpacer height={4} /><ReusableText text={`Engine: ${req.engine}`} family="regular" size={SIZES.medium} color={C.gray2} /></>) : null}
          {req.notes ? (<><HeightSpacer height={8} /><ReusableText text={req.notes} family="regular" size={SIZES.medium} color={C.secondary} /></>) : null}
          {photos.length > 0 && (
            <>
              <HeightSpacer height={10} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {photos.map((uri, i) => (
                  <TouchableOpacity key={uri + i} onPress={() => setLightbox({ index: i })} style={{ marginRight: 8 }} activeOpacity={0.8} accessibilityLabel={`Customer photo ${i + 1}`}>
                    <NetworkImage source={uri} width={100} height={100} radius={6} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
          {countdown && (
            <>
              <HeightSpacer height={10} />
              <View style={styles.inline}>
                <Ionicons name="time-outline" size={14} color={C.gray2} />
                <WidthSpacer width={4} />
                <ReusableText text={countdown} family="regular" size={SIZES.small} color={C.gray2} />
              </View>
            </>
          )}
        </Card>

        {status === "WON" && (
          <Card style={styles.wonCard}>
            <ReusableText text="Your quote was selected" family="bold" size={17} color="#155724" />
            <HeightSpacer height={6} />
            <ReusableText text="Once the customer pays, it moves to your Orders tab. We will collect it from you and deliver it to the customer." family="regular" size={SIZES.small} color="#155724" />
          </Card>
        )}

        {status === "LOST" && (
          <Card style={{ backgroundColor: C.offwhite }}>
            <ReusableText text="The customer chose another vendor's price this time." family="regular" size={SIZES.medium} color={C.gray2} />
          </Card>
        )}

        {status === "PENDING" && (
          <Card>
            <ReusableText text="Send your price" family="bold" size={16} color={C.secondary} />
            <HeightSpacer height={12} />
            <QuoteForm onSubmit={submitQuote} />
            <HeightSpacer height={8} />
            <ReusableBtn onPress={decline} btnText="I don't have this part" backgroundColor="transparent" textColor={C.primary} height={44} borderRadius={8} fontSize={SIZES.small} />
          </Card>
        )}

        {(status === "QUOTED" || status === "WON" || status === "LOST") && quote && !editingQuote && (
          <Card>
            <View style={styles.row}>
              <ReusableText text="Your quote" family="bold" size={16} color={C.secondary} />
              {syncStatus && <SyncStatusIcon status={syncStatus} />}
            </View>
            <HeightSpacer height={8} />
            {priceLines.map((p) => (
              <View key={p.label} style={styles.priceRow}>
                <ReusableText text={p.label} family="regular" size={SIZES.small} color={C.gray2} />
                <ReusableText text={`GHS ${p.amount.toLocaleString()}`} family="bold" size={18} color={status === "WON" ? "#155724" : C.primary} />
              </View>
            ))}
            {syncStatus === "error" && (
              <>
                <HeightSpacer height={8} />
                <ReusableText text="This quote couldn't be sent — the request may have expired or already been quoted." family="regular" size={11} color={C.red} />
              </>
            )}
            {status === "QUOTED" && (
              <>
                <HeightSpacer height={12} />
                <ReusableBtn onPress={() => setEditingQuote(true)} btnText="Change quote" backgroundColor={C.white} textColor={C.primary} height={44} borderRadius={8} borderWidth={1.5} borderColor={C.primary} fontSize={SIZES.small} />
              </>
            )}
          </Card>
        )}

        {status === "QUOTED" && editingQuote && (
          <Card>
            <View style={styles.row}>
              <ReusableText text="Change your quote" family="bold" size={16} color={C.secondary} />
              <ReusableBtn onPress={() => setEditingQuote(false)} btnText="Cancel" backgroundColor="transparent" textColor={C.gray2} width={70} height={32} borderRadius={8} fontSize={SIZES.small} />
            </View>
            <HeightSpacer height={12} />
            <QuoteForm
              initialValues={{ ...quote, photosByCondition: quote?.photosByCondition as QuotePayload["photosByCondition"] }}
              onSubmit={updateQuote}
              submitLabel="Save changes"
              allowDeferredPhotos={false}
            />
          </Card>
        )}

        {(status === "EXPIRED" || status === "DECLINED") && (
          <Card style={{ backgroundColor: C.offwhite }}>
            <ReusableText
              text={status === "EXPIRED" ? "This request has closed." : "You said you don't have this part."}
              family="regular"
              size={SIZES.medium}
              color={C.gray2}
            />
          </Card>
        )}
      </ScrollView>

      <ImageViewing
        images={photos.map((uri) => ({ uri }))}
        imageIndex={lightbox?.index ?? 0}
        visible={lightbox !== null}
        onRequestClose={() => setLightbox(null)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  inline: { flexDirection: "row", alignItems: "center" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  wonCard: { backgroundColor: "#D4EDDA", borderColor: "#c3e6cb", borderWidth: 1 },
});
