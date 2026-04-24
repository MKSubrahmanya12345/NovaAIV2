import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as vscode from 'vscode';
import { HardcodeWorkspaceViewProvider } from './workspace-panel';

type WokwiTemplate = 'arduino-uno' | 'esp32-devkit-v1' | 'raspberry-pi-pico';

type WokwiProjectInfo = {
	name: string;
	folderName: string;
	fullPath: string;
	createdAt: string;
	template: WokwiTemplate;
};

type SimulationScanResult = {
	rootPath: string;
	diagramPath?: string;
	configPath?: string;
	sketchPath?: string;
};

const DEFAULT_TEMPLATE: WokwiTemplate = 'arduino-uno';
const WOKWI_BASE_URL = 'https://wokwi.com/projects/new';

export function activate(context: vscode.ExtensionContext) {
	const workspaceProvider = new HardcodeWorkspaceViewProvider(context);
	const provider = new WokwiProjectsViewProvider(context);
	const simulatorPanel = new HardcodeSimulatorPanel(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('hardcode.chatsView', workspaceProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode-vscode-extension.openChat', async () => {
			await vscode.commands.executeCommand('hardcode.chatsView.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode.openChat', async () => {
			await vscode.commands.executeCommand('hardcode.chatsView.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode.openWorkspace', async () => {
			await vscode.commands.executeCommand('hardcode.chatsView.focus');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode-vscode-extension.createWokwiProject', async () => {
			await provider.promptAndCreateProject();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode.createWokwiProject', async () => {
			await provider.promptAndCreateProject();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode.openSimulatorWorkbench', async () => {
			await simulatorPanel.open();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('hardcode.selectSimulationPath', async () => {
			await simulatorPanel.selectPath();
		})
	);

	void simulatorPanel.ensureInitialPathPrompt();

	vscode.window.showInformationMessage('HardCode Chat + Wokwi extension activated.');
}

class HardcodeSimulatorPanel {
	private panel?: vscode.WebviewPanel;

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async ensureInitialPathPrompt(): Promise<void> {
		const savedPath = this.getSavedPath();
		if (savedPath) {
			return;
		}

		const action = await vscode.window.showInformationMessage(
			'HardCode: Select simulation folder to scan diagram.json and wokwi.ini/toml files.',
			'Select Path',
			'Later'
		);

		if (action === 'Select Path') {
			await this.selectPath();
		}
	}

	public async selectPath(): Promise<void> {
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select Simulation Folder'
		});

		if (!picked || picked.length === 0) {
			return;
		}

		const fsPath = picked[0].fsPath;
		await this.context.workspaceState.update('hardcode.simulationPath', fsPath);
		vscode.window.showInformationMessage(`HardCode simulation path set: ${fsPath}`);

		if (this.panel) {
			await this.postScanResult();
		}
	}

	public async open(): Promise<void> {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.One);
			await this.postScanResult();
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			'hardcode.simulatorWorkbench',
			'HardCode Simulator Workbench',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		this.panel.webview.html = this.getHtml();

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});

		this.panel.webview.onDidReceiveMessage(async (message) => {
			switch (message?.command) {
				case 'ready':
				case 'scan':
					await this.postScanResult();
					return;
				case 'pickPath':
					await this.selectPath();
					return;
				case 'openFile':
					if (typeof message?.path === 'string' && message.path) {
						await this.openFile(message.path);
					}
					return;
				case 'play':
					await this.playSimulation();
					return;
				default:
					return;
			}
		});

		await this.postScanResult();
	}

	private getSavedPath(): string | undefined {
		return this.context.workspaceState.get<string>('hardcode.simulationPath');
	}

	private async postScanResult(): Promise<void> {
		if (!this.panel) {
			return;
		}

		const rootPath = this.getSavedPath();
		if (!rootPath) {
			void this.panel.webview.postMessage({
				command: 'scanResult',
				result: null,
				error: 'No simulation path selected.'
			});
			return;
		}

		try {
			const result = await this.scanSimulationFolder(rootPath);
			void this.panel.webview.postMessage({ command: 'scanResult', result, error: '' });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Scan failed.';
			void this.panel.webview.postMessage({ command: 'scanResult', result: null, error: message });
		}
	}

	private async scanSimulationFolder(rootPath: string): Promise<SimulationScanResult> {
		const files = await this.collectFiles(rootPath);
		const normalize = (value: string) => value.toLowerCase().replace(/\\/g, '/');

		const diagramPath = files.find((filePath) => normalize(filePath).endsWith('/diagram.json'));
		const configPath = files.find((filePath) => {
			const lowered = normalize(filePath);
			return lowered.endsWith('/wokwi.toml') || lowered.endsWith('/wokwi.ini') || lowered.endsWith('/diagram.ini');
		});
		const sketchPath = files.find((filePath) => {
			const lowered = normalize(filePath);
			return lowered.endsWith('/sketch.ino') || lowered.endsWith('/main.c') || lowered.endsWith('/main.cpp');
		});

		return { rootPath, diagramPath, configPath, sketchPath };
	}

	private async collectFiles(rootPath: string): Promise<string[]> {
		const output: string[] = [];
		const queue: string[] = [rootPath];

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) {
				continue;
			}

			const entries = await fs.readdir(current, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(current, entry.name);
				if (entry.isDirectory()) {
					if (entry.name !== 'node_modules' && entry.name !== '.git') {
						queue.push(fullPath);
					}
				} else {
					output.push(fullPath);
				}
			}
		}

		return output;
	}

	private async openFile(targetPath: string): Promise<void> {
		const document = await vscode.workspace.openTextDocument(targetPath);
		await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.One });
	}

	private ensureWorkspaceContainsPath(targetPath: string): void {
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

	private async loadProjectData(rootPath: string): Promise<any> {
		const result = await this.scanSimulationFolder(rootPath);
		const projectData: any = { rootPath };

		if (result.diagramPath) {
			try {
				const diagramContent = await fs.readFile(result.diagramPath, 'utf8');
				projectData.diagram = JSON.parse(diagramContent);
				projectData.diagramPath = result.diagramPath;
			} catch (e) {
				projectData.diagramError = 'Failed to parse diagram.json';
			}
		}

		if (result.sketchPath) {
			try {
				const sketchContent = await fs.readFile(result.sketchPath, 'utf8');
				projectData.sketch = sketchContent;
				projectData.sketchPath = result.sketchPath;
				projectData.sketchName = path.basename(result.sketchPath);
			} catch (e) {
				projectData.sketchError = 'Failed to read sketch file';
			}
		}

		if (result.configPath) {
			try {
				const configContent = await fs.readFile(result.configPath, 'utf8');
				projectData.config = configContent;
				projectData.configPath = result.configPath;
			} catch (e) {
				projectData.configError = 'Failed to read config';
			}
		}

		return projectData;
	}

	private async playSimulation(): Promise<void> {
		const rootPath = this.getSavedPath();
		if (!rootPath) {
			vscode.window.showErrorMessage('HardCode: select a simulation path first.');
			return;
		}

		try {
			const result = await this.scanSimulationFolder(rootPath);
			const projectData = await this.loadProjectData(rootPath);
			this.ensureWorkspaceContainsPath(rootPath);

			// Pass config file to Wokwi extension if available
			if (result.configPath) {
				try {
					await vscode.commands.executeCommand('wokwi-vscode.selectConfigFile', vscode.Uri.file(result.configPath));
				} catch (e) {
					// Continue if selectConfigFile fails (some Wokwi versions may not support it)
				}
			}

			if (result.sketchPath) {
				await this.openFile(result.sketchPath);
			} else if (result.configPath) {
				await this.openFile(result.configPath);
			}

			// Display project in UI
			if (this.panel) {
				void this.panel.webview.postMessage({
					command: 'loadProject',
					projectData
				});
			}

			// Start Wokwi simulator with the selected folder
			await vscode.commands.executeCommand('wokwi-vscode.start');
			vscode.window.showInformationMessage('HardCode: loaded project from ' + rootPath + ' and started Wokwi simulation.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unable to start simulation.';
			vscode.window.showErrorMessage(`HardCode: ${message}`);
		}
	}

	private getHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HardCode Simulator Workbench</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Consolas, 'Courier New', monospace;
      background: #0f1419;
      color: #d6e1e8;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .header {
      padding: 14px 18px;
      background: #162028;
      border-bottom: 1px solid #2a3b46;
      flex-shrink: 0;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 18px;
      color: #74f7c5;
    }
    .controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    button {
      border-radius: 6px;
      border: 1px solid #2f4451;
      background: #0f1a21;
      color: #d6e1e8;
      padding: 6px 10px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
    }
    button.primary {
      background: #1ca271;
      border-color: #1ca271;
      color: #001a11;
    }
    button:hover {
      opacity: 0.85;
    }
    button:active {
      opacity: 0.7;
    }
    .path-display {
      font-size: 11px;
      opacity: 0.65;
      word-break: break-all;
    }
    .error {
      color: #ff9e9e;
      font-size: 12px;
      margin-top: 6px;
    }
    .content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    #scanPanel {
      padding: 18px;
      overflow: auto;
      flex: 1;
    }
    #projectViewer {
      display: none;
      flex: 1;
      overflow: hidden;
      flex-direction: column;
    }
    #projectViewer.active {
      display: flex;
    }
    .project-header {
      background: #162028;
      border-bottom: 1px solid #2a3b46;
      padding: 12px 18px;
      flex-shrink: 0;
    }
    .project-title {
      margin: 0 0 8px;
      font-size: 16px;
      color: #74f7c5;
    }
    .project-meta {
      font-size: 11px;
      opacity: 0.7;
      margin: 4px 0;
    }
    .project-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .project-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      gap: 0;
    }
    .diagram-pane {
      flex: 1;
      overflow: auto;
      padding: 12px;
      background: #0f1419;
      border-right: 1px solid #2a3b46;
    }
    .code-pane {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: #0f1419;
    }
    #codeEditor {
      flex: 1;
      padding: 12px;
      background: #111a21;
      color: #d6e1e8;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      border: none;
      overflow: auto;
      resize: none;
    }
    .diagram-box {
      background: #162028;
      border: 1px solid #2a3b46;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .diagram-label {
      color: #8cc7ff;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }
    .diagram-content {
      background: #111a21;
      padding: 12px;
      border-radius: 4px;
      font-size: 11px;
      overflow: auto;
      max-height: 300px;
    }
    .scan-item {
      border: 1px solid #2a3b46;
      border-radius: 8px;
      padding: 10px;
      margin-top: 8px;
      background: #111a21;
    }
    .item-label {
      color: #8cc7ff;
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .item-path {
      font-size: 12px;
      opacity: 0.85;
      word-break: break-all;
      margin-bottom: 6px;
    }
    .item-buttons {
      display: flex;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>HardCode Simulator Workbench</h1>
    <div class="controls">
      <button id="pickPath">Select Path</button>
      <button id="scan" class="primary">Scan Files</button>
      <button id="play" class="primary">▶ Load & Simulate</button>
    </div>
    <div class="path-display" id="rootPath">Path: not selected</div>
    <div class="error" id="error"></div>
  </div>

  <div class="content">
    <div id="scanPanel">
      <div id="filesList"></div>
    </div>

    <div id="projectViewer">
      <div class="project-header">
        <div class="project-title" id="projectName">Untitled Project</div>
        <div class="project-meta" id="projectBoard">Board: Unknown</div>
        <div class="project-meta" id="projectPath">Path: /</div>
        <div class="project-actions">
          <button id="editDiagram">Edit diagram.json</button>
          <button id="editSketch">Edit sketch</button>
          <button id="runSim" class="primary">⚡ Run with Wokwi (Licensed)</button>
        </div>
      </div>

      <div class="project-content">
        <div class="diagram-pane">
          <div class="diagram-box">
            <div class="diagram-label">📋 Project Diagram</div>
            <div class="diagram-content" id="diagramView"></div>
          </div>
          <div class="diagram-box">
            <div class="diagram-label">⚙️ Configuration</div>
            <div class="diagram-content" id="configView" style="max-height: 200px;"></div>
          </div>
        </div>

        <div class="code-pane">
          <div style="padding: 12px; background: #162028; border-bottom: 1px solid #2a3b46; font-size: 11px; color: #8cc7ff; text-transform: uppercase; font-weight: 700;">📝 Code</div>
          <textarea id="codeEditor" readonly></textarea>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const rootPathEl = document.getElementById('rootPath');
    const errorEl = document.getElementById('error');
    const filesList = document.getElementById('filesList');
    const scanPanel = document.getElementById('scanPanel');
    const projectViewer = document.getElementById('projectViewer');
    
    let currentProject = null;

    function renderScanFiles(result) {
      filesList.innerHTML = '';
      if (!result) {
        filesList.textContent = 'No files found. Click "Scan Files" to search.';
        return;
      }

      rootPathEl.textContent = 'Path: ' + result.rootPath;

      const addItem = (label, path) => {
        const item = document.createElement('div');
        item.className = 'scan-item';
        
        const labelEl = document.createElement('div');
        labelEl.className = 'item-label';
        labelEl.textContent = label;
        item.appendChild(labelEl);

        const pathEl = document.createElement('div');
        pathEl.className = 'item-path';
        pathEl.textContent = path || 'Not found';
        item.appendChild(pathEl);

        if (path) {
          const btnDiv = document.createElement('div');
          btnDiv.className = 'item-buttons';
          
          const openBtn = document.createElement('button');
          openBtn.textContent = 'Open';
          openBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'openFile', path });
          });
          btnDiv.appendChild(openBtn);
          
          item.appendChild(btnDiv);
        }

        filesList.appendChild(item);
      };

      addItem('diagram.json', result.diagramPath);
      addItem('wokwi config', result.configPath);
      addItem('sketch', result.sketchPath);
    }

    function displayProject(projectData) {
      if (!projectData || (!projectData.diagram && !projectData.sketch)) {
        errorEl.textContent = 'No valid project data loaded.';
        projectViewer.classList.remove('active');
        return;
      }

      currentProject = projectData;
      projectViewer.classList.add('active');
      scanPanel.style.display = 'none';

      // Update header
      const projName = projectData.diagram?.meta?.title || 'Untitled Project';
      const board = projectData.diagram?.meta?.board || 'Arduino Uno';
      
      document.getElementById('projectName').textContent = projName;
      document.getElementById('projectBoard').textContent = 'Board: ' + board;
      document.getElementById('projectPath').textContent = 'Path: ' + projectData.rootPath;

      // Show diagram
      const diagramView = document.getElementById('diagramView');
      if (projectData.diagram) {
        const parts = projectData.diagram?.parts || [];
        const connStr = parts.length > 0 
          ? parts.map(p => \`  - \${p.type || p.name || 'Component'}\`).join('\\n')
          : '(empty circuit)';
        diagramView.textContent = \`Parts (\${parts.length}):\\n\${connStr}\`;
      } else {
        diagramView.textContent = projectData.diagramError || 'No diagram loaded';
      }

      // Show config
      const configView = document.getElementById('configView');
      if (projectData.config) {
        configView.textContent = projectData.config.substring(0, 500) + (projectData.config.length > 500 ? '\\n...' : '');
      } else {
        configView.textContent = 'No config file found';
      }

      // Show code
      const codeEditor = document.getElementById('codeEditor');
      if (projectData.sketch) {
        codeEditor.value = projectData.sketch;
      } else {
        codeEditor.value = projectData.sketchError || 'No sketch loaded';
      }
    }

    document.getElementById('pickPath').addEventListener('click', () => {
      projectViewer.classList.remove('active');
      scanPanel.style.display = 'block';
      vscode.postMessage({ command: 'pickPath' });
    });

    document.getElementById('scan').addEventListener('click', () => {
      projectViewer.classList.remove('active');
      scanPanel.style.display = 'block';
      vscode.postMessage({ command: 'scan' });
    });

    document.getElementById('play').addEventListener('click', () => {
      vscode.postMessage({ command: 'play' });
    });

    document.getElementById('editDiagram').addEventListener('click', () => {
      if (currentProject?.diagramPath) {
        vscode.postMessage({ command: 'openFile', path: currentProject.diagramPath });
      }
    });

    document.getElementById('editSketch').addEventListener('click', () => {
      if (currentProject?.sketchPath) {
        vscode.postMessage({ command: 'openFile', path: currentProject.sketchPath });
      }
    });

    document.getElementById('runSim').addEventListener('click', () => {
      vscode.postMessage({ command: 'play' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      
      if (msg.command === 'scanResult') {
        errorEl.textContent = msg.error || '';
        renderScanFiles(msg.result);
      }
      
      if (msg.command === 'loadProject') {
        displayProject(msg.projectData);
      }
    });

    vscode.postMessage({ command: 'ready' });
  </script>
</body>
</html>`;
	}
}

class WokwiProjectsViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;

	constructor(private readonly context: vscode.ExtensionContext) {}

	public async promptAndCreateProject(): Promise<void> {
		const name = await vscode.window.showInputBox({
			prompt: 'Enter a name for the new Wokwi project',
			placeHolder: 'led-blink'
		});

		if (!name || !name.trim()) {
			return;
		}

		try {
			await this.createProject(name.trim(), DEFAULT_TEMPLATE);
			await this.postProjectsList();
			vscode.window.showInformationMessage(`Created Wokwi project: ${name.trim()}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to create project';
			vscode.window.showErrorMessage(message);
		}
	}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri]
		};

		webviewView.webview.html = this.getHtmlForWebview();

		webviewView.webview.onDidReceiveMessage(async (message) => {
			switch (message?.command) {
				case 'ready':
				case 'refreshProjects': {
					this.postToWebview({
						command: 'config',
						webAppUrl: this.getWebAppUrl(),
						backendUrl: this.getBackendUrl()
					});
					await this.postProjectsList();
					return;
				}
				case 'createProject': {
					try {
						const name = String(message?.name ?? '').trim();
						const template = this.toTemplate(message?.template);
						if (!name) {
							this.postToWebview({ command: 'error', message: 'Project name is required.' });
							return;
						}
						const project = await this.createProject(name, template);
						this.postToWebview({ command: 'projectCreated', project });
						await this.postProjectsList();
					} catch (error) {
						const messageText = error instanceof Error ? error.message : 'Unable to create project.';
						this.postToWebview({ command: 'error', message: messageText });
					}
					return;
				}
				case 'openProject': {
					const targetPath = String(message?.fullPath ?? '');
					if (!targetPath) {
						return;
					}
					await this.openProject(targetPath);
					return;
				}
				case 'openInWokwi': {
					const template = this.toTemplate(message?.template);
					await vscode.env.openExternal(vscode.Uri.parse(`${WOKWI_BASE_URL}/${template}`));
					return;
				}
				case 'openChatInBrowser': {
					await vscode.env.openExternal(vscode.Uri.parse(this.getWebAppUrl()));
					return;
				}
				case 'copyText': {
					const text = String(message?.text ?? '');
					await vscode.env.clipboard.writeText(text);
					this.postToWebview({ command: 'copied' });
					return;
				}
				default:
					return;
			}
		});

		void this.postProjectsList();
	}

	private toTemplate(input: unknown): WokwiTemplate {
		if (input === 'esp32-devkit-v1' || input === 'raspberry-pi-pico' || input === 'arduino-uno') {
			return input;
		}
		return DEFAULT_TEMPLATE;
	}

	private getWebAppUrl(): string {
		const configured = vscode.workspace.getConfiguration('hardcode').get<string>('webAppUrl');
		return configured && configured.trim() ? configured : 'http://localhost:5173';
	}

	private getBackendUrl(): string {
		const configured = vscode.workspace.getConfiguration('hardcode').get<string>('backendUrl');
		return configured && configured.trim() ? configured : 'http://localhost:5000';
	}

	private async postProjectsList(): Promise<void> {
		const projects = await this.listProjects();
		this.postToWebview({ command: 'projectsList', projects });
	}

	private postToWebview(payload: unknown): void {
		if (!this.view) {
			return;
		}
		void this.view.webview.postMessage(payload);
	}

	private async getProjectsRoot(): Promise<string> {
		const configured = vscode.workspace.getConfiguration('hardcode').get<string>('wokwiProjectsPath');
		if (configured && configured.trim()) {
			await fs.mkdir(configured, { recursive: true });
			return configured;
		}

		const firstWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		const root = firstWorkspace
			? path.join(firstWorkspace, '.wokwi-projects')
			: path.join(os.homedir(), 'Documents', 'WokwiProjects');

		await fs.mkdir(root, { recursive: true });
		return root;
	}

	private slugify(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 48) || 'wokwi-project';
	}

	private async createProject(name: string, template: WokwiTemplate): Promise<WokwiProjectInfo> {
		const root = await this.getProjectsRoot();
		const baseFolder = this.slugify(name);
		let folderName = baseFolder;
		let projectPath = path.join(root, folderName);
		let suffix = 2;

		while (await this.exists(projectPath)) {
			folderName = `${baseFolder}-${suffix}`;
			projectPath = path.join(root, folderName);
			suffix += 1;
		}

		await fs.mkdir(projectPath, { recursive: true });

		const { sketch, diagram } = this.getTemplateFiles(template, name);
		const meta: WokwiProjectInfo = {
			name,
			folderName,
			fullPath: projectPath,
			createdAt: new Date().toISOString(),
			template
		};

		await Promise.all([
			fs.writeFile(path.join(projectPath, 'sketch.ino'), sketch, 'utf8'),
			fs.writeFile(path.join(projectPath, 'diagram.json'), JSON.stringify(diagram, null, 2), 'utf8'),
			fs.writeFile(path.join(projectPath, 'libraries.txt'), '', 'utf8'),
			fs.writeFile(path.join(projectPath, '.hardcode-wokwi.json'), JSON.stringify(meta, null, 2), 'utf8')
		]);

		return meta;
	}

	private getTemplateFiles(template: WokwiTemplate, projectName: string): { sketch: string; diagram: unknown } {
		if (template === 'esp32-devkit-v1') {
			return {
				sketch: `// ${projectName}\nvoid setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  Serial.println("Hello from ESP32");\n  delay(1000);\n}\n`,
				diagram: {
					version: 1,
					author: 'hardcode-vscode-extension',
					editor: 'wokwi',
					parts: [{ type: 'board-esp32-devkit-v1', id: 'esp', top: 0, left: 0, attrs: {} }],
					connections: [],
					dependencies: {}
				}
			};
		}

		if (template === 'raspberry-pi-pico') {
			return {
				sketch: `// ${projectName}\nvoid setup() {\n  Serial1.begin(115200);\n}\n\nvoid loop() {\n  Serial1.println("Hello from Pico");\n  delay(1000);\n}\n`,
				diagram: {
					version: 1,
					author: 'hardcode-vscode-extension',
					editor: 'wokwi',
					parts: [{ type: 'board-pi-pico', id: 'pico', top: 0, left: 0, attrs: {} }],
					connections: [],
					dependencies: {}
				}
			};
		}

		return {
			sketch: `// ${projectName}\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(500);\n  digitalWrite(LED_PIN, LOW);\n  delay(500);\n}\n`,
			diagram: {
				version: 1,
				author: 'hardcode-vscode-extension',
				editor: 'wokwi',
				parts: [{ type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, attrs: {} }],
				connections: [],
				dependencies: {}
			}
		};
	}

	private async listProjects(): Promise<WokwiProjectInfo[]> {
		const root = await this.getProjectsRoot();
		const entries = await fs.readdir(root, { withFileTypes: true });
		const projects: WokwiProjectInfo[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const fullPath = path.join(root, entry.name);
			const sketchPath = path.join(fullPath, 'sketch.ino');
			const diagramPath = path.join(fullPath, 'diagram.json');
			const hasWokwiFiles = (await this.exists(sketchPath)) && (await this.exists(diagramPath));
			if (!hasWokwiFiles) {
				continue;
			}

			const metadataPath = path.join(fullPath, '.hardcode-wokwi.json');
			let metadata: Partial<WokwiProjectInfo> = {};

			if (await this.exists(metadataPath)) {
				try {
					const raw = await fs.readFile(metadataPath, 'utf8');
					metadata = JSON.parse(raw) as Partial<WokwiProjectInfo>;
				} catch {
					metadata = {};
				}
			}

			projects.push({
				name: metadata.name || entry.name,
				folderName: entry.name,
				fullPath,
				createdAt: metadata.createdAt || new Date(0).toISOString(),
				template: (metadata.template as WokwiTemplate) || DEFAULT_TEMPLATE
			});
		}

		return projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	}

	private async openProject(projectPath: string): Promise<void> {
		const sketchPath = path.join(projectPath, 'sketch.ino');

		if (await this.exists(sketchPath)) {
			const document = await vscode.workspace.openTextDocument(sketchPath);
			await vscode.window.showTextDocument(document, { preview: false });
		}

		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(projectPath));
	}

	private async exists(targetPath: string): Promise<boolean> {
		try {
			await fs.access(targetPath);
			return true;
		} catch {
			return false;
		}
	}

	private getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>HardCode Chat + Wokwi</title>
	<style>
		:root {
			color-scheme: dark;
		}

		* {
			box-sizing: border-box;
			font-family: Consolas, 'Courier New', monospace;
		}

		html, body {
			height: 100%;
		}

		body {
			margin: 0;
			padding: 12px;
			background: #101619;
			color: #dce4e6;
			display: flex;
			flex-direction: column;
		}

		h1 {
			font-size: 16px;
			margin: 0 0 8px;
			color: #6fffb8;
			text-transform: uppercase;
			letter-spacing: 0.06em;
		}

		.panel {
			background: #142026;
			border: 1px solid #22333c;
			border-radius: 10px;
			padding: 10px;
			margin-bottom: 10px;
		}

		.tabs {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px;
			margin-bottom: 10px;
		}

		.tab-btn {
			background: #1a2630;
			border-color: #334a58;
			color: #c9d8df;
			font-size: 12px;
			font-weight: 700;
		}

		.tab-btn.active {
			background: #1a9f6f;
			border-color: #1a9f6f;
			color: #001b11;
		}

		.row {
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
		}

		input,
		textarea,
		select,
		button {
			border-radius: 8px;
			border: 1px solid #31444f;
			background: #0d1519;
			color: #dce4e6;
			padding: 8px;
			width: 100%;
		}

		textarea {
			min-height: 130px;
			resize: vertical;
		}

		button {
			cursor: pointer;
			width: auto;
			background: #1a9f6f;
			border-color: #1a9f6f;
			color: #001b11;
			font-weight: 700;
		}

		button.secondary {
			background: #1a2630;
			border-color: #334a58;
			color: #c9d8df;
		}

		ul {
			list-style: none;
			margin: 0;
			padding: 0;
			max-height: 28vh;
			overflow: auto;
		}

		li {
			border: 1px solid #22333c;
			border-radius: 8px;
			padding: 8px;
			margin-bottom: 8px;
			background: #111b21;
		}

		.project-head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 8px;
			margin-bottom: 6px;
		}

		.name {
			font-weight: 700;
			color: #7ef3c0;
			word-break: break-word;
		}

		.meta {
			font-size: 11px;
			opacity: 0.78;
			margin-bottom: 8px;
			word-break: break-all;
		}

		.muted {
			opacity: 0.7;
			font-size: 12px;
			margin-top: 8px;
		}

		.error {
			color: #ff8d8d;
			font-size: 12px;
			margin-top: 6px;
			min-height: 16px;
		}

		.frame-wrap {
			border: 1px solid #22333c;
			border-radius: 10px;
			overflow: hidden;
			height: 52vh;
			background: #0d1519;
		}

		iframe {
			width: 100%;
			height: 100%;
			border: none;
		}

		.hidden {
			display: none;
		}
	</style>
</head>
<body>
	<h1>HardCode Sidebar Copilot</h1>

	<div class="panel">
		<div class="row">
			<button id="openChatBrowserBtn" class="secondary">Open Chat In Browser</button>
			<button id="openWokwiBtnTop" class="secondary">Open Wokwi In Browser</button>
		</div>
		<div class="muted">Frontend: <span id="frontendUrl">-</span></div>
		<div class="muted">Backend: <span id="backendUrl">-</span></div>
	</div>

	<div class="tabs">
		<button class="tab-btn active" data-tab="chat">Chat</button>
		<button class="tab-btn" data-tab="snippets">Snippets</button>
		<button class="tab-btn" data-tab="projects">Projects</button>
	</div>

	<div id="chatTab" class="panel">
		<div class="frame-wrap">
			<iframe id="chatFrame" src="http://localhost:5173"></iframe>
		</div>
		<div class="muted">Use your app chat here; keep Wokwi extension on the right side.</div>
	</div>

	<div id="snippetsTab" class="panel hidden">
		<div class="row"><strong>diagram.json</strong></div>
		<textarea id="diagramText" placeholder="Paste generated diagram.json content here..."></textarea>
		<div class="row">
			<button id="copyDiagramBtn">Copy diagram.json</button>
		</div>

		<div class="row"><strong>wokwi.ini / wokwi.toml</strong></div>
		<textarea id="iniText" placeholder="Paste generated .ini/.toml content here..."></textarea>
		<div class="row">
			<button id="copyIniBtn">Copy ini/toml</button>
		</div>
		<div class="muted">Generation is pending; this panel is for quick copy/paste to Wokwi now.</div>
	</div>

	<div id="projectsTab" class="panel hidden">
		<div class="row">
			<input id="projectName" type="text" placeholder="Project name" />
		</div>
		<div class="row">
			<select id="template">
				<option value="arduino-uno">Arduino Uno</option>
				<option value="esp32-devkit-v1">ESP32 DevKit</option>
				<option value="raspberry-pi-pico">Raspberry Pi Pico</option>
			</select>
			<button id="createBtn">Create</button>
		</div>
		<div class="row">
			<button id="openWokwiBtn" class="secondary">Open Wokwi In Browser</button>
			<button id="refreshBtn" class="secondary">Refresh</button>
		</div>
		<div id="error" class="error"></div>
		<ul id="projects"></ul>
		<div class="muted">Projects are local folders with sketch.ino + diagram.json.</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const frontendUrlEl = document.getElementById('frontendUrl');
		const backendUrlEl = document.getElementById('backendUrl');
		const chatFrame = document.getElementById('chatFrame');

		const projectsList = document.getElementById('projects');
		const nameInput = document.getElementById('projectName');
		const templateSelect = document.getElementById('template');
		const errorEl = document.getElementById('error');
		const diagramText = document.getElementById('diagramText');
		const iniText = document.getElementById('iniText');

		const tabIds = ['chat', 'snippets', 'projects'];
		const tabButtons = document.querySelectorAll('.tab-btn');

		function activateTab(tab) {
			for (const id of tabIds) {
				document.getElementById(id + 'Tab').classList.toggle('hidden', id !== tab);
			}

			for (const button of tabButtons) {
				button.classList.toggle('active', button.getAttribute('data-tab') === tab);
			}
		}

		for (const button of tabButtons) {
			button.addEventListener('click', () => activateTab(button.getAttribute('data-tab')));
		}

		function setError(message) {
			errorEl.textContent = message || '';
		}

		function renderProjects(projects) {
			projectsList.innerHTML = '';

			if (!Array.isArray(projects) || projects.length === 0) {
				const item = document.createElement('li');
				item.textContent = 'No Wokwi projects found yet. Create one above.';
				projectsList.appendChild(item);
				return;
			}

			for (const project of projects) {
				const li = document.createElement('li');
				const head = document.createElement('div');
				head.className = 'project-head';

				const name = document.createElement('div');
				name.className = 'name';
				name.textContent = project.name;

				const openBtn = document.createElement('button');
				openBtn.className = 'secondary';
				openBtn.textContent = 'Open';
				openBtn.addEventListener('click', () => {
					vscode.postMessage({ command: 'openProject', fullPath: project.fullPath });
				});

				head.appendChild(name);
				head.appendChild(openBtn);

				const meta = document.createElement('div');
				meta.className = 'meta';
				meta.textContent = project.fullPath;

				li.appendChild(head);
				li.appendChild(meta);
				projectsList.appendChild(li);
			}
		}

		document.getElementById('createBtn').addEventListener('click', () => {
			const name = String(nameInput.value || '').trim();
			if (!name) {
				setError('Please enter a project name.');
				return;
			}

			setError('');
			vscode.postMessage({
				command: 'createProject',
				name,
				template: templateSelect.value
			});
		});

		document.getElementById('refreshBtn').addEventListener('click', () => {
			setError('');
			vscode.postMessage({ command: 'refreshProjects' });
		});

		document.getElementById('openWokwiBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'openInWokwi', template: templateSelect.value });
		});

		document.getElementById('openWokwiBtnTop').addEventListener('click', () => {
			vscode.postMessage({ command: 'openInWokwi', template: templateSelect.value });
		});

		document.getElementById('openChatBrowserBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'openChatInBrowser' });
		});

		document.getElementById('copyDiagramBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'copyText', text: diagramText.value });
		});

		document.getElementById('copyIniBtn').addEventListener('click', () => {
			vscode.postMessage({ command: 'copyText', text: iniText.value });
		});

		window.addEventListener('message', (event) => {
			const msg = event.data || {};

			if (msg.command === 'config') {
				frontendUrlEl.textContent = msg.webAppUrl || '-';
				backendUrlEl.textContent = msg.backendUrl || '-';
				if (msg.webAppUrl) {
					chatFrame.src = msg.webAppUrl;
				}
			}

			if (msg.command === 'projectsList') {
				renderProjects(msg.projects || []);
			}

			if (msg.command === 'error') {
				setError(msg.message || 'Unknown error');
			}

			if (msg.command === 'projectCreated') {
				nameInput.value = '';
				setError('');
			}

			if (msg.command === 'copied') {
				setError('Copied to clipboard.');
			}
		});

		vscode.postMessage({ command: 'ready' });
	</script>
</body>
</html>`;
	}
}

export function deactivate() {}
