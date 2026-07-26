/**
 * Expo mobile app root screen.
 *
 * Minimal sign-in UI that posts credentials to the API and persists the refresh token
 * in Expo SecureStore for subsequent authenticated requests.
 *
 * Responsibilities:
 * - Collect email/username and password
 * - Call `./src/api` login helper and surface status to the user
 * - Store refresh token locally (not access token)
 *
 * Security:
 * - Refresh token only in SecureStore; realm derived server-side from email domain
 */

import { useState } from "react";
import { Button, SafeAreaView, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";

import { login } from "./src/api";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Ready");

  const onSignIn = async () => {
    try {
      const result = await login(email, password);
      await SecureStore.setItemAsync("refreshToken", result.refreshToken);
      setStatus("Signed in and refresh token saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#020617" }}>
      <View style={{ padding: 24, gap: 12 }}>
        <Text style={{ color: "#e2e8f0", fontSize: 26, fontWeight: "700" }}>KOIOS</Text>
        <Text style={{ color: "#94a3b8" }}>{status}</Text>
        <TextInput style={{ borderColor: "#334155", borderWidth: 1, color: "#e2e8f0", padding: 10 }} placeholderTextColor="#64748b" placeholder="Email or platform username" value={email} onChangeText={setEmail} />
        <TextInput style={{ borderColor: "#334155", borderWidth: 1, color: "#e2e8f0", padding: 10 }} placeholderTextColor="#64748b" placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Button title="Sign in" onPress={onSignIn} />
      </View>
    </SafeAreaView>
  );
}
