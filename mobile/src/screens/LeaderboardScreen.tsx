import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Image, ScrollView, Modal,
} from "react-native";
import { useSafeAreaInsets }  from "react-native-safe-area-context";
import { useUser }            from "../context/UserContext";
import { getLeaderboard, getFriendsLeaderboard } from "../services/api";
import type { LeaderboardEntry } from "../types";
import LevelBadge             from "../components/LevelBadge";
import { getLevelInfo }       from "../utils/xp";
import { CS_API_BASE }        from "../config";

// ── Types ─────────────────────────────────────────────────────────────────────
type Period = "weekly" | "monthly" | "alltime" | "friends";

interface RankedEntry extends LeaderboardEntry {
  rank:      number;
  pts:       number;
  movement:  number | null; // positive = moved up, negative = moved down, 0 = same, null = unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ptsForPeriod(e: LeaderboardEntry, period: Period): number {
  if (period === "weekly")  return e.week_points  ?? 0;
  if (period === "alltime") return e.total_points ?? 0;
  return e.month_points ?? 0; // monthly + friends use month_points
}

// Standard competition ranking: tied scores share the same rank, next rank skips
function assignRanks(entries: LeaderboardEntry[], period: Period): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => ptsForPeriod(b, period) - ptsForPeriod(a, period));
  let currentRank = 1;
  return sorted.map((e, i) => {
    if (i > 0 && ptsForPeriod(sorted[i], period) < ptsForPeriod(sorted[i - 1], period)) {
      currentRank = i + 1;
    }
    const pts = ptsForPeriod(e, period);

    // Movement: only meaningful for monthly (prev_month_rank is monthly snapshot)
    let movement: number | null = null;
    if (period === "monthly" && e.prev_month_rank != null) {
      movement = e.prev_month_rank - currentRank; // positive = moved up
    }

    return { ...e, rank: currentRank, pts, movement };
  });
}

function movementIcon(m: number | null): string {
  if (m == null || m === 0) return "→";
  return m > 0 ? "↑" : "↓";
}
function movementColor(m: number | null): string {
  if (m == null || m === 0) return C.textMuted;
  return m > 0 ? C.green : "#f87171";
}
function movementLabel(m: number | null): string {
  if (m == null) return "";
  if (m === 0)   return "No change";
  return `${Math.abs(m)} position${Math.abs(m) !== 1 ? "s" : ""}`;
}

function motivationText(ranked: RankedEntry[], myEntry: RankedEntry | null): string {
  if (!myEntry) return "Attend sessions to earn XP and climb the board.";
  if (myEntry.rank === 1) return "🏆 You're leading! Keep attending to stay on top.";

  const above = ranked.find(e => e.rank < myEntry.rank && e.pts > myEntry.pts);
  if (above) {
    const gap = above.pts - myEntry.pts;
    if (myEntry.rank <= 10) return `${gap} XP away from #${myEntry.rank - 1}. Attend one session to close the gap.`;
    if (myEntry.rank <= 20) return `${gap} XP to break into Top 10. One session could do it.`;
    return `Earn ${gap} XP to reach #${myEntry.rank - 1} — ${above.user_name.split(" ")[0]}.`;
  }
  return "Keep attending sessions to earn more XP.";
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PODIUM_BG = [
  "rgba(245,158,11,0.12)",
  "rgba(200,200,200,0.08)",
  "rgba(180,90,20,0.10)",
];
const PODIUM_BORDER = [
  "rgba(245,158,11,0.4)",
  "rgba(200,200,200,0.2)",
  "rgba(180,90,20,0.25)",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ entry, size = 40 }: { entry: LeaderboardEntry; size?: number }) {
  const r = size / 2;
  if (entry.photo) return <Image source={{ uri: entry.photo }} style={{ width: size, height: size, borderRadius: r }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: C.orangeDim, borderWidth: 1, borderColor: C.orangeMid, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.36, fontWeight: "800", color: C.orange }}>{entry.user_name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function Podium({ top3, period }: { top3: RankedEntry[]; period: Period }) {
  if (top3.length < 2) return null;
  // Display: 2nd | 1st | 3rd
  const order = [top3[1], top3[0], top3[2]].filter(Boolean);
  const heights = [100, 120, 88];

  return (
    <View style={S.podium}>
      {order.map((entry, slotIdx) => {
        const realIdx = order.indexOf(entry);
        const origIdx = top3.indexOf(entry);
        const h       = heights[realIdx] ?? 88;
        return (
          <View
            key={entry.id}
            style={[S.podiumSlot, { height: h, backgroundColor: PODIUM_BG[origIdx], borderColor: PODIUM_BORDER[origIdx] }]}
          >
            <Text style={S.podiumMedal}>{MEDALS[origIdx]}</Text>
            <Avatar entry={entry} size={40} />
            <Text style={S.podiumName} numberOfLines={1}>{entry.user_name.split(" ")[0]}</Text>
            <Text style={S.podiumPts}>{entry.pts.toLocaleString()}</Text>
            <Text style={S.podiumPtsLabel}>XP</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Score breakdown modal ─────────────────────────────────────────────────────
interface Breakdown {
  user_name: string; session_points: number; weekly_bonus: number;
  total_month: number; total_alltime: number; total_xp: number;
  sessions: { date: string; title: string; base_pts: number; bonus_pts: number; total_pts: number }[];
}

function BreakdownModal({ email, name, onClose }: { email: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${CS_API_BASE}/api/leaderboard/breakdown?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => { setData(d.breakdown); setLoading(false); })
      .catch(() => setLoading(false));
  }, [email]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={M.root}>
        <View style={M.header}>
          <Text style={M.title}>Score Breakdown</Text>
          <TouchableOpacity onPress={onClose} style={M.closeBtn}><Text style={M.closeText}>Done</Text></TouchableOpacity>
        </View>
        {loading ? <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} /> : !data ? (
          <Text style={M.empty}>No data available.</Text>
        ) : (
          <ScrollView contentContainerStyle={M.scroll}>
            <Text style={M.userName}>{data.user_name}</Text>

            {/* Summary grid */}
            <View style={M.grid}>
              {[
                { label: "Sessions",      val: data.session_points, suffix: "pts" },
                { label: "Weekly Bonus",  val: data.weekly_bonus,   suffix: "pts" },
                { label: "Month Total",   val: data.total_month,    suffix: "pts" },
                { label: "Total XP",      val: data.total_xp,       suffix: "XP"  },
              ].map(item => (
                <View key={item.label} style={M.gridItem}>
                  <Text style={M.gridVal}>{item.val}<Text style={M.gridSuffix}> {item.suffix}</Text></Text>
                  <Text style={M.gridLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Session-by-session */}
            <Text style={M.sectionLabel}>SESSION BREAKDOWN</Text>
            {data.sessions.length === 0 ? (
              <Text style={M.empty}>No attended sessions this month.</Text>
            ) : (
              <View style={M.table}>
                <View style={[M.tableRow, M.tableHead]}>
                  <Text style={[M.tableCell, M.tableCellHead, { flex: 2 }]}>Session</Text>
                  <Text style={[M.tableCell, M.tableCellHead]}>Base</Text>
                  <Text style={[M.tableCell, M.tableCellHead]}>Bonus</Text>
                  <Text style={[M.tableCell, M.tableCellHead]}>Total</Text>
                </View>
                {data.sessions.map((s, i) => (
                  <View key={i} style={[M.tableRow, i % 2 === 1 && M.tableRowAlt]}>
                    <Text style={[M.tableCell, { flex: 2 }]} numberOfLines={1}>{s.title}</Text>
                    <Text style={M.tableCell}>{s.base_pts}</Text>
                    <Text style={[M.tableCell, s.bonus_pts > 0 && { color: C.orange }]}>{s.bonus_pts > 0 ? `+${s.bonus_pts}` : "0"}</Text>
                    <Text style={[M.tableCell, { fontWeight: "700", color: C.white }]}>{s.total_pts}</Text>
                  </View>
                ))}
                {/* Totals row */}
                <View style={[M.tableRow, M.tableTotal]}>
                  <Text style={[M.tableCell, M.tableTotalCell, { flex: 2 }]}>Sessions subtotal</Text>
                  <Text style={M.tableCell} />
                  <Text style={M.tableCell} />
                  <Text style={[M.tableCell, M.tableTotalCell]}>{data.session_points}</Text>
                </View>
                <View style={[M.tableRow, M.tableTotal]}>
                  <Text style={[M.tableCell, { flex: 2, color: C.textSub }]}>Weekly bonus (4+ sessions/week)</Text>
                  <Text style={M.tableCell} />
                  <Text style={M.tableCell} />
                  <Text style={[M.tableCell, { color: C.orange, fontWeight: "700" }]}>+{data.weekly_bonus}</Text>
                </View>
                <View style={[M.tableRow, M.tableTotal, { backgroundColor: "rgba(232,98,10,0.12)" }]}>
                  <Text style={[M.tableCell, M.tableTotalCell, { flex: 2 }]}>Month Total</Text>
                  <Text style={M.tableCell} /><Text style={M.tableCell} />
                  <Text style={[M.tableCell, M.tableTotalCell, { color: C.orange, fontSize: 16 }]}>{data.total_month}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const M = StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  header:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#1e1e1e" },
  title:    { fontSize: 18, fontWeight: "800", color: C.white },
  closeBtn: { backgroundColor: C.orangeDim, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: C.orangeMid },
  closeText:{ fontSize: 13, color: C.orange, fontWeight: "700" },
  scroll:   { padding: 20, paddingBottom: 48 },
  userName: { fontSize: 20, fontWeight: "800", color: C.white, marginBottom: 20 },
  empty:    { fontSize: 13, color: C.textMuted, textAlign: "center", marginTop: 24 },
  grid:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 28 },
  gridItem: { flex: 1, minWidth: "44%", backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: "#1e1e1e", padding: 14 },
  gridVal:  { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  gridSuffix:{ fontSize: 12, fontWeight: "400", color: C.textMuted },
  gridLabel: { fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 },
  table:        { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: "#1e1e1e", overflow: "hidden" },
  tableRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14 },
  tableRowAlt:  { backgroundColor: "#0d0d0d" },
  tableHead:    { backgroundColor: "#1a1a1a", paddingVertical: 8 },
  tableTotal:   { borderTopWidth: 1, borderTopColor: "#1e1e1e" },
  tableCell:    { flex: 1, fontSize: 12, color: C.textSub, textAlign: "right" },
  tableCellHead:{ fontSize: 10, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", textAlign: "right" },
  tableTotalCell:{ fontWeight: "700", color: C.white },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LeaderboardScreen() {
  const { user }   = useUser();
  const insets     = useSafeAreaInsets();
  const [period,     setPeriod]    = useState<Period>("monthly");
  const [entries,    setEntries]   = useState<LeaderboardEntry[]>([]);
  const [friends,    setFriends]   = useState<LeaderboardEntry[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [breakdown,  setBreakdown] = useState<{ email: string; name: string } | null>(null);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [main, fr] = await Promise.allSettled([
        getLeaderboard(),
        user ? getFriendsLeaderboard(user.email) : Promise.resolve([]),
      ]);
      if (main.status === "fulfilled") setEntries(main.value);
      if (fr.status   === "fulfilled") setFriends(fr.value as LeaderboardEntry[]);
    } catch { /* keep stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const source  = period === "friends" ? friends : entries;
  const ranked  = assignRanks(source, period);
  const myIdx   = user ? ranked.findIndex(e => e.user_email === user.email) : -1;
  const myEntry = myIdx >= 0 ? ranked[myIdx] : null;
  const top3    = ranked.filter(e => e.rank <= 3).slice(0, 3);

  // XP gap to entry directly above
  const entryAbove = myIdx > 0 ? ranked[myIdx - 1] : null;
  const xpGap      = entryAbove ? Math.max(0, entryAbove.pts - (myEntry?.pts ?? 0) + 1) : 0;

  function renderRow({ item, index }: { item: RankedEntry; index: number }) {
    const isMe   = item.user_email === user?.email;
    const lvl    = getLevelInfo(item.total_points);
    const mvIcon = movementIcon(item.movement);
    const mvCol  = movementColor(item.movement);

    return (
      <TouchableOpacity style={[S.row, isMe && S.rowMe]} onPress={() => setBreakdown({ email: item.user_email, name: item.user_name })} activeOpacity={0.8}>
        {/* Rank */}
        <View style={S.rankCol}>
          <Text style={[S.rankNum, item.rank <= 3 && S.rankNumTop]}>{MEDALS[item.rank - 1] ?? `#${item.rank}`}</Text>
          {item.movement != null && item.movement !== 0 && (
            <Text style={[S.mvIcon, { color: mvCol }]}>{mvIcon}</Text>
          )}
        </View>

        {/* Avatar */}
        <Avatar entry={item} size={38} />

        {/* Name + level */}
        <View style={{ flex: 1 }}>
          <View style={S.nameRow}>
            <Text style={[S.name, isMe && S.nameMe]} numberOfLines={1}>
              {item.user_name}{isMe ? "  (you)" : ""}
            </Text>
            <LevelBadge info={lvl} size="sm" />
          </View>
          {item.location ? <Text style={S.location} numberOfLines={1}>{item.location}</Text> : null}
        </View>

        {/* XP */}
        <View style={S.ptsCol}>
          <Text style={[S.pts, isMe && S.ptsMe]}>{item.pts.toLocaleString()}</Text>
          <Text style={S.ptsLabel}>XP</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const TABS: { id: Period; label: string }[] = [
    { id: "weekly",  label: "Weekly"   },
    { id: "monthly", label: "Monthly"  },
    { id: "alltime", label: "All Time" },
    { id: "friends", label: "Friends"  },
  ];

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={[S.header, { paddingTop: Math.max(insets.top + 12, 20) }]}>
        <Text style={S.headerTitle}>⚡ Leaderboard</Text>
        <Text style={S.headerSub}>XP powers your rank · Earn more by attending sessions</Text>
      </View>

      {/* Period tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.tabsScroll} contentContainerStyle={S.tabsContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[S.tab, period === t.id && S.tabActive]}
            onPress={() => { setPeriod(t.id); listRef.current?.scrollToOffset({ offset: 0, animated: true }); }}
          >
            <Text style={[S.tabText, period === t.id && S.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={C.orange} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={ranked}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={S.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={C.orange} />
          }
          ListHeaderComponent={
            <>
              {/* Podium */}
              {ranked.length >= 2 && period !== "friends" && (
                <Podium top3={top3} period={period} />
              )}

              {/* User position card */}
              {myEntry && (
                <View style={S.myCard}>
                  <View style={S.myCardGlow} pointerEvents="none" />

                  {/* Top row: rank + movement + XP */}
                  <View style={S.myCardTop}>
                    <View style={S.myRankBlock}>
                      <Text style={S.myRank}>#{myEntry.rank}</Text>
                      <Text style={S.myRankLabel}>Your rank</Text>
                    </View>
                    <View style={S.myCardDiv} />
                    <View style={S.myXPBlock}>
                      <Text style={S.myXP}>{myEntry.pts.toLocaleString()}</Text>
                      <Text style={S.myXPLabel}>XP</Text>
                    </View>
                    {myEntry.movement != null && (
                      <View style={S.myCardDiv} />
                    )}
                    {myEntry.movement != null && (
                      <View style={S.myMvBlock}>
                        <Text style={[S.myMvIcon, { color: movementColor(myEntry.movement) }]}>
                          {movementIcon(myEntry.movement)}
                        </Text>
                        <Text style={[S.myMvLabel, { color: movementColor(myEntry.movement) }]}>
                          {movementLabel(myEntry.movement)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Gap row */}
                  {entryAbove && xpGap > 0 && (
                    <View style={S.myGapRow}>
                      <Text style={S.myGapText}>
                        <Text style={{ color: C.orange }}>{xpGap} XP</Text>
                        {" away from "}
                        <Text style={{ color: C.white }}>#{myEntry.rank - 1}</Text>
                        {entryAbove ? ` · ${entryAbove.user_name.split(" ")[0]}` : ""}
                      </Text>
                    </View>
                  )}

                  {/* Motivation */}
                  <Text style={S.myMotivation}>{motivationText(ranked, myEntry)}</Text>
                </View>
              )}

              {/* List header label */}
              {ranked.length > 0 && (
                <Text style={S.listHeader}>ALL RUNNERS</Text>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={S.empty}>
              <Text style={S.emptyIcon}>{period === "friends" ? "👥" : "🏃"}</Text>
              <Text style={S.emptyTitle}>{period === "friends" ? "No friends yet" : "No entries yet"}</Text>
              <Text style={S.emptyText}>
                {period === "friends"
                  ? "Follow other runners to see them here."
                  : "Attend a session to earn XP and appear on the leaderboard."}
              </Text>
            </View>
          }
        />
      )}
      {breakdown && (
        <BreakdownModal
          email={breakdown.email}
          name={breakdown.name}
          onClose={() => setBreakdown(null)}
        />
      )}
    </View>
  );
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       "#080808", surface: "#111111", border: "#1e1e1e",
  orange:   "#e8620a", orangeDim: "rgba(232,98,10,0.10)", orangeMid: "rgba(232,98,10,0.22)",
  white:    "#f5f5f5", text: "#f0f0f0", textSub: "#888888", textMuted: "#505050",
  gold:     "#f59e0b", green: "#4ade80",
};

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header:      { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  headerSub:   { fontSize: 12, color: C.textSub, marginTop: 4 },

  // Tabs
  tabsScroll:   { borderBottomWidth: 1, borderBottomColor: C.border, flexGrow: 0 },
  tabsContent:  { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tab:          { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabActive:    { backgroundColor: C.orangeDim, borderColor: C.orangeMid },
  tabText:      { fontSize: 13, fontWeight: "600", color: C.textSub },
  tabTextActive:{ color: C.orange },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  listHeader: { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: 4 },

  // Podium
  podium:       { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, marginBottom: 16, marginTop: 8 },
  podiumSlot:   { flex: 1, alignItems: "center", borderRadius: 16, borderWidth: 1, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 4, gap: 5, justifyContent: "flex-end" },
  podiumMedal:  { fontSize: 22 },
  podiumName:   { fontSize: 11, fontWeight: "700", color: C.white, textAlign: "center" },
  podiumPts:    { fontSize: 14, fontWeight: "800", color: C.orange, letterSpacing: -0.3 },
  podiumPtsLabel:{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" },

  // My card
  myCard:       { backgroundColor: "#130d07", borderRadius: 20, borderWidth: 1, borderColor: C.orangeMid, padding: 16, marginBottom: 16, overflow: "hidden" },
  myCardGlow:   { position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: C.orange, opacity: 0.07 },
  myCardTop:    { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  myCardDiv:    { width: 1, height: 36, backgroundColor: "rgba(232,98,10,0.2)", marginHorizontal: 14 },
  myRankBlock:  { alignItems: "center" },
  myRank:       { fontSize: 32, fontWeight: "800", color: C.orange, letterSpacing: -0.5 },
  myRankLabel:  { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 1 },
  myXPBlock:    { alignItems: "center" },
  myXP:         { fontSize: 22, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  myXPLabel:    { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  myMvBlock:    { alignItems: "center", flex: 1 },
  myMvIcon:     { fontSize: 22, fontWeight: "800" },
  myMvLabel:    { fontSize: 10, fontWeight: "600", marginTop: 2 },
  myGapRow:     { backgroundColor: "rgba(232,98,10,0.08)", borderRadius: 10, padding: 10, marginBottom: 10 },
  myGapText:    { fontSize: 13, color: C.textSub, textAlign: "center" },
  myMotivation: { fontSize: 12, color: C.textMuted, fontStyle: "italic", textAlign: "center" },

  // Rows
  row:          { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, marginVertical: 2 },
  rowMe:        { backgroundColor: "rgba(232,98,10,0.08)", borderWidth: 1, borderColor: "rgba(232,98,10,0.22)" },
  rankCol:      { width: 36, alignItems: "center", gap: 2 },
  rankNum:      { fontSize: 13, color: C.textSub, fontWeight: "700", textAlign: "center" },
  rankNumTop:   { fontSize: 20 },
  mvIcon:       { fontSize: 10, fontWeight: "700" },
  nameRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  name:         { fontSize: 14, fontWeight: "600", color: C.text, flex: 1 },
  nameMe:       { color: C.orange, fontWeight: "700" },
  location:     { fontSize: 11, color: C.textSub },
  ptsCol:       { alignItems: "flex-end" },
  pts:          { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
  ptsMe:        { color: C.orange },
  ptsLabel:     { fontSize: 9, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.4 },

  empty:      { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 8 },
  emptyText:  { fontSize: 13, color: C.textSub, textAlign: "center", lineHeight: 20 },
});
