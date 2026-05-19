export type StepStatus = 'pass' | 'fail' | 'skipped';

export interface StepResult {
  status: StepStatus;
  message?: string;
}

export interface SetupOptions {
  skipVenv: boolean;
  skipConfig: boolean;
  skipPlugins: boolean;
  force: boolean;
}

export interface SetupContext {
  projectRoot: string;
  os: string;
  arch: string;
  venvPath: string;
}

export interface CommandRunner {
  run(cmd: string, args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; exitCode: number }>;
}
