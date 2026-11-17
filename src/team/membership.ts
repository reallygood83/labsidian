import { generateCodeSalt, hashTeamCode } from "../../packages/shared/team";
import { emailVerifiedFromToken } from "./auth";
import { LabsidianError } from "../errors";
import type { HttpClient } from "../http/types";

function root(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

function authHeaders(idToken: string): Record<string, string> {
  return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
}

export function explainFirestoreStatus(status: number, idToken = ""): string {
  if (status === 403 && idToken && !emailVerifiedFromToken(idToken)) {
    return "메일 인증이 필요해요. 받은 편지함의 링크를 누른 뒤 다시 로그인해 주세요.";
  }
  if (status === 403) return "이 팀에 쓸 권한이 없어요. 관리자에게 초대 링크를 다시 받아 주세요.";
  if (status === 401) return "로그인이 만료됐어요. 설정에서 다시 로그인해 주세요.";
  return "팀 서고에 연결하지 못했어요. 인터넷과 Firebase 설정을 확인해 주세요.";
}

export async function createLibrary(http: HttpClient, projectId: string, idToken: string, teamId: string, adminUid: string, mode: "personal" | "team"): Promise<void> {
  const response = await http.request({
    url: `${root(projectId)}/config?documentId=library`,
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        adminUid: { stringValue: adminUid },
        teamId: { stringValue: teamId },
        mode: { stringValue: mode },
      },
    }),
  });
  if (response.status === 409) {
    const existing = await http.request({
      url: `${root(projectId)}/config/library`,
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (existing.status >= 400) {
      throw new LabsidianError("이미 다른 사람이 이 서고를 만들었어요. 그 사람의 초대를 받아 주세요.");
    }
    const payload = JSON.parse(existing.text) as { fields?: { adminUid?: { stringValue?: string } } };
    if (payload.fields?.adminUid?.stringValue !== adminUid) {
      throw new LabsidianError("이미 다른 사람이 이 서고를 만들었어요. 그 사람의 초대를 받아 주세요.");
    }
    return;
  }
  if (response.status >= 400) throw new LabsidianError(explainFirestoreStatus(response.status, idToken));
}

export async function updateLibrary(http: HttpClient, projectId: string, idToken: string, teamId: string, mode: "personal" | "team"): Promise<void> {
  const response = await http.request({
    url: `${root(projectId)}/config/library?updateMask.fieldPaths=teamId&updateMask.fieldPaths=mode`,
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        teamId: { stringValue: teamId },
        mode: { stringValue: mode },
      },
    }),
  });
  if (response.status >= 400) throw new LabsidianError(explainFirestoreStatus(response.status, idToken));
}

export async function createTeam(http: HttpClient, projectId: string, idToken: string, teamId: string, ownerUid: string, code: string, salt: string): Promise<void> {
  const codeHash = await hashTeamCode(code, salt);
  const response = await http.request({
    url: `${root(projectId)}/teams?documentId=${encodeURIComponent(teamId)}`,
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        ownerUid: { stringValue: ownerUid },
        codeHash: { stringValue: codeHash },
        codeSalt: { stringValue: salt },
      },
    }),
  });
  if (response.status === 409) return;
  if (response.status >= 400) throw new LabsidianError(`${explainFirestoreStatus(response.status, idToken)} 규칙을 게시했는지 확인해 주세요.`);
}

export async function updateTeamCode(http: HttpClient, projectId: string, idToken: string, teamId: string, code: string): Promise<string> {
  const salt = generateCodeSalt();
  const codeHash = await hashTeamCode(code, salt);
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}?updateMask.fieldPaths=codeHash&updateMask.fieldPaths=codeSalt`,
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        codeHash: { stringValue: codeHash },
        codeSalt: { stringValue: salt },
      },
    }),
  });
  if (response.status >= 400) throw new LabsidianError(explainFirestoreStatus(response.status, idToken));
  return salt;
}

export async function joinTeam(http: HttpClient, projectId: string, idToken: string, teamId: string, uid: string, displayName: string, code: string, salt: string): Promise<void> {
  const codeHash = await hashTeamCode(code, salt);
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members?documentId=${encodeURIComponent(uid)}`,
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        codeHash: { stringValue: codeHash },
        displayName: { stringValue: displayName },
      },
    }),
  });
  if (response.status === 409) return;
  if (response.status === 403 && !emailVerifiedFromToken(idToken)) {
    throw new LabsidianError("메일 인증이 필요해요. 받은 편지함의 링크를 누른 뒤 다시 로그인해 주세요.");
  }
  if (response.status >= 400) throw new LabsidianError("팀코드가 맞지 않아요. 관리자에게 새 초대 링크를 받아 주세요.");
}

export interface TeamMember {
  uid: string;
  displayName: string;
}

export async function memberExists(http: HttpClient, projectId: string, idToken: string, teamId: string, uid: string): Promise<boolean> {
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(uid)}`,
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status === 200) return true;
  if (response.status === 404) return false;
  throw new LabsidianError(explainFirestoreStatus(response.status, idToken));
}

export async function listMembers(http: HttpClient, projectId: string, idToken: string, teamId: string): Promise<TeamMember[]> {
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members?pageSize=100`,
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status >= 400) return [];
  const payload = JSON.parse(response.text) as { documents?: { name?: string; fields?: { displayName?: { stringValue?: string } } }[] };
  return (payload.documents ?? []).map((doc) => ({
    uid: doc.name?.split("/").pop() ?? "",
    displayName: doc.fields?.displayName?.stringValue ?? "",
  })).filter((member) => member.uid);
}

export async function removeMember(http: HttpClient, projectId: string, idToken: string, teamId: string, uid: string): Promise<void> {
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(uid)}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status >= 400 && response.status !== 404) throw new LabsidianError(explainFirestoreStatus(response.status, idToken));
}

export { generateCodeSalt };
