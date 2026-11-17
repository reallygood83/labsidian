import {
  emailVerifiedFromToken,
  refreshVerifiedSession,
  sendEmailVerification,
  signInWithGoogleIdToken,
  signInWithPassword,
  signUpWithPassword,
  type AuthSession,
} from "./auth";
import type { HttpClient } from "../http/types";
import { joinTeam } from "./membership";

export async function signUpForVerification(http: HttpClient, apiKey: string, email: string, password: string): Promise<AuthSession> {
  const session = await signUpWithPassword(http, apiKey, email, password);
  await sendEmailVerification(http, apiKey, session.idToken);
  return session;
}

export async function loginForVerification(http: HttpClient, apiKey: string, email: string, password: string): Promise<{ session: AuthSession; verified: boolean }> {
  const signed = await signInWithPassword(http, apiKey, email, password);
  const session = await refreshVerifiedSession(http, apiKey, signed);
  return { session, verified: emailVerifiedFromToken(session.idToken) };
}

export async function googleForVerification(http: HttpClient, apiKey: string, idToken: string): Promise<{ session: AuthSession; verified: boolean }> {
  const signed = await signInWithGoogleIdToken(http, apiKey, idToken);
  const session = await refreshVerifiedSession(http, apiKey, signed);
  return { session, verified: emailVerifiedFromToken(session.idToken) };
}

export async function joinIfVerified(
  http: HttpClient,
  projectId: string,
  session: AuthSession,
  verified: boolean,
  teamId: string,
  displayName: string,
  code: string,
  salt: string,
): Promise<"verify" | "joined"> {
  if (!verified) return "verify";
  await joinTeam(http, projectId, session.idToken, teamId, session.localId, displayName, code, salt);
  return "joined";
}
