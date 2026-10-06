import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "vendor_token";
const VENDOR_KEY = "vendor_profile";

export const saveToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export const saveVendor = (vendor: object) =>
  SecureStore.setItemAsync(VENDOR_KEY, JSON.stringify(vendor));
export const loadVendor = () => SecureStore.getItemAsync(VENDOR_KEY);
export const clearVendor = () => SecureStore.deleteItemAsync(VENDOR_KEY);

// ─── Unauthorized hook ───────────────────────────────────────────────────────
// The API client calls this on any 401 so the auth store can sign the vendor
// out from one place. Registered by the auth store at startup; kept here (not
// in the store) so lib/ never imports from store/ and we avoid a require cycle.

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
