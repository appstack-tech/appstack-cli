import type { FrameworkId } from "@/constants";

export interface LatestVersion {
  version?: string;
  source: string;
  error?: string;
}

const SOURCES: Record<FrameworkId, string> = {
  swift: "GitHub Releases (ios-appstack-sdk)",
  kotlin: "Maven Central",
  "react-native": "npm",
  flutter: "pub.dev",
  unity: "GitHub Releases (appstack-unity-sdk)",
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "appstack-cli" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function githubLatest(repo: string): Promise<string | undefined> {
  const release = await getJson<{ tag_name?: string }>(
    `https://api.github.com/repos/appstack-tech/${repo}/releases/latest`,
  );
  return release.tag_name?.replace(/^v/, "");
}

async function mavenLatest(): Promise<string | undefined> {
  const response = await fetch(
    "https://repo1.maven.org/maven2/tech/appstack/android-sdk/appstack-android-sdk/maven-metadata.xml",
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const xml = await response.text();
  return xml.match(/<release>([^<]+)<\/release>/)?.[1] ??
    xml.match(/<latest>([^<]+)<\/latest>/)?.[1];
}

export async function resolveLatestVersion(
  framework: FrameworkId,
): Promise<LatestVersion> {
  const source = SOURCES[framework];
  try {
    let version: string | undefined;
    switch (framework) {
      case "swift":
        version = await githubLatest("ios-appstack-sdk");
        break;
      case "kotlin":
        version = await mavenLatest();
        break;
      case "react-native": {
        const value = await getJson<{ version?: string }>(
          "https://registry.npmjs.org/react-native-appstack-sdk/latest",
        );
        version = value.version;
        break;
      }
      case "flutter": {
        const value = await getJson<{ latest?: { version?: string } }>(
          "https://pub.dev/api/packages/appstack_plugin",
        );
        version = value.latest?.version;
        break;
      }
      case "unity":
        version = await githubLatest("appstack-unity-sdk");
        break;
    }
    if (!version) throw new Error("The registry response did not include a version.");
    return { version, source };
  } catch (error) {
    return {
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parts(version: string): [number, number, number] | undefined {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = parts(left);
  const b = parts(right);
  if (!a || !b) return left.localeCompare(right);
  for (let index = 0; index < 3; index++) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!;
  }
  return 0;
}
