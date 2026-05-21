interface MiniProgramProcess {
  env: Record<string, string | undefined>;
  pid: number;
  noDeprecation: boolean;
  throwDeprecation: boolean;
  traceDeprecation: boolean;
  stderr: {
    isTTY: boolean;
    columns: number;
    getColorDepth: () => number;
  };
  nextTick: (callback: () => void) => void;
  emitWarning: () => void;
}

const miniProgramGlobal = globalThis as unknown as { process?: MiniProgramProcess };
const globalProcess = miniProgramGlobal.process;

if (!globalProcess) {
  miniProgramGlobal.process = {
    env: {
      NODE_DEBUG: "",
      NODE_ENV: "production"
    },
    pid: 0,
    noDeprecation: true,
    throwDeprecation: false,
    traceDeprecation: false,
    stderr: {
      isTTY: false,
      columns: 80,
      getColorDepth: () => 1
    },
    nextTick: (callback) => {
      setTimeout(callback, 0);
    },
    emitWarning: () => undefined
  };
}
