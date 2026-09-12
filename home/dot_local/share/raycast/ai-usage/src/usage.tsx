import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { Provider, resetText, usageText } from "./model";
import { color, dashboards, useUsage } from "./shared";

function UsageActions({ provider, refresh }: { provider: Provider; refresh: () => void }) {
  return (
    <ActionPanel>
      <Action
        title="Refresh Usage"
        onAction={refresh}
        icon={Icon.ArrowClockwise}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
      />
      <Action.OpenInBrowser title="Open Usage Dashboard" url={dashboards[provider.name]} />
    </ActionPanel>
  );
}

export default function Usage() {
  const { data, isLoading, revalidate } = useUsage();

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter Claude, Fable, or Codex limits">
      {data?.map((provider) => {
        const timestamp = provider.updatedAt && new Date(provider.updatedAt).toLocaleString();
        const status = timestamp ? `${provider.error ? "Saved" : "Updated"} ${timestamp}` : undefined;
        const retry = provider.retryAt && `Retry after ${new Date(provider.retryAt).toLocaleTimeString()}`;
        const actions = <UsageActions provider={provider} refresh={revalidate} />;

        return (
          <List.Section key={provider.name} title={provider.name} subtitle={status}>
            {(provider.error || !provider.limits.length) && (
              <List.Item
                title={provider.error ?? "No usage windows reported"}
                subtitle={retry}
                icon={Icon.ExclamationMark}
                actions={actions}
              />
            )}
            {provider.limits.map((limit) => {
              const tooltip = limit.resetsAt
                ? `Resets ${new Date(limit.resetsAt).toLocaleString()}`
                : "No reset time reported";

              return (
                <List.Item
                  key={limit.id}
                  title={limit.label}
                  subtitle={resetText(limit)}
                  icon={{ source: Icon.CircleFilled, tintColor: color(limit) }}
                  accessories={[{ text: usageText(limit), tooltip }]}
                  actions={actions}
                />
              );
            })}
          </List.Section>
        );
      })}
    </List>
  );
}
