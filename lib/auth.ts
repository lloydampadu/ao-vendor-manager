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
