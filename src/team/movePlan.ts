export function savedMove(moveTeamId: string, salt: string, code: string): { teamId: string; salt: string; code: string } | null {
  if (!moveTeamId || !salt || !code) return null;
  return { teamId: moveTeamId, salt, code };
}
