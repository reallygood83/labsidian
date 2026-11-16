import { hashTeamCode } from "../../packages/shared/team";
import { LabsidianError } from "../errors";
import type { HttpClient } from "../http/types";

function root(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

function authHeaders(idToken: string): Record<string, string> {
  return { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
}

export async function createTeam(http: HttpClient, projectId: string, idToken: string, teamId: string, ownerUid: string, code: string): Promise<void> {
  const codeHash = await hashTeamCode(code);
  const response = await http.request({
    url: `${root(projectId)}/teams?documentId=${encodeURIComponent(teamId)}`,
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        ownerUid: { stringValue: ownerUid },
        codeHash: { stringValue: codeHash },
      },
    }),
  });
  if (response.status >= 400) {
    throw new LabsidianError(`팀을 만들지 못했어요 (${response.status}). 규칙을 게시했는지 확인해 주세요.`);
  }
}

export async function updateTeamCode(http: HttpClient, projectId: string, idToken: string, teamId: string, code: string): Promise<void> {
  const codeHash = await hashTeamCode(code);
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}?updateMask.fieldPaths=codeHash`,
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({ fields: { codeHash: { stringValue: codeHash } } }),
  });
  if (response.status >= 400) throw new LabsidianError(`팀코드를 바꾸지 못했어요 (${response.status}).`);
}

export async function joinTeam(http: HttpClient, projectId: string, idToken: string, teamId: string, uid: string, email: string, code: string): Promise<void> {
  const codeHash = await hashTeamCode(code);
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members?documentId=${encodeURIComponent(uid)}`,
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({
      fields: {
        codeHash: { stringValue: codeHash },
        email: { stringValue: email },
      },
    }),
  });
  if (response.status === 409) return;
  if (response.status >= 400) {
    throw new LabsidianError("팀코드가 맞지 않거나 가입이 거절됐어요. 관리자에게 새 초대 링크를 요청해 주세요.");
  }
}

export interface TeamMember {
  uid: string;
  email: string;
}

export async function listMembers(http: HttpClient, projectId: string, idToken: string, teamId: string): Promise<TeamMember[]> {
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members?pageSize=100`,
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status >= 400) return [];
  const payload = JSON.parse(response.text) as { documents?: { name?: string; fields?: { email?: { stringValue?: string } } }[] };
  return (payload.documents ?? []).map((doc) => ({
    uid: doc.name?.split("/").pop() ?? "",
    email: doc.fields?.email?.stringValue ?? "",
  })).filter((member) => member.uid);
}

export async function removeMember(http: HttpClient, projectId: string, idToken: string, teamId: string, uid: string): Promise<void> {
  const response = await http.request({
    url: `${root(projectId)}/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(uid)}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (response.status >= 400 && response.status !== 404) {
    throw new LabsidianError(`멤버를 빼지 못했어요 (${response.status}).`);
  }
}
