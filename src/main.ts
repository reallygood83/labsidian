import { Notice, Plugin, type TFile } from "obsidian";
import { collectedToday, runJob } from "./collect/run";
import { batchSummary, findDuplicate } from "./collect/usability";
import { CollectSession, type JobView } from "./collect/session";
import { createObsidianHttp } from "./http/obsidian";
import type { HttpClient } from "./http/types";
import type { LabsidianHost } from "./host";
import { t } from "./i18n";
import { SECRET, createSecretStore, type SecretStore } from "./secrets";
import { mergeSettings, rememberQuery, settingsForDisk, type LabsidianSettings } from "./settings";
import { sourceById } from "./sources/registry";
import type { Attachment, SearchHit, SourceContext, SourceId } from "./sources/types";
import { refreshSession, signInWithPassword, signUpWithPassword, userIdFromToken } from "./team/auth";
import { getResearchNote, listResearchNotes, upsertResearchNote } from "./team/firestore";
import { LabsidianSettingTab } from "./ui/settingsTab";
import { ProgressModal } from "./ui/progressModal";
import { SearchModal } from "./ui/searchModal";
import { UploadModal, type UploadPlan } from "./ui/uploadModal";
import { askPassword, askPasswordChange } from "./ui/passwordModal";
import { createNote, notesBySourceId, savedNoteRefs } from "./vault";
import { buildMarkdown } from "./note/build";
import { lockResearchNote, noteDocumentId, unlockResearchNote } from "../packages/shared/lock";
import type { ResearchNote } from "../packages/types/research-note";
import { buildInviteLinks, encodePublicConfig, generateCodeSalt, generateTeamCode, generateTeamId, parseInviteParams, type PublicFirebaseConfig } from "../packages/shared/team";
import { JoinModal } from "./ui/joinModal";
import { InviteConfirmModal } from "./ui/inviteConfirmModal";
import { TourModal } from "./ui/tourModal";
import { createLibrary, createTeam, joinTeam, listMembers, removeMember, updateLibrary, updateTeamCode, type TeamMember } from "./team/membership";
import "./types/obsidian";

export default class LabsidianPlugin extends Plugin implements LabsidianHost {
  settings: LabsidianSettings = mergeSettings({});
  secrets: SecretStore = createSecretStore({});
  http: HttpClient = createObsidianHttp();
  private status: HTMLElement | null = null;
  private session: CollectSession | null = null;
  private authToken = "";

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.secrets = createSecretStore(this.app);
    this.status = this.addStatusBarItem();
    this.status.setText("");
    this.addRibbonIcon("search", t("command.search"), () => this.openSearch());
    this.addCommand({
      id: "search",
      name: t("command.search"),
      callback: () => this.openSearch(),
    });
    this.addCommand({
      id: "search-selection",
      name: "이 주제로 자료 찾기",
      editorCallback: (editor) => this.openSearch(editor.getSelection()),
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const selected = editor.getSelection().trim();
      if (!selected) return;
      menu.addItem((item) => {
        item.setTitle("이 주제로 자료 찾기").setIcon("search").onClick(() => this.openSearch(selected));
      });
    }));
    this.addCommand({
      id: "change-lock",
      name: "팀 서고 잠금 바꾸기",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.changeLock(file);
        return true;
      },
    });
    this.addCommand({
      id: "share-note",
      name: t("command.share"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.shareFiles([file]);
        return true;
      },
    });
    this.registerObsidianProtocolHandler("labsidian", (params) => {
      void this.openShared(params.id ?? "");
    });
    this.registerObsidianProtocolHandler("labsidian-join", (params) => {
      const code = params.t || new URLSearchParams(String(params.hash ?? "").replace(/^#/, "")).get("t") || "";
      void this.acceptInvite(params.c ?? "", code);
    });
    this.addSettingTab(new LabsidianSettingTab(this.app, this));
    if (!this.settings.tourSeen) this.openTour();
  }

  openTour(): void {
    new TourModal(this.app, () => {
      this.settings.tourSeen = true;
      void this.saveSettings();
    }).open();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(settingsForDisk(this.settings));
  }

  openSearch(initialQuery = ""): void {
    const refs = savedNoteRefs(this.app);
    new SearchModal(this.app, {
      settings: this.settings,
      secrets: this.secrets,
      http: this.http,
      savedIds: new Set(refs.map((item) => item.sourceId).filter(Boolean)),
      saved: refs,
      initialQuery: initialQuery.trim(),
      onOpen: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file) void this.app.workspace.getLeaf(false).openFile(file as TFile);
      },
      onRemember: (query) => {
        this.settings.recentQueries = rememberQuery(this.settings, query);
        void this.saveSettings();
      },
      onCollect: (hits, query, summarize) => {
        void this.collect(hits, query, summarize);
      },
    }).open();
  }

  async testSource(id: SourceId): Promise<string> {
    const source = sourceById(id);
    const keys = await this.keys();
    if (source.requiresKey && !keys[id]) return id === "riss" ? t("search.needInstitutionKey") : t("search.needKey");
    try {
      const hits = await source.search("영화", this.context(keys));
      if (id === "openalex" && !keys.openalex) return `${t("settings.sharedQuota")} · ${hits.length}건`;
      return `${t("settings.connected")} · ${hits.length}건`;
    } catch (error) {
      return error instanceof Error ? error.message : t("fail.network");
    }
  }

  async acceptInvite(c: string, t: string): Promise<void> {
    try {
      const parsed = parseInviteParams(c, t);
      new InviteConfirmModal(this.app, parsed.config, async () => {
        this.applyPublicConfig(parsed.config);
        this.authToken = "";
        await this.secrets.remove(SECRET.firebaseRefresh);
        await this.secrets.set(SECRET.teamCode, parsed.code);
        await this.saveSettings();
        new JoinModal(this.app, (email, password, displayName, mode) => this.joinTeam(email, password, displayName, mode)).open();
      }).open();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "초대 링크를 열지 못했어요. 관리자에게 새 링크를 받아 주세요.");
    }
  }

  async joinTeam(email: string, password: string, displayName: string, mode: "signup" | "login"): Promise<string> {
    const code = await this.secrets.get(SECRET.teamCode);
    if (!code || !this.settings.teamId || !this.settings.codeSalt) throw new Error("초대가 없어요. 링크를 다시 열어 주세요.");
    const session = mode === "signup"
      ? await signUpWithPassword(this.http, this.settings.firebaseApiKey, email, password)
      : await signInWithPassword(this.http, this.settings.firebaseApiKey, email, password);
    await this.secrets.set(SECRET.firebaseRefresh, session.refreshToken);
    this.authToken = session.idToken;
    this.settings.firebaseEmail = session.email || email;
    this.settings.displayName = displayName;
    await this.saveSettings();
    await joinTeam(this.http, this.settings.firebaseProjectId, session.idToken, this.settings.teamId, session.localId, displayName, code, this.settings.codeSalt);
    return `${this.settings.teamName || "팀"} 서고에 들어왔어요.`;
  }

  async createInvite(code: string): Promise<{ obsidian: string; web: string; code: string }> {
    const token = await this.token();
    if (!token || !this.settings.firebaseProjectId || !this.settings.firebaseApiKey) {
      throw new Error("웹 설정을 저장하고 로그인한 뒤에 초대 링크를 만들 수 있어요.");
    }
    if (!this.settings.teamName.trim() || !this.settings.displayName.trim()) {
      throw new Error("팀 이름과 표시 이름을 입력해 주세요.");
    }
    const nextCode = code.trim() || generateTeamCode();
    const uid = userIdFromToken(token);
    if (!this.settings.teamId) {
      this.settings.teamId = generateTeamId();
      this.settings.codeSalt = generateCodeSalt();
      await createLibrary(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, uid, "team");
      await createTeam(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, uid, nextCode, this.settings.codeSalt);
    } else {
      this.settings.codeSalt = await updateTeamCode(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, nextCode);
    }
    await joinTeam(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, uid, this.settings.displayName, nextCode, this.settings.codeSalt);
    await this.secrets.set(SECRET.teamCode, nextCode);
    await this.saveSettings();
    return { ...buildInviteLinks(this.publicConfig(), nextCode), code: nextCode };
  }

  deployConfig(): string {
    return encodePublicConfig({ ...this.publicConfig(), ownerUid: "" });
  }

  async connectPersonalLibrary(): Promise<string> {
    const token = await this.token();
    if (!token || !this.settings.firebaseProjectId) throw new Error("웹 설정을 저장하고 로그인한 뒤에 내 클라우드를 연결할 수 있어요.");
    const uid = userIdFromToken(token);
    this.settings.libraryMode = "personal";
    this.settings.teamId = uid;
    this.settings.teamName = "내 서고";
    this.settings.firebaseEnabled = true;
    await createLibrary(this.http, this.settings.firebaseProjectId, token, uid, uid, "personal");
    await this.saveSettings();
    return "내 클라우드에 연결했어요. 글은 기본적으로 나만 볼 수 있어요.";
  }

  async movePersonalNotesToTeam(): Promise<string> {
    if (this.settings.libraryMode !== "personal") throw new Error("개인 서고에서만 팀으로 옮길 수 있어요.");
    const token = await this.token();
    if (!token) throw new Error("로그인이 필요해요. 설정에서 다시 로그인해 주세요.");
    const uid = userIdFromToken(token);
    const notes = await listResearchNotes(this.http, this.settings.firebaseProjectId, token, "", uid);
    const teamId = generateTeamId();
    const code = generateTeamCode();
    const salt = generateCodeSalt();
    await createTeam(this.http, this.settings.firebaseProjectId, token, teamId, uid, code, salt);
    await joinTeam(this.http, this.settings.firebaseProjectId, token, teamId, uid, this.shownName(), code, salt);
    for (const note of notes) {
      await upsertResearchNote(this.http, this.settings.firebaseProjectId, token, { ...note, team_id: teamId, briefing_public: true });
    }
    await updateLibrary(this.http, this.settings.firebaseProjectId, token, teamId, "team");
    this.settings.libraryMode = "team";
    this.settings.teamId = teamId;
    this.settings.teamName = this.settings.teamName || "팀";
    this.settings.codeSalt = salt;
    await this.secrets.set(SECRET.teamCode, code);
    await this.saveSettings();
    return `팀 서고로 옮겼어요. 초대 코드는 ${code}예요.`;
  }

  listTeamMembers(): Promise<TeamMember[]> {
    return this.token().then((token) => {
      if (!token || !this.settings.teamId) return [];
      return listMembers(this.http, this.settings.firebaseProjectId, token, this.settings.teamId);
    });
  }

  async removeTeamMember(uid: string): Promise<string> {
    const token = await this.token();
    if (!token || !this.settings.teamId) throw new Error("로그인과 팀이 필요해요.");
    await removeMember(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, uid);
    const code = generateTeamCode();
    this.settings.codeSalt = await updateTeamCode(this.http, this.settings.firebaseProjectId, token, this.settings.teamId, code);
    await this.secrets.set(SECRET.teamCode, code);
    await this.saveSettings();
    return code;
  }

  private publicConfig(): PublicFirebaseConfig {
    return {
      projectId: this.settings.firebaseProjectId,
      apiKey: this.settings.firebaseApiKey,
      teamId: this.settings.teamId,
      teamName: this.settings.teamName || "팀",
      adminName: this.settings.displayName || "관리자",
      codeSalt: this.settings.codeSalt,
      mode: this.settings.libraryMode === "personal" ? "personal" : "team",
      ownerUid: this.settings.libraryMode === "personal" ? this.settings.teamId : "",
      briefingUrl: this.settings.briefingUrl,
    };
  }

  private applyPublicConfig(config: PublicFirebaseConfig): void {
    this.settings.firebaseProjectId = config.projectId;
    this.settings.firebaseApiKey = config.apiKey;
    this.settings.teamId = config.teamId;
    this.settings.teamName = config.teamName;
    this.settings.codeSalt = config.codeSalt;
    if (config.adminName) this.settings.displayName = this.settings.displayName || config.adminName;
    this.settings.firebaseEnabled = true;
    if (config.briefingUrl) this.settings.briefingUrl = config.briefingUrl;
  }

  async login(password: string): Promise<string> {
    try {
      const session = await signInWithPassword(this.http, this.settings.firebaseApiKey, this.settings.firebaseEmail, password);
      await this.secrets.set(SECRET.firebaseRefresh, session.refreshToken);
      this.authToken = session.idToken;
      return t("settings.loggedIn", { email: session.email || this.settings.firebaseEmail });
    } catch (error) {
      return error instanceof Error ? `${error.message} ${t("upload.vaultSafe")}` : t("upload.vaultSafe");
    }
  }

  private async collect(hits: SearchHit[], query: string, summarize: boolean): Promise<void> {
    const fresh = hits.filter((hit) => !findDuplicate(hit, savedNoteRefs(this.app)));
    const already = hits.length - fresh.length;
    if (!fresh.length) {
      new Notice(already ? "이미 있는 자료라 다시 저장하지 않았어요." : "저장할 자료가 없어요.");
      return;
    }
    const jobs: JobView[] = fresh.map((hit) => ({
      id: hit.sourceId,
      title: hit.title,
      url: hit.url,
      source: hit.source,
      hasPdf: hit.hasPdf,
      stage: "wait",
    }));
    const session = new CollectSession(jobs);
    this.session = session;
    const modal = new ProgressModal(
      this.app,
      session,
      (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file) void this.app.workspace.getLeaf(false).openFile(file as TFile);
      },
      () => {
        const saved = session.jobs.filter((job) => job.stage === "done");
        void this.confirmUpload(saved.map((job) => job.id));
      },
      (job) => {
        const hit = hits.find((item) => item.sourceId === job.id);
        if (hit) void this.collectOne(session, hit, query, summarize, (files) => modal.choose(files));
      },
    );
    modal.open();
    const stop = session.subscribe(() => {
      this.status?.setText(session.finished ? "" : t("progress.status", { done: session.doneCount, total: session.jobs.length }));
    });
    for (const hit of fresh) await this.collectOne(session, hit, query, summarize, (files) => modal.choose(files));
    stop();
    this.status?.setText("");
    const ok = session.jobs.filter((job) => job.stage === "done").length;
    const skipped = session.jobs.filter((job) => job.stage === "error").length + already;
    new Notice(batchSummary(ok, skipped));
  }

  private async collectOne(
    session: CollectSession,
    hit: SearchHit,
    query: string,
    summarize: boolean,
    choose: (files: Attachment[]) => Promise<Attachment | null>,
  ): Promise<void> {
    const keys = await this.keys();
    const keyName = SECRET[this.settings.aiProvider];
    const summaryKey = await this.secrets.get(keyName);
    await runJob(session, hit, query, summarize, {
      ctx: this.context(keys),
      settings: this.settings,
      choose,
      write: async (folder, filename, markdown) => {
        const file = await createNote(this.app, folder, filename, markdown);
        return file.path;
      },
      summaryKey,
      summaryUsed: collectedToday(this.settings),
    });
    if (summarize && summaryKey) {
      this.settings.summaryCountDate = new Date().toISOString().slice(0, 10);
      this.settings.summaryCount = collectedToday(this.settings) + 1;
      await this.saveSettings();
    }
  }

  private async confirmUpload(sourceIds: string[]): Promise<void> {
    if (!sourceIds.length) return;
    const existing = new Set((await this.remoteIds()).map((id) => id));
    const map = notesBySourceId(this.app);
    const items = sourceIds.flatMap((id) => {
      const file = map.get(id);
      return file ? [{ title: file.basename, sourceId: id, updating: existing.has(id) }] : [];
    });
    new UploadModal(this.app, items, (plan) => {
      void this.uploadIds(sourceIds, plan);
    }).open();
  }

  private async shareFiles(files: TFile[]): Promise<void> {
    if (this.settings.libraryMode === "solo") {
      new Notice("혼자 쓰기에서는 노트가 내 볼트에만 있어요. 클라우드로 올리려면 설정에서 내 클라우드를 연결해 주세요.");
      return;
    }
    const items = files.map((file) => ({
      title: file.basename,
      sourceId: String(this.app.metadataCache.getFileCache(file)?.frontmatter?.source_id ?? file.path),
      updating: false,
    }));
    new UploadModal(this.app, items, (plan) => {
      void this.uploadIds(items.map((item) => item.sourceId), plan);
    }).open();
  }

  private async uploadIds(sourceIds: string[], plan: UploadPlan): Promise<void> {
    try {
      const token = await this.token();
      if (!token) {
        new Notice(`로그인이 필요해요. ${t("upload.vaultSafe")}`);
        return;
      }
      if (!this.settings.teamId) {
        new Notice("팀 서고 탭에서 초대 링크를 만들어 가입한 뒤에 올릴 수 있어요.");
        return;
      }
      const ownerUid = userIdFromToken(token);
      const map = notesBySourceId(this.app);
      let count = 0;
      for (const id of sourceIds) {
        const file = map.get(id);
        if (!file) continue;
        const raw = await this.app.vault.read(file);
        const front = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const body = raw.replace(/^---[\s\S]*?---\r?\n?/, "");
        let note: ResearchNote = {
          title: String(front.title ?? file.basename),
          series: String(front.series ?? ""),
          source: String(front.source ?? ""),
          source_id: id,
          doc_id: "",
          team_id: this.settings.teamId,
          type: String(front.type ?? ""),
          publisher: String(front.publisher ?? ""),
          author: Array.isArray(front.author) ? front.author.map(String) : front.author ? [String(front.author)] : [],
          published: String(front.published ?? ""),
          url: String(front.url ?? ""),
          pdf_url: String(front.pdf_url ?? ""),
          query: String(front.query ?? ""),
          keywords: Array.isArray(front.keywords) ? front.keywords.map(String) : [],
          collected: String(front.collected ?? ""),
          converter: String(front.converter ?? ""),
          convert_warnings: Number(front.convert_warnings ?? 0),
          summary_model: String(front.summary_model ?? ""),
          team_shared: this.settings.libraryMode === "team",
          briefing_public: this.settings.libraryMode === "team" || this.settings.shareOnBriefing,
          tags: Array.isArray(front.tags) ? front.tags.map(String) : [],
          summary: summaryFrom(raw),
          body,
          excerpt: "",
          owner_email: this.settings.firebaseEmail,
          display_name: this.shownName(),
          owner_uid: ownerUid,
          uploaded_at: new Date().toISOString(),
          locked: false,
          title_hidden: false,
          lock_salt: "",
          lock_iterations: 0,
          lock_iv: "",
          lock_ciphertext: "",
          locked_chunks: [],
        };
        const password = plan.passwords[id];
        if (password) note = await lockResearchNote(note, password, plan.hideTitle);
        await upsertResearchNote(this.http, this.settings.firebaseProjectId, token, note);
        count += 1;
      }
      this.settings.lastSyncAt = new Date().toISOString();
      this.settings.lastSyncCount = count;
      await this.saveSettings();
      const briefing = this.settings.briefingUrl;
      const notice = new Notice(t("upload.done", { count }));
      if (briefing) {
        const button = notice.noticeEl.createEl("button", { text: t("upload.viewBriefing") });
        button.addEventListener("click", () => window.open(briefing));
      }
    } catch (error) {
      new Notice(error instanceof Error ? `${error.message} ${t("upload.vaultSafe")}` : t("upload.vaultSafe"));
    }
  }

  private async openShared(sourceId: string): Promise<void> {
    if (!sourceId) return;
    const local = notesBySourceId(this.app).get(sourceId);
    if (local) {
      await this.app.workspace.getLeaf(false).openFile(local);
      return;
    }
    let note = await getResearchNote(this.http, this.settings.firebaseProjectId, "", sourceId, this.settings.firebaseApiKey);
    if (!note) {
      new Notice("팀 서고에 그 노트가 없어요.");
      return;
    }
    if (note.locked) {
      const password = await askPassword(this.app, "이 자료는 비밀번호로 잠겨 있어요.");
      if (!password) return;
      try {
        note = await unlockResearchNote(note, password);
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "비밀번호가 맞지 않아요");
        return;
      }
    }
    const markdown = buildMarkdown(note, note.body, this.settings.fields, []);
    const file = await createNote(this.app, this.settings.noteFolder, note.title, markdown);
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  private async changeLock(file: TFile): Promise<void> {
    const sourceId = String(this.app.metadataCache.getFileCache(file)?.frontmatter?.source_id ?? "");
    if (!sourceId) {
      new Notice("이 노트에는 source_id가 없어요.");
      return;
    }
    const token = await this.token();
    if (!token) {
      new Notice(`로그인이 필요해요. ${t("upload.vaultSafe")}`);
      return;
    }
    const uid = userIdFromToken(token);
    const remote = await getResearchNote(this.http, this.settings.firebaseProjectId, token, await noteDocumentId(this.settings.teamId, uid, sourceId));
    if (!remote) {
      new Notice("팀 서고에 이 노트가 없어요.");
      return;
    }
    if (remote.owner_uid && remote.owner_uid !== uid) {
      new Notice("본인이 올린 문서만 잠금을 바꿀 수 있어요.");
      return;
    }
    const answer = await askPasswordChange(this.app);
    if (!answer) return;
    try {
      const opened = remote.locked ? await unlockResearchNote(remote, answer.current) : remote;
      const next = answer.next ? await lockResearchNote({ ...opened, owner_uid: uid }, answer.next, answer.hideTitle) : { ...opened, owner_uid: uid, locked: false };
      await upsertResearchNote(this.http, this.settings.firebaseProjectId, token, next);
      new Notice(answer.next ? "비밀번호를 바꿨어요." : "잠금을 해제했어요.");
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "비밀번호가 맞지 않아요");
    }
  }

  private async remoteIds(): Promise<string[]> {
    const token = await this.token();
    if (!token || !this.settings.firebaseProjectId) return [];
    try {
      const notes = this.settings.libraryMode === "personal"
        ? await listResearchNotes(this.http, this.settings.firebaseProjectId, token, "", userIdFromToken(token))
        : await listResearchNotes(this.http, this.settings.firebaseProjectId, token, this.settings.teamId);
      return notes.map((note) => note.source_id);
    } catch {
      return [];
    }
  }

  private async token(): Promise<string> {
    if (this.authToken) return this.authToken;
    const refresh = await this.secrets.get(SECRET.firebaseRefresh);
    if (!refresh || !this.settings.firebaseApiKey) return "";
    const session = await refreshSession(this.http, this.settings.firebaseApiKey, refresh);
    this.authToken = session.idToken;
    if (session.refreshToken) await this.secrets.set(SECRET.firebaseRefresh, session.refreshToken);
    return session.idToken;
  }

  private shownName(): string {
    const named = this.settings.displayName.trim();
    if (named) return named.slice(0, 40);
    const local = this.settings.firebaseEmail.split("@")[0] ?? "";
    return local.slice(0, 40) || "팀원";
  }

  private async keys(): Promise<Partial<Record<SourceId, string>>> {
    return {
      kci: (await this.secrets.get(SECRET.kci)) ?? "",
      riss: (await this.secrets.get(SECRET.riss)) ?? "",
      openalex: (await this.secrets.get(SECRET.openalex)) ?? "",
    };
  }

  private context(keys: Partial<Record<SourceId, string>>): SourceContext {
    return { http: this.http, keys, openalexMailto: this.settings.openalexMailto };
  }
}

function summaryFrom(markdown: string): string {
  const match = markdown.match(/> \[!summary\]- AI 요약\n([\s\S]*?)(?:\n\n|$)/);
  return (match?.[1] ?? "").replace(/^> ?/gm, "").trim();
}
