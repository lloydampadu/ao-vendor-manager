import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Dimensions, PanResponder, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import ImageViewing from "react-native-image-viewing";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import {
  getAssignment,
  enqueueQuote,
  enqueueDecline,
  updateAssignmentStatus,
  updateAssignmentQuote,
  getQuoteQueueItem,
  type Assignment,
  type QuoteQueueItem,
  type DeclineQueueItem,
  type QuoteSyncStatus,
} from "../../lib/db";
import { api } from "@/lib/api";
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
  SyncStatusIcon,
  RequestDetailSkeleton,
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
  createdAt?: string;
};

type QuoteData = {
  priceGhs: number;
  availability: string;
  prices?: { condition: string; priceGhs: number }[];
  photos?: string[];
};

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const EXPIRE_DAYS = 5;

function useCountdown(createdAt?: string): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!createdAt) return;
    const update = () => {
      const expiry = new Date(createdAt).getTime() + EXPIRE_DAYS * 24 * 60 * 60 * 1000;
      const ms = expiry - Date.now();
      if (ms <= 0) { setLabel("Expired"); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      if (h >= 24) setLabel(`${Math.floor(h / 24)}d ${h % 24}h left`);
      else setLabel(`${h}h ${m}m left`);
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [createdAt]);

  return label;
}

export default function RequestDetailScreen({ navigation, route }: Props): React.JSX.Element {
  const { assignmentId } = route.params;
  const [row, setRow] = useState<Assignment | null>(null);
  const [quoteSyncStatus, setQuoteSyncStatus] = useState<QuoteSyncStatus | null>(null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const { startSync } = useSyncStore();

  const load = useCallback(async () => {
    const [assignment, queueItem] = await Promise.all([
      getAssignment(assignmentId),
      getQuoteQueueItem(assignmentId),
    ]);
    setRow(assignment);
    if (queueItem) {
      setQuoteSyncStatus(queueItem.synced ? "synced" : queueItem.error ? "error" : "pending");
    }
    // Always fetch live from API so fee_paid status is never stale.
    try {
      const { assignment: live } = await api.get<{ assignment: { request: { status?: string }; [key: string]: unknown } }>(`/vendor/requests/${assignmentId}`);
      if (live && assignment) {
        const feePaidNow = live.request?.status !== "AWAITING_PAYMENT" ? 1 : 0;
        if (feePaidNow !== assignment.fee_paid) {
          const { upsertAssignment } = await import("../../lib/db");
          await upsertAssignment({ ...assignment, fee_paid: feePaidNow });
          setRow((prev) => prev ? { ...prev, fee_paid: feePaidNow } : prev);
        }
      }
    } catch {
      // Live fetch is best-effort; cached value is fine if offline.
    }
  }, [assignmentId]);

  useEffect(() => { void load(); }, [load]);

  const req: RequestData = row ? JSON.parse(row.request_data) as RequestData : { partName: "" };
  const quote: QuoteData | null = row?.quote_data ? JSON.parse(row.quote_data) as QuoteData : null;
  const countdown = useCountdown(row?.status === "PENDING" || row?.status === "QUOTED" ? req.createdAt : undefined);
  const car = [req.make, req.model, req.year != null ? String(req.year) : undefined]
    .filter((v): v is string => Boolean(v))
    .join(" ");

  async function submitQuote(payload: { priceGhs: number; availability: string; notes?: string; photos: string[] }) {
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
    // Write quote into local DB immediately so the screen shows it while offline.
    await updateAssignmentQuote(row.id, JSON.stringify(payload));
    await load();
    setEditingQuote(false);
    startSync().catch(() => {});
    Alert.alert("Quote sent", "We will send it when you are back online.", [
      { text: "OK", onPress: () => navigation.goBack() },
    ]);
  }

  async function updateQuote(payload: { priceGhs: number; availability: string; notes?: string; photos: string[] }) {
    if (!row) return;
    try {
      await api.put(`/vendor/requests/${row.id}/quote`, payload);
      await updateAssignmentStatus(row.id, "QUOTED");
      await load();
      setEditingQuote(false);
      Alert.alert("Quote updated", "Your changes have been saved.");
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Could not update your quote. Try again.");
    }
  }

  function decline() {
    if (!row) return;
    Alert.alert("You don't have this part?", "Are you sure you want to say you don't have it?", [
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
            Alert.alert("OK, noted", "We will update it when you are back online.", [
              { text: "OK", onPress: () => navigation.goBack() },
            ]);
          })();
        },
      },
    ]);
  }

  // Edge-only swipe-back: fires when touch starts within 25px of left edge.
  // gestureEnabled is false on this screen so we own the gesture entirely.
  const SCREEN_WIDTH = Dimensions.get("window").width;
  const edgeBack = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.pageX <= 25,
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.pageX <= 25,
      onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.pageX <= 25 && g.dx > 5,
      onPanResponderRelease: (_, g) => {
        if (g.dx > SCREEN_WIDTH * 0.3 && g.vx > 0.2) navigation.goBack();
      },
    }),
  ).current;

  if (!row) {
    return (
      <View style={{ flex: 1 }} {...edgeBack.panHandlers}>
        <ScrollView style={styles.scroll}>
          <RequestDetailSkeleton />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} {...edgeBack.panHandlers}>
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
                <TouchableOpacity
                  key={i}
                  onPress={() => { setLightboxIndex(i); setLightboxVisible(true); }}
                  style={{ marginRight: 8 }}
                  activeOpacity={0.8}
                >
                  <NetworkImage source={uri} width={100} height={100} radius={6} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Countdown timer */}
        {countdown && (
          <>
            <HeightSpacer height={10} />
            <View style={styles.countdownRow}>
              <Ionicons name="time-outline" size={14} color={COLORS.gray2} />
              <WidthSpacer width={4} />
              <ReusableText text={countdown} family="regular" size={SIZES.small} color={COLORS.gray2} />
            </View>
          </>
        )}
      </Card>

      {/* SELECTED: won! */}
      {row.status === "SELECTED" && (
        <>
          <Card style={styles.wonCard}>
            <ReusableText text="🎉 Your quote was selected!" family="bold" size={17} color="#155724" />
            <HeightSpacer height={6} />
            <ReusableText
              text="The customer picked your price. Get the part ready. They will contact you for pickup or delivery."
              family="regular"
              size={SIZES.small}
              color="#155724"
            />
          </Card>
          {quote && (
            <Card>
              <ReusableText text="Your winning price" family="bold" size={15} color={COLORS.secondary} />
              <HeightSpacer height={8} />
              {quote.prices && quote.prices.length > 0 ? (
                quote.prices.map((p) => (
                  <View key={p.condition} style={styles.quotePriceRow}>
                    <ReusableText text={p.condition} family="regular" size={SIZES.small} color="#155724" />
                    <ReusableText text={`GHS ${p.priceGhs}`} family="bold" size={20} color="#155724" />
                  </View>
                ))
              ) : (
                <>
                  <ReusableText text={`GHS ${quote.priceGhs}`} family="bold" size={22} color={COLORS.primary} />
                  <HeightSpacer height={4} />
                  <ReusableText text={quote.availability} family="regular" size={SIZES.medium} color={COLORS.gray2} />
                </>
              )}
            </Card>
          )}
        </>
      )}

      {/* PENDING: quote form */}
      {row.status === "PENDING" && (
        <Card>
          <ReusableText text="Send Your Price" family="bold" size={16} color={COLORS.secondary} />
          <HeightSpacer height={12} />
          <QuoteForm assignmentId={row.id} feePaid={true} partName={req.partName} onSubmit={(payload) => submitQuote(payload)} />
          <HeightSpacer height={8} />
          <ReusableBtn
            onPress={decline}
            btnText="I don't have this part"
            backgroundColor="transparent"
            textColor={COLORS.primary}
            width="100%"
            height={44}
            borderRadius={8}
            fontSize={SIZES.small}
          />
        </Card>
      )}

      {/* QUOTED: read-only + edit option */}
      {row.status === "QUOTED" && quote !== null && !editingQuote && (
        <Card>
          <View style={styles.row}>
            <ReusableText text="Your quote" family="bold" size={16} color={COLORS.secondary} />
            {quoteSyncStatus != null && <SyncStatusIcon status={quoteSyncStatus} />}
          </View>
          <HeightSpacer height={8} />
          {quote.prices && quote.prices.length > 0 ? (
            quote.prices.map((p) => (
              <View key={p.condition} style={styles.quotePriceRow}>
                <ReusableText text={p.condition} family="regular" size={SIZES.small} color={COLORS.gray2} />
                <ReusableText text={`GHS ${p.priceGhs}`} family="bold" size={18} color={COLORS.primary} />
              </View>
            ))
          ) : (
            <>
              <ReusableText text={`GHS ${quote.priceGhs}`} family="bold" size={20} color={COLORS.primary} />
              <HeightSpacer height={4} />
              <ReusableText text={quote.availability} family="regular" size={SIZES.medium} color={COLORS.gray2} />
            </>
          )}
          <HeightSpacer height={12} />
          <ReusableBtn
            onPress={() => setEditingQuote(true)}
            btnText="Change Quote"
            backgroundColor={COLORS.white}
            textColor={COLORS.primary}
            width="100%"
            height={44}
            borderRadius={8}
            borderWidth={1.5}
            borderColor={COLORS.primary}
            fontSize={SIZES.small}
          />
        </Card>
      )}

      {/* QUOTED: edit form */}
      {row.status === "QUOTED" && editingQuote && (
        <Card>
          <View style={styles.row}>
            <ReusableText text="Change Your Quote" family="bold" size={16} color={COLORS.secondary} />
            <ReusableBtn
              onPress={() => setEditingQuote(false)}
              btnText="Cancel"
              backgroundColor="transparent"
              textColor={COLORS.gray2}
              width={60}
              height={32}
              borderRadius={8}
              fontSize={SIZES.small}
            />
          </View>
          <HeightSpacer height={12} />
          <QuoteForm
            assignmentId={row.id}
            feePaid={true}
            partName={req.partName}
            initialValues={quote ?? undefined}
            onSubmit={(payload) => updateQuote(payload)}
            submitLabel="Save Changes"
          />
        </Card>
      )}

      {/* EXPIRED / DECLINED */}
      {(row.status === "EXPIRED" || row.status === "DECLINED") && (
        <Card style={styles.closedCard}>
          <ReusableText
            text={row.status === "EXPIRED" ? "This request is closed." : "You said you don't have this part."}
            family="regular"
            size={SIZES.medium}
            color={COLORS.gray2}
          />
        </Card>
      )}

    </ScrollView>

    <ImageViewing
      images={(req.photos ?? []).map((uri) => ({ uri }))}
      imageIndex={lightboxIndex}
      visible={lightboxVisible}
      onRequestClose={() => setLightboxVisible(false)}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
    />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: COLORS.offwhite },
  content: { padding: 12, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  countdownRow: { flexDirection: "row", alignItems: "center" },
  quotePriceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  wonCard: { backgroundColor: "#D4EDDA", borderColor: "#c3e6cb", borderWidth: 1 },
  closedCard: { backgroundColor: COLORS.offwhite },
});
