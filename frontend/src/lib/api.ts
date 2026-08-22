export const getApiBaseUrl = (): string => {
  if (typeof window !== "undefined" && (window as any)._env_?.NEXT_PUBLIC_API_BASE_URL) {
    return (window as any)._env_.NEXT_PUBLIC_API_BASE_URL;
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL || "https://multi-agent-o2c-orchestrator.onrender.com";
};
