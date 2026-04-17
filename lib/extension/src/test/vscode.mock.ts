type ConfigStore = Record<string, Record<string, unknown>>;

const configStore: ConfigStore = {};

export function __setVSCodeConfig(section: string, key: string, value: unknown) {
  if (configStore[section] == null) {
    configStore[section] = {};
  }
  configStore[section]![key] = value;
}

export function __resetVSCodeConfig() {
  Object.keys(configStore).forEach((key) => {
    delete configStore[key];
  });
}

export const workspace = {
  getConfiguration(section: string) {
    return {
      get(key: string, defaultValue: unknown) {
        return configStore[section]?.[key] ?? defaultValue;
      },
    };
  },
};

