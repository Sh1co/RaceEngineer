import path from "node:path";

type ConfigStore = Record<string, Record<string, unknown>>;
type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>;

const configStore: ConfigStore = {};
const commandHandlers = new Map<string, CommandHandler>();

class Uri {
  readonly fsPath: string;

  private constructor(fsPath: string) {
    this.fsPath = fsPath;
  }

  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return Uri.file(path.join(base.fsPath, ...pathSegments));
  }
}

let workspaceFolderUri = Uri.file("C:\\workspace");

export function __setVSCodeConfig(section: string, key: string, value: unknown) {
  if (configStore[section] == null) {
    configStore[section] = {};
  }
  configStore[section]![key] = value;
}

export function __setWorkspaceFolder(fsPath: string) {
  workspaceFolderUri = Uri.file(fsPath);
}

export function __setCommandHandler(command: string, handler: CommandHandler) {
  commandHandlers.set(command, handler);
}

export function __resetVSCodeConfig() {
  Object.keys(configStore).forEach((key) => {
    delete configStore[key];
  });
  commandHandlers.clear();
  workspaceFolderUri = Uri.file("C:\\workspace");
}

export const workspace = {
  workspaceFolders: [{ uri: workspaceFolderUri }],
  getConfiguration(section: string) {
    return {
      get(key: string, defaultValue: unknown) {
        return configStore[section]?.[key] ?? defaultValue;
      },
    };
  },
  fs: {
    async readFile() {
      throw new Error("workspace.fs.readFile is not mocked in this test.");
    },
  },
};

Object.defineProperty(workspace, "workspaceFolders", {
  get() {
    return [{ uri: workspaceFolderUri }];
  },
});

export const commands = {
  async executeCommand(command: string, ...args: unknown[]) {
    const handler = commandHandlers.get(command);
    if (handler == null) {
      return undefined;
    }
    return handler(...args);
  },
};

export { Uri };
