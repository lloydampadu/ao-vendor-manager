import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import ReusableText from "./Reusable/ReusableText";
import { LIGHT_COLORS } from "../constants/theme";
import { createLogger } from "@/lib/logger";

const log = createLogger("error-boundary");

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence: a render crash shows a recoverable screen instead of
 * a frozen white app. Class component because React has no hook for this.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error("uncaught render error", error, { componentStack: info.componentStack?.slice(0, 500) });
  }

  private reset = () => this.setState({ error: null });

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    const C = LIGHT_COLORS;
    return (
      <View style={[styles.root, { backgroundColor: C.white }]}>
        <ReusableText text="Something went wrong" family="bold" size={20} color={C.secondary} />
        <View style={{ height: 8 }} />
        <ReusableText
          text="The app hit an unexpected error. Your saved quotes and listings are safe."
          family="regular"
          size={14}
          color={C.gray2}
        />
        <View style={{ height: 24 }} />
        <TouchableOpacity style={[styles.btn, { backgroundColor: C.primary }]} onPress={this.reset}>
          <ReusableText text="Try again" family="bold" size={16} color={C.white} />
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  btn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
});
