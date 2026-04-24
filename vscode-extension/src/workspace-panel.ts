import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

type ChatAgent = 'ideation' | 'components' | 'projectAI' | 'design';

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
};

type AuthState = {
  loading: boolean;
  error: string;
  mode: 'login' | 'signup';
  email: string;
  password: string;
  fullName: string;
  user: any | null;
  token: string;
};

type ProjectState = {
  loading: boolean;
  error: string;
  items: any[];
  activeId: string;
  active: any | null;
  createDescription: string;
  editDescription: string;
  editWokwiUrl: string;
};

type RepoState = {
  loading: boolean;
  error: string;
  rootPath: string;
  files: string[];
  sketchPath: string;
  diagramPath: string;
  configPath: string;
};

type ChatState = {
  loading: boolean;
  input: string;
  agent: ChatAgent;
  messages: Record<ChatAgent, ChatMessage[]>;
};

type ChipState = {
  catalog: Array<Record<string, any>>;
  selectedId: string;
  customName: string;
  customPartType: string;
  customCategory: string;
  customPins: string;
  customNotes: string;
  customAuthor: string;
  error: string;
};

type SimulatorState = {
  active: boolean;
  minimized: boolean;
  status: string;
};

type WorkspaceState = {
  auth: AuthState;
  projects: ProjectState;
  repo: RepoState;
  chat: ChatState;
  chips: ChipState;
  simulator: SimulatorState;
  status: string;
};

const CHAT_HISTORY_LIMIT = 50;
const BUILTIN_RELEVANT_EXTENSIONS = new Set(['.ino', '.json', '.toml', '.ini', '.c', '.cpp', '.h', '.hpp', '.md', '.txt']);

const defaultState = (): WorkspaceState => ({
  auth: {
    loading: false,
    error: '',
    mode: 'login',
    email: '',
    password: '',
    fullName: '',
    user: null,
    token: ''
  },
  projects: {
    loading: false,
    error: '',
    items: [],
    activeId: '',
    active: null,
    createDescription: '',
    editDescription: '',
    editWokwiUrl: ''
  },
  repo: {
    loading: false,
    error: '',
    rootPath: '',
    files: [],
    sketchPath: '',
    diagramPath: '',
    configPath: ''
  },
  chat: {
    loading: false,
    input: '',
    agent: 'ideation',
    messages: {
      ideation: [],
      components: [],
      projectAI: [],
      design: []
    }
  },
  chips: {
    catalog: [],
    selectedId: '',
    customName: '',
    customPartType: '',
    customCategory: '',
    customPins: '',
    customNotes: '',
    customAuthor: 'NovaAI',
    error: ''
  },
  simulator: {
    active: false,
    minimized: false,
    status: 'Idle'
  },
  status: 'Ready'
});

const escapeHtml = (value: unknown): string => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const isRelevantFile = (filePath: string): boolean => {
  const lowered = filePath.toLowerCase();
  if (lowered.endsWith('diagram.json') || lowered.endsWith('wokwi.toml') || lowered.endsWith('wokwi.ini')) {
    return true;
  }

  return BUILTIN_RELEVANT_EXTENSIONS.has(path.extname(lowered));
};

export class NovaAIWorkspaceViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private state: WorkspaceState = defaultState();

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    await this.restorePersistedState();
    await this.bootstrapAuth();
    await this.refreshChipCatalog();
    await this.refreshProjects();
    if (this.state.projects.activeId) {
      await this.openProject(this.state.projects.activeId, false);
    }

    view.webview.html = this.renderHtml();
    view.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
  }

  private get backendUrl(): string {
    const configured = vscode.workspace.getConfiguration('NovaAI').get<string>('backendUrl');
    return configured && configured.trim() ? configured.trim().replace(/\/$/, '') : 'http://localhost:5000';
  }

  private async restorePersistedState(): Promise<void> {
    this.state.auth.token = this.context.workspaceState.get<string>('NovaAI.authToken', '');
    this.state.auth.user = this.context.workspaceState.get<any>('NovaAI.authUser', null);
    this.state.projects.activeId = this.context.workspaceState.get<string>('NovaAI.activeProjectId', '');
    this.state.repo.rootPath = this.context.workspaceState.get<string>('NovaAI.repoPath', '');
    this.state.chat.agent = this.context.workspaceState.get<ChatAgent>('NovaAI.activeAgent', 'ideation');
    this.state.simulator.active = this.context.workspaceState.get<boolean>('NovaAI.simulatorActive', false);
    this.state.simulator.minimized = this.context.workspaceState.get<boolean>('NovaAI.simulatorMinimized', false);
  }

  private async persistState(): Promise<void> {
    await this.context.workspaceState.update('NovaAI.authToken', this.state.auth.token);
    await this.context.workspaceState.update('NovaAI.authUser', this.state.auth.user);
    await this.context.workspaceState.update('NovaAI.activeProjectId', this.state.projects.activeId);
    await this.context.workspaceState.update('NovaAI.repoPath', this.state.repo.rootPath);
    await this.context.workspaceState.update('NovaAI.activeAgent', this.state.chat.agent);
    await this.context.workspaceState.update('NovaAI.simulatorActive', this.state.simulator.active);
    await this.context.workspaceState.update('NovaAI.simulatorMinimized', this.state.simulator.minimized);
  }

  private async bootstrapAuth(): Promise<void> {
    if (!this.state.auth.token) {
      return;
    }

    try {
      const response = await this.apiFetch('/api/auth/check');
      if (!response.ok) {
        throw new Error('Session expired');
      }

      const user: any = await response.json();
      this.state.auth.user = user;
      this.state.auth.error = '';
      this.state.status = `Signed in as ${user?.fullName || user?.email || 'user'}`;
    } catch {
      this.state.auth.token = '';
      this.state.auth.user = null;
      this.state.status = 'Session expired';
    }
  }

  private async apiFetch(route: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers || {});
    if (!(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.state.auth.token) {
      headers.set('Authorization', `Bearer ${this.state.auth.token}`);
    }

    const response = await fetch(`${this.backendUrl}${route}`, {
      ...init,
      headers
    });

    return response;
  }

  private async readResponseError(response: Response, fallback: string): Promise<string> {
    try {
      const payload: any = await response.json();
      return String(payload?.error || payload?.message || fallback);
    } catch {
      return fallback;
    }
  }

  private updateStatus(message: string): void {
    this.state.status = message;
    void this.persistState();
    this.render();
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.renderHtml();
  }

  private async refreshProjects(): Promise<void> {
    if (!this.state.auth.token) {
      this.state.projects.items = [];
      this.state.projects.active = null;
      this.state.projects.loading = false;
      return;
    }

    this.state.projects.loading = true;
    this.render();

    try {
      const response = await this.apiFetch('/api/projects');
      if (!response.ok) {
        throw new Error(await this.readResponseError(response, 'Failed to load projects'));
      }

      this.state.projects.items = (await response.json()) as any[];
      this.state.projects.error = '';
    } catch (error) {
      this.state.projects.error = error instanceof Error ? error.message : 'Failed to load projects';
    } finally {
      this.state.projects.loading = false;
      this.render();
    }
  }

  private async loadProjectHistories(projectId: string): Promise<void> {
    const loadMessages = async (route: string, fallback: ChatMessage[]) => {
      try {
        const response = await this.apiFetch(route);
        if (!response.ok) {
          return fallback;
        }

        const payload: any = await response.json();
        return Array.isArray(payload?.messages) ? payload.messages : fallback;
      } catch {
        return fallback;
      }
    };

    const active = this.state.projects.active || {};
    this.state.chat.messages.ideation = await loadMessages(`/api/project/${projectId}/history/ideation`, active.messages || []);
    this.state.chat.messages.components = await loadMessages(`/api/project/${projectId}/history/components`, active.componentsMessages || []);
    this.state.chat.messages.projectAI = await loadMessages(`/api/project-ai/history/${projectId}`, active.projectAiMessages || []);
    this.state.chat.messages.design = active.designMessages || [];
  }

  private async openProject(projectId: string, refresh = true): Promise<void> {
    if (!projectId) {
      this.state.projects.activeId = '';
      this.state.projects.active = null;
      this.state.repo.rootPath = '';
      return;
    }

    try {
      if (refresh) {
        const response = await this.apiFetch(`/api/project/${projectId}`);
        if (!response.ok) {
          throw new Error(await this.readResponseError(response, 'Failed to open project'));
        }

        this.state.projects.active = await response.json();
      }

      this.state.projects.activeId = projectId;
      this.state.projects.editDescription = this.state.projects.active?.description || '';
      this.state.projects.editWokwiUrl = this.state.projects.active?.wokwiUrl || '';
      this.state.repo.rootPath = this.state.projects.active?.wokwiProjectPath || this.state.repo.rootPath || '';
      await this.scanRepo(this.state.repo.rootPath);
      await this.loadProjectHistories(projectId);
      this.state.projects.error = '';
      this.state.status = 'Project loaded';
      await this.persistState();
    } catch (error) {
      this.state.projects.error = error instanceof Error ? error.message : 'Failed to open project';
    } finally {
      this.render();
    }
  }

  private async refreshChipCatalog(): Promise<void> {
    try {
      const catalogPath = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'data', 'chips.json');
      const raw = await fs.readFile(catalogPath.fsPath, 'utf8');
      const builtIn = JSON.parse(raw);
      const entries = Array.isArray(builtIn) ? builtIn : [];
      const custom = await this.loadCustomChipCatalog();
      this.state.chips.catalog = [...entries, ...custom];
      this.state.chips.selectedId = this.state.chips.selectedId || this.state.chips.catalog[0]?.id || '';
    } catch {
      this.state.chips.catalog = [];
    }
  }

  private async loadCustomChipCatalog(): Promise<Array<Record<string, any>>> {
    const root = this.state.repo.rootPath || this.getDefaultLocalRoot();
    const catalogPath = path.join(root, '.NovaAI', 'chips.json');

    try {
      const raw = await fs.readFile(catalogPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private getDefaultLocalRoot(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return workspaceRoot;
    }

    return path.join(os.homedir(), 'Documents', 'NovaAI');
  }

  private async scanRepo(rootPath: string): Promise<void> {
    if (!rootPath) {
      this.state.repo.files = [];
      this.state.repo.sketchPath = '';
      this.state.repo.diagramPath = '';
      this.state.repo.configPath = '';
      return;
    }

    this.state.repo.loading = true;
    this.render();

    const results: string[] = [];
    const queue = [path.resolve(rootPath)];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      let entries: Array<vscode.FileType | any> = [];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.vscode') {
            queue.push(fullPath);
          }
        } else {
          results.push(fullPath);
        }
      }
    }

    this.state.repo.files = results.sort((left, right) => left.localeCompare(right));
    this.state.repo.sketchPath = this.state.repo.files.find((filePath) => filePath.toLowerCase().endsWith('.ino')) || '';
    this.state.repo.diagramPath = this.state.repo.files.find((filePath) => filePath.toLowerCase().endsWith('diagram.json')) || '';
    this.state.repo.configPath = this.state.repo.files.find((filePath) => {
      const lowered = filePath.toLowerCase();
      return lowered.endsWith('wokwi.toml') || lowered.endsWith('wokwi.ini') || lowered.endsWith('diagram.ini');
    }) || '';
    this.state.repo.loading = false;
    this.render();
  }

  private async selectRepoFolder(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Hardware Repo'
    });

    if (!picked || picked.length === 0) {
      return;
    }

    const rootPath = picked[0].fsPath;
    this.state.repo.rootPath = rootPath;
    await this.context.workspaceState.update('NovaAI.repoPath', rootPath);
    await this.scanRepo(rootPath);

    if (this.state.projects.activeId) {
      await this.apiFetch(`/api/project/${this.state.projects.activeId}`, {
        method: 'PUT',
        body: JSON.stringify({ wokwiProjectPath: rootPath })
      });
      await this.openProject(this.state.projects.activeId);
    }

    this.state.chips.catalog = [...this.state.chips.catalog.filter((item) => !item.__custom), ...(await this.loadCustomChipCatalog())];
    this.state.status = `Hardware repo selected: ${rootPath}`;
    this.render();
  }

  private async loginOrSignup(): Promise<void> {
    const payload: Record<string, string> = {
      email: this.state.auth.email,
      password: this.state.auth.password
    };

    if (this.state.auth.mode === 'signup') {
      payload.fullName = this.state.auth.fullName;
    }

    const route = this.state.auth.mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    this.state.auth.loading = true;
    this.render();

    try {
      const response = await this.apiFetch(route, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(await this.readResponseError(response, 'Authentication failed'));
      }

      const data: any = await response.json();
      this.state.auth.user = data;
      this.state.auth.token = String(data?.token || '');
      this.state.auth.error = '';
      this.state.status = `Signed in as ${data?.fullName || data?.email || 'user'}`;
      await this.persistState();
      await this.refreshProjects();
      this.render();
    } catch (error) {
      this.state.auth.error = error instanceof Error ? error.message : 'Authentication failed';
      this.render();
    } finally {
      this.state.auth.loading = false;
      this.render();
    }
  }

  private async logout(): Promise<void> {
    try {
      await this.apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout failures in offline or stale-session cases
    }

    this.state = defaultState();
    await this.persistState();
    await this.refreshChipCatalog();
    this.render();
  }

  private async createProject(): Promise<void> {
    if (!this.state.projects.createDescription.trim()) {
      this.state.projects.error = 'Project description is required';
      this.render();
      return;
    }

    this.state.projects.loading = true;
    this.render();

    try {
      const response = await this.apiFetch('/api/project', {
        method: 'POST',
        body: JSON.stringify({ description: this.state.projects.createDescription.trim() })
      });

      if (!response.ok) {
        throw new Error(await this.readResponseError(response, 'Failed to create project'));
      }

      const data: any = await response.json();
      this.state.projects.createDescription = '';
      this.state.projects.activeId = String(data?.projectId || '');
      this.state.projects.error = '';
      await this.refreshProjects();
      await this.openProject(this.state.projects.activeId);
      this.state.chat.messages.ideation = [{ role: 'ai', content: String(data?.reply || '') } as ChatMessage];
      this.state.chat.agent = 'ideation';
      await this.persistState();
    } catch (error) {
      this.state.projects.error = error instanceof Error ? error.message : 'Failed to create project';
    } finally {
      this.state.projects.loading = false;
      this.render();
    }
  }

  private async updateProject(): Promise<void> {
    if (!this.state.projects.activeId) {
      return;
    }

    const body: Record<string, string> = {};
    if (this.state.projects.editDescription.trim()) {
      body.description = this.state.projects.editDescription.trim();
    }

    body.wokwiUrl = this.state.projects.editWokwiUrl.trim();
    body.wokwiProjectPath = this.state.repo.rootPath.trim();

    const response = await this.apiFetch(`/api/project/${this.state.projects.activeId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(await this.readResponseError(response, 'Failed to update project'));
    }

    await this.openProject(this.state.projects.activeId);
    this.state.status = 'Project updated';
    this.render();
  }

  private async deleteProject(projectId: string): Promise<void> {
    const response = await this.apiFetch(`/api/project/${projectId}`, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(await this.readResponseError(response, 'Failed to delete project'));
    }

    await this.refreshProjects();
    if (this.state.projects.activeId === projectId) {
      this.state.projects.activeId = '';
      this.state.projects.active = null;
      this.state.chat.messages.ideation = [];
      this.state.chat.messages.components = [];
      this.state.chat.messages.projectAI = [];
      this.state.chat.messages.design = [];
    }

    this.state.status = 'Project deleted';
    await this.persistState();
    this.render();
  }

  private async initAgent(agent: ChatAgent): Promise<void> {
    if (!this.state.projects.activeId) {
      return;
    }

    if (agent === 'ideation') {
      if (!this.state.chat.messages.ideation.length) {
        this.state.chat.messages.ideation = [{
          role: 'ai',
          content: 'IdeationAI is ready. Ask for a concept, requirements, or the next missing detail.'
        }];
      }
      this.render();
      return;
    }

    const route = agent === 'components'
      ? '/api/components/init'
      : agent === 'design'
        ? '/api/design/init'
        : '/api/project-ai/init';

    const payload: Record<string, string> = { projectId: this.state.projects.activeId };

    const response = await this.apiFetch(route, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await this.readResponseError(response, `Failed to initialize ${agent}`));
    }

    const data: any = await response.json();
    if (typeof data?.reply === 'string' && data.reply.trim()) {
      this.state.chat.messages[agent] = [{ role: 'ai', content: data.reply } as ChatMessage];
    }
  }

  private async sendChat(): Promise<void> {
    if (!this.state.projects.activeId || !this.state.chat.input.trim() || this.state.chat.loading) {
      return;
    }

    const message = this.state.chat.input.trim();
    const agent = this.state.chat.agent;
    const route = agent === 'ideation'
      ? '/api/project/chat'
      : agent === 'components'
        ? '/api/components/chat'
        : agent === 'design'
          ? '/api/design/chat'
          : '/api/project-ai/chat';

    const body = agent === 'projectAI'
      ? { projectId: this.state.projects.activeId, message, projectPath: this.state.repo.rootPath }
      : { projectId: this.state.projects.activeId, message };

    this.state.chat.messages[agent] = [...(this.state.chat.messages[agent] || []), { role: 'user', content: message } as ChatMessage].slice(-CHAT_HISTORY_LIMIT);
    this.state.chat.input = '';
    this.state.chat.loading = true;
    this.render();

    try {
      const response = await this.apiFetch(route, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(await this.readResponseError(response, `Failed to send ${agent} message`));
      }

      const data: any = await response.json();
      if (typeof data?.reply === 'string') {
        this.state.chat.messages[agent] = [...this.state.chat.messages[agent], { role: 'ai', content: data.reply } as ChatMessage].slice(-CHAT_HISTORY_LIMIT);
      }

      if (agent === 'ideation' && data?.ideaState) {
        this.state.projects.active = { ...(this.state.projects.active || {}), ideaState: data.ideaState };
      }

      if (agent === 'components' && data?.componentsState) {
        this.state.projects.active = { ...(this.state.projects.active || {}), componentsState: data.componentsState };
      }

      if (agent === 'design' && data?.designState) {
        this.state.projects.active = { ...(this.state.projects.active || {}), designState: data.designState };
      }

      if (agent === 'projectAI' && data?.projectAiState) {
        this.state.projects.active = { ...(this.state.projects.active || {}), projectAiState: data.projectAiState };
      }

      this.state.status = `${agent} updated`;
    } catch (error) {
      this.state.projects.error = error instanceof Error ? error.message : `Failed to send ${agent} message`;
    } finally {
      this.state.chat.loading = false;
      await this.persistState();
      this.render();
    }
  }

  private async generateAndWriteFiles(): Promise<void> {
    if (!this.state.projects.activeId) {
      return;
    }

    this.state.chat.loading = true;
    this.render();

    try {
      const prompt = this.state.chat.input.trim() || 'Generate sketch.ino and diagram.json from the current project context and selected repo.';
      const response = await this.apiFetch('/api/components/generate-files', {
        method: 'POST',
        body: JSON.stringify({ projectId: this.state.projects.activeId, userPrompt: prompt })
      });

      if (!response.ok) {
        throw new Error(await this.readResponseError(response, 'Failed to generate files'));
      }

      const data: any = await response.json();
      const generated = data?.generated || {};

      if (!this.state.repo.rootPath) {
        throw new Error('Select a hardware repo before writing files');
      }

      const targetSketch = this.state.repo.sketchPath || path.join(this.state.repo.rootPath, 'sketch.ino');
      const targetDiagram = this.state.repo.diagramPath || path.join(this.state.repo.rootPath, 'diagram.json');

      await fs.mkdir(path.dirname(targetSketch), { recursive: true });
      await fs.mkdir(path.dirname(targetDiagram), { recursive: true });

      await fs.writeFile(targetSketch, String(generated?.sketchIno || ''), 'utf8');
      await fs.writeFile(targetDiagram, JSON.stringify(generated?.diagramJson || {}, null, 2), 'utf8');

      await this.scanRepo(this.state.repo.rootPath);
      this.state.chat.messages.components = [
        ...this.state.chat.messages.components,
        { role: 'ai', content: `Generated and wrote ${path.basename(targetSketch)} + ${path.basename(targetDiagram)} to ${this.state.repo.rootPath}` } as ChatMessage
      ].slice(-CHAT_HISTORY_LIMIT);
      this.state.status = 'Files generated and written locally';
    } catch (error) {
      this.state.projects.error = error instanceof Error ? error.message : 'Failed to generate files';
    } finally {
      this.state.chat.loading = false;
      await this.persistState();
      this.render();
    }
  }

  private async saveCustomChip(): Promise<void> {
    if (!this.state.repo.rootPath) {
      this.state.chips.error = 'Select a hardware repo before saving custom chips';
      this.render();
      return;
    }

    const chip = {
      id: this.state.chips.customPartType.trim() || this.state.chips.customName.trim().toLowerCase().replace(/\s+/g, '-') || 'custom-chip',
      name: this.state.chips.customName.trim() || 'Custom Chip'
    };

    const payload = {
      ...chip,
      partType: this.state.chips.customPartType.trim() || chip.id,
      category: this.state.chips.customCategory.trim(),
      pins: this.state.chips.customPins.split(',').map((pin) => pin.trim()).filter(Boolean),
      notes: this.state.chips.customNotes.trim(),
      author: this.state.chips.customAuthor.trim() || 'NovaAI'
    };

    const customPath = path.join(this.state.repo.rootPath, '.NovaAI', 'chips.json');
    await fs.mkdir(path.dirname(customPath), { recursive: true });

    let existing: any[] = [];
    try {
      const raw = await fs.readFile(customPath, 'utf8');
      const parsed = JSON.parse(raw);
      existing = Array.isArray(parsed) ? parsed : [];
    } catch {
      existing = [];
    }

    const next = [...existing.filter((entry) => entry.id !== payload.id), payload];
    await fs.writeFile(customPath, JSON.stringify(next, null, 2), 'utf8');
    await this.refreshChipCatalog();
    this.state.chips.error = '';
    this.state.status = `Saved custom chip to ${customPath}`;
    this.render();
  }

  private async runSimulator(): Promise<void> {
    const rootPath = this.state.repo.rootPath || this.state.projects.active?.wokwiProjectPath || '';
    if (!rootPath) {
      this.state.simulator.status = 'Select a hardware repo first';
      this.render();
      return;
    }

    try {
      await this.ensureWorkspaceContainsPath(rootPath);
      if (this.state.repo.configPath) {
        await vscode.commands.executeCommand('wokwi-vscode.selectConfigFile', vscode.Uri.file(this.state.repo.configPath));
      }

      const fileToOpen = this.state.repo.sketchPath || this.state.repo.diagramPath || rootPath;
      if (fileToOpen) {
        const document = await vscode.workspace.openTextDocument(fileToOpen);
        await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
      }

      await vscode.commands.executeCommand('wokwi-vscode.start');
      this.state.simulator.active = true;
      this.state.simulator.minimized = true;
      this.state.simulator.status = `Running Wokwi for ${rootPath}`;
      this.state.status = 'Simulator launched';
      await this.persistState();
      this.render();
    } catch (error) {
      this.state.simulator.status = error instanceof Error ? error.message : 'Failed to launch simulator';
      this.render();
    }
  }

  private async ensureWorkspaceContainsPath(targetPath: string): Promise<void> {
    const targetNormalized = path.resolve(targetPath).toLowerCase();
    const existing = vscode.workspace.workspaceFolders ?? [];

    const alreadyPresent = existing.some((folder) => {
      const folderPath = path.resolve(folder.uri.fsPath).toLowerCase();
      return targetNormalized === folderPath || targetNormalized.startsWith(`${folderPath}${path.sep}`);
    });

    if (alreadyPresent) {
      return;
    }

    vscode.workspace.updateWorkspaceFolders(existing.length, 0, {
      uri: vscode.Uri.file(targetPath),
      name: path.basename(targetPath)
    });
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message?.command) {
      case 'ready':
        this.render();
        return;
      case 'setAuthMode':
        this.state.auth.mode = message?.mode === 'signup' ? 'signup' : 'login';
        this.render();
        return;
      case 'loginOrSignup':
        this.state.auth.email = String(message?.email || this.state.auth.email || '');
        this.state.auth.password = String(message?.password || this.state.auth.password || '');
        this.state.auth.fullName = String(message?.fullName || this.state.auth.fullName || '');
        await this.loginOrSignup();
        return;
      case 'logout':
        await this.logout();
        return;
      case 'createProject':
        this.state.projects.createDescription = String(message?.description || this.state.projects.createDescription || '');
        await this.createProject();
        return;
      case 'openProject':
        await this.openProject(String(message?.projectId || ''));
        return;
      case 'deleteProject':
        await this.deleteProject(String(message?.projectId || ''));
        return;
      case 'saveProject':
        this.state.projects.editDescription = String(message?.projectDescription || this.state.projects.editDescription || '');
        this.state.projects.editWokwiUrl = String(message?.wokwiUrl || this.state.projects.editWokwiUrl || '');
        await this.updateProject();
        return;
      case 'selectRepo':
        await this.selectRepoFolder();
        return;
      case 'refreshRepo':
        await this.scanRepo(this.state.repo.rootPath);
        return;
      case 'setAgent':
        this.state.chat.agent = (message?.agent as ChatAgent) || 'ideation';
        await this.context.workspaceState.update('NovaAI.activeAgent', this.state.chat.agent);
        this.render();
        return;
      case 'sendChat':
        this.state.chat.input = String(message?.text || this.state.chat.input || '');
        await this.sendChat();
        return;
      case 'initAgent':
        await this.initAgent((message?.agent as ChatAgent) || this.state.chat.agent);
        this.render();
        return;
      case 'generateFiles':
        await this.generateAndWriteFiles();
        return;
      case 'runSimulator':
        await this.runSimulator();
        return;
      case 'selectChip':
        this.state.chips.selectedId = String(message?.chipId || '');
        this.render();
        return;
      case 'saveCustomChip':
        this.state.chips.customName = String(message?.name || this.state.chips.customName || '');
        this.state.chips.customPartType = String(message?.partType || this.state.chips.customPartType || '');
        this.state.chips.customCategory = String(message?.category || this.state.chips.customCategory || '');
        this.state.chips.customPins = String(message?.pins || this.state.chips.customPins || '');
        this.state.chips.customNotes = String(message?.notes || this.state.chips.customNotes || '');
        this.state.chips.customAuthor = String(message?.author || this.state.chips.customAuthor || 'NovaAI');
        await this.saveCustomChip();
        return;
      case 'toggleSimulatorMinimize':
        this.state.simulator.minimized = !this.state.simulator.minimized;
        await this.persistState();
        this.render();
        return;
      case 'openFile':
        if (typeof message?.path === 'string' && message.path) {
          const document = await vscode.workspace.openTextDocument(message.path);
          await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
        }
        return;
      case 'setStatus':
        this.updateStatus(String(message?.status || 'Ready'));
        return;
      default:
        return;
    }
  }

  private renderHtml(): string {
    const auth = this.state.auth;
    const projects = this.state.projects;
    const repo = this.state.repo;
    const chat = this.state.chat;
    const chips = this.state.chips;
    const simulator = this.state.simulator;

    const activeProject = projects.active || null;
    const activeMessages = chat.messages[chat.agent] || [];
    const builtInCatalog = chips.catalog;
    const selectedChip = builtInCatalog.find((entry) => String(entry.id || entry.partType || '') === chips.selectedId) || builtInCatalog[0] || null;

    const projectListHtml = projects.items.length > 0
      ? projects.items.map((project) => {
          const isActive = String(project?._id || '') === projects.activeId;
          return `
            <button class="project-row ${isActive ? 'active' : ''}" data-command="openProject" data-project-id="${escapeHtml(project?._id || '')}">
              <strong>${escapeHtml(project?.description || 'Untitled Project')}</strong>
              <span>${escapeHtml(project?.wokwiProjectPath || project?.wokwiUrl || 'No repo attached')}</span>
            </button>
          `;
        }).join('')
      : '<div class="empty">No projects yet.</div>';

    const filesToShow = repo.files.slice(0, 60);
    const filesHtml = filesToShow.length > 0
      ? filesToShow.map((filePath) => `
          <div class="file-row">
            <div class="file-path">${escapeHtml(filePath)}</div>
            <button class="ghost" data-command="openFile" data-path="${escapeHtml(filePath)}">Open</button>
          </div>
        `).join('')
      : '<div class="empty">No files scanned yet.</div>';

    const messagesHtml = activeMessages.length > 0
      ? activeMessages.map((message) => `
          <div class="message ${message.role}">
            <div class="message-role">${message.role === 'user' ? 'You' : 'AI'}</div>
            <div class="message-body">${escapeHtml(message.content)}</div>
          </div>
        `).join('')
      : '<div class="empty">No chat yet. Start a conversation or initialize the selected agent.</div>';

    const chipOptions = builtInCatalog.map((entry) => {
      const label = `${entry.name || entry.id || 'Chip'}${entry.partType ? ` • ${entry.partType}` : ''}`;
      return `<option value="${escapeHtml(entry.id || entry.partType || '')}" ${String(entry.id || entry.partType || '') === chips.selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    const chipDetails = selectedChip
      ? `<pre class="json-box">${escapeHtml(JSON.stringify(selectedChip, null, 2))}</pre>`
      : '<div class="empty">No chip catalog loaded.</div>';

    const simulatorClass = simulator.active && simulator.minimized ? 'sim-minimized' : 'sim-expanded';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NovaAI Workspace</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0e1116;
      --panel: #151a21;
      --panel-2: #1b2230;
      --panel-3: #20293a;
      --text: #e8edf5;
      --muted: #91a0b8;
      --accent: #75f0b8;
      --accent-2: #7bb7ff;
      --border: #2b3342;
      --danger: #ff8b8b;
      --shadow: 0 10px 32px rgba(0,0,0,0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top, rgba(123, 183, 255, 0.12), transparent 24%), linear-gradient(180deg, #0d1014 0%, #0e1116 100%);
      color: var(--text);
      font-family: Segoe UI, Arial, sans-serif;
    }
    .shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      background: rgba(14, 17, 22, 0.86);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .brand { display: flex; flex-direction: column; gap: 2px; }
    .brand strong { font-size: 15px; letter-spacing: 0.04em; }
    .brand span, .status { color: var(--muted); font-size: 12px; }
    .top-actions, .button-row, .agent-row, .chip-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .grid {
      display: grid;
      grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      flex: 1;
      min-height: 0;
    }
    .stack, .card { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
    .card {
      background: rgba(21, 26, 33, 0.94);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
      box-shadow: var(--shadow);
    }
    .card h2, .card h3 {
      margin: 0;
      font-size: 13px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent-2);
    }
    .card h3 { color: var(--accent); }
    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input, textarea, select {
      width: 100%;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    textarea { min-height: 96px; resize: vertical; }
    button {
      border: 1px solid var(--border);
      background: var(--panel-3);
      color: var(--text);
      border-radius: 10px;
      padding: 9px 12px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    button.primary { background: linear-gradient(180deg, #2e7d61 0%, #23604b 100%); border-color: rgba(117,240,184,0.35); color: #dff7ec; }
    button.secondary { background: linear-gradient(180deg, #2b3f61 0%, #20314c 100%); border-color: rgba(123,183,255,0.35); }
    button.ghost { padding: 6px 10px; background: transparent; }
    button.danger { background: linear-gradient(180deg, #6b3131 0%, #4b2525 100%); border-color: rgba(255,139,139,0.35); }
    button.small { padding: 6px 10px; }
    button.active { outline: 2px solid rgba(117,240,184,0.45); }
    .divider { height: 1px; background: var(--border); margin: 2px 0; }
    .project-list, .file-list, .message-list { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .project-row, .file-row, .message { width: 100%; text-align: left; }
    .project-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      border: 1px solid var(--border);
      background: rgba(27, 34, 48, 0.92);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .project-row strong { font-size: 13px; }
    .project-row span, .subtle, .empty, .hint, .file-path, .message-role { color: var(--muted); font-size: 12px; }
    .project-row.active { border-color: rgba(117,240,184,0.5); box-shadow: inset 0 0 0 1px rgba(117,240,184,0.15); }
    .file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(27, 34, 48, 0.75);
    }
    .file-path { word-break: break-all; }
    .message { border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; background: rgba(27, 34, 48, 0.8); }
    .message.user { border-color: rgba(123,183,255,0.35); background: rgba(39, 58, 88, 0.45); }
    .message.ai { border-color: rgba(117,240,184,0.28); }
    .message-body { white-space: pre-wrap; line-height: 1.45; font-size: 13px; }
    .message-role { margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
    .main { min-height: 0; display: flex; flex-direction: column; gap: 12px; }
    .chat-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
      gap: 12px;
      min-height: 0;
      flex: 1;
    }
    .chat-card, .sim-card { min-height: 0; }
    .chat-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .chat-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
      flex: 1;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: auto;
      flex: 1;
      min-height: 260px;
      max-height: 50vh;
      padding-right: 4px;
    }
    .composer { display: flex; gap: 8px; align-items: flex-end; }
    .composer textarea { flex: 1; min-height: 68px; }
    .sim-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
    }
    .sim-box {
      border: 1px dashed rgba(123,183,255,0.35);
      border-radius: 12px;
      padding: 12px;
      background: rgba(27, 34, 48, 0.6);
      color: var(--muted);
      font-size: 12px;
      min-height: 120px;
    }
    .split {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .json-box {
      margin: 0;
      max-height: 240px;
      overflow: auto;
      background: rgba(17, 21, 28, 0.92);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .error {
      color: var(--danger);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .empty {
      border: 1px dashed var(--border);
      border-radius: 12px;
      padding: 12px;
      background: rgba(27,34,48,0.35);
    }
    .compact { display: grid; gap: 8px; }
    .minimized .messages, .minimized .composer { display: none; }
    @media (max-width: 920px) {
      .grid, .chat-shell, .split { grid-template-columns: 1fr; }
      .grid { padding: 10px; }
      .messages { max-height: 36vh; }
    }
  </style>
</head>
<body>
  <div class="shell${simulator.active && simulator.minimized ? ' minimized' : ''}">
    <div class="topbar">
      <div class="brand">
        <strong>NovaAI Workspace</strong>
        <span>${escapeHtml(this.state.status)}</span>
      </div>
      <div class="top-actions">
        <button class="small secondary" data-command="selectRepo">Select Repo</button>
        <button class="small" data-command="refreshRepo">Rescan Files</button>
        <button class="small primary" data-command="runSimulator">Run Wokwi</button>
        ${auth.user ? '<button class="small danger" data-command="logout">Logout</button>' : ''}
      </div>
    </div>

    <div class="grid">
      <div class="stack">
        <div class="card">
          <h2>Auth</h2>
          ${auth.user ? `
            <div class="compact">
              <div><strong>${escapeHtml(auth.user.fullName || auth.user.email || 'Signed in')}</strong></div>
              <div class="subtle">${escapeHtml(auth.user.email || '')}</div>
              <div class="hint">Bearer auth is stored inside the extension.</div>
            </div>
          ` : `
            <div class="button-row">
              <button class="small ${auth.mode === 'login' ? 'active' : ''}" data-command="setAuthMode" data-mode="login">Login</button>
              <button class="small ${auth.mode === 'signup' ? 'active' : ''}" data-command="setAuthMode" data-mode="signup">Signup</button>
            </div>
            <form data-command="loginOrSignup" class="compact">
              ${auth.mode === 'signup' ? '<div><label>Full Name</label><input name="fullName" value="' + escapeHtml(auth.fullName) + '" placeholder="Your name" /></div>' : ''}
              <div><label>Email</label><input name="email" value="' + escapeHtml(auth.email) + '" placeholder="name@example.com" /></div>
              <div><label>Password</label><input name="password" type="password" value="' + escapeHtml(auth.password) + '" placeholder="••••••••" /></div>
              <button type="submit" class="primary">' + (auth.mode === 'signup' ? 'Create Account' : 'Sign In') + '</button>
            </form>
          `}
          ${auth.error ? `<div class="error">${escapeHtml(auth.error)}</div>` : ''}
        </div>

        <div class="card">
          <h2>Projects</h2>
          <form data-command="createProject" class="compact">
            <label>New project description</label>
            <textarea name="description" placeholder="Describe the hardware project">${escapeHtml(projects.createDescription)}</textarea>
            <button type="submit" class="primary" ${auth.user ? '' : 'disabled'}>Create Project</button>
          </form>
          <div class="divider"></div>
          <div class="project-list">${projectListHtml}</div>
          ${projects.error ? `<div class="error">${escapeHtml(projects.error)}</div>` : ''}
        </div>

        <div class="card">
          <h2>Repo</h2>
          <div class="compact">
            <div class="subtle">${repo.rootPath ? escapeHtml(repo.rootPath) : 'No repo selected yet'}</div>
            <div class="hint">The extension scans every file in the selected folder and prioritizes hardware files such as .ino, diagram.json, toml, ini, c, cpp, h, and md.</div>
          </div>
          ${repo.error ? `<div class="error">${escapeHtml(repo.error)}</div>` : ''}
          <div class="divider"></div>
          <div class="file-list">${filesHtml}</div>
        </div>

        <div class="card">
          <h2>Chip Catalog</h2>
          <div class="compact">
            <label>Built-in or custom chip</label>
            <select data-command="selectChip">
              ${chipOptions}
            </select>
            <form data-command="saveCustomChip" class="compact">
              <label>Custom chip name</label>
              <input name="name" value="${escapeHtml(chips.customName)}" placeholder="My Chip" />
              <label>Part type</label>
              <input name="partType" value="${escapeHtml(chips.customPartType)}" placeholder="chip-my-chip" />
              <label>Category</label>
              <input name="category" value="${escapeHtml(chips.customCategory)}" placeholder="logic / sensor / display" />
              <label>Pins (comma separated)</label>
              <input name="pins" value="${escapeHtml(chips.customPins)}" placeholder="VCC, GND, IN, OUT" />
              <label>Author</label>
              <input name="author" value="${escapeHtml(chips.customAuthor)}" placeholder="NovaAI" />
              <label>Notes</label>
              <textarea name="notes" placeholder="Usage notes and wiring hints">${escapeHtml(chips.customNotes)}</textarea>
              <button type="submit" class="small">Save Custom Chip</button>
            </form>
            <div class="hint">Custom chips are stored in .NovaAI/chips.json inside the selected repo.</div>
          </div>
          ${chips.error ? `<div class="error">${escapeHtml(chips.error)}</div>` : ''}
          <div class="divider"></div>
          ${chipDetails}
        </div>
      </div>

      <div class="main">
        <div class="card ${simulator.active && simulator.minimized ? 'minimized' : ''}">
          <div class="chat-top">
            <h2>Project Workspace</h2>
            <div class="button-row">
              <button class="small ${chat.agent === 'ideation' ? 'active' : ''}" data-command="setAgent" data-agent="ideation">IdeationAI</button>
              <button class="small ${chat.agent === 'components' ? 'active' : ''}" data-command="setAgent" data-agent="components">ComponentsAI</button>
              <button class="small ${chat.agent === 'projectAI' ? 'active' : ''}" data-command="setAgent" data-agent="projectAI">ProjectAI</button>
              <button class="small ${chat.agent === 'design' ? 'active' : ''}" data-command="setAgent" data-agent="design">Design AI</button>
              <button class="small" data-command="initAgent" data-agent="${escapeHtml(chat.agent)}">Init</button>
              <button class="small secondary" data-command="toggleSimulatorMinimize">${simulator.minimized ? 'Expand Chat' : 'Minimize Chat'}</button>
            </div>
          </div>

          <div class="chat-shell">
            <div class="chat-card">
              <div class="chat-body">
                <div class="messages">${messagesHtml}</div>
                <div class="composer">
                  <textarea name="chatInput" placeholder="Ask ${chat.agent}...">${escapeHtml(chat.input)}</textarea>
                  <div class="button-row" style="flex-direction: column; align-items: stretch; min-width: 150px;">
                    <button class="primary" data-command="sendChat">Send</button>
                    <button class="secondary" data-command="generateFiles" ${chat.agent === 'components' ? '' : 'disabled'}>Generate & Write Files</button>
                  </div>
                </div>
                <div class="hint">ComponentsAI can generate code and the extension writes it into the selected repo. ProjectAI scans .ino, .json, and companion files from the selected hardware folder.</div>
              </div>
            </div>

            <div class="sim-card">
              <div class="sim-panel">
                <h3>Simulator</h3>
                <div class="sim-box">
                  <div><strong>Status:</strong> ${escapeHtml(simulator.status)}</div>
                  <div style="margin-top: 8px;">${repo.configPath ? `Config: ${escapeHtml(repo.configPath)}` : 'No config file detected yet.'}</div>
                  <div style="margin-top: 8px;">${repo.sketchPath ? `Sketch: ${escapeHtml(repo.sketchPath)}` : 'No sketch detected yet.'}</div>
                </div>
                <div class="button-row">
                  <button class="small primary" data-command="runSimulator">Start Wokwi</button>
                  <button class="small" data-command="refreshRepo">Rescan</button>
                </div>
                <div class="hint">The chat collapses when the simulator is active so the workspace stays usable in a narrow sidebar.</div>
                <div class="divider"></div>
                <form data-command="saveProject" class="compact">
                  <label>Active project details</label>
                  <textarea name="projectDescription">${escapeHtml(projects.editDescription || activeProject?.description || '')}</textarea>
                  <label>Wokwi URL</label>
                  <input name="wokwiUrl" value="${escapeHtml(projects.editWokwiUrl || activeProject?.wokwiUrl || '')}" placeholder="https://wokwi.com/projects/..." />
                  <div class="button-row">
                    <button type="submit" class="primary" ${projects.activeId ? '' : 'disabled'}>Save Project</button>
                    <button type="button" class="danger" data-command="deleteProject" data-project-id="${escapeHtml(projects.activeId || '')}" ${projects.activeId ? '' : 'disabled'}>Delete</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const command = form.getAttribute('data-command');
      if (!command) {
        return;
      }

      event.preventDefault();
      const data = new FormData(form);
      const payload = Object.fromEntries(data.entries());
      vscode.postMessage({ command, ...payload });
    });

    document.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('[data-command]') : null;
      if (!target) {
        return;
      }

      const command = target.getAttribute('data-command');
      if (!command) {
        return;
      }

      const payload = { command };
      const projectId = target.getAttribute('data-project-id');
      const agent = target.getAttribute('data-agent');
      const path = target.getAttribute('data-path');
      const mode = target.getAttribute('data-mode');

      if (projectId) payload.projectId = projectId;
      if (agent) payload.agent = agent;
      if (path) payload.path = path;
      if (mode) payload.mode = mode;

      if (command === 'sendChat' || command === 'generateFiles') {
        const textarea = document.querySelector('textarea[name="chatInput"]');
        payload.text = textarea ? textarea.value : '';
      }

      vscode.postMessage(payload);
    });

    document.addEventListener('change', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }

      if (target.matches('select[data-command="selectChip"]')) {
        vscode.postMessage({ command: 'selectChip', chipId: target.value });
      }
    });

    document.addEventListener('input', (event) => {
      const target = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement
        ? event.target
        : null;
      if (!target) {
        return;
      }

      if (target.name === 'chatInput') {
        vscode.setState({ chatInput: target.value });
      }
    });

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
  }
}
